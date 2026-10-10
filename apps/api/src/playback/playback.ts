import { randomUUID } from 'node:crypto'
import { metrics } from '@opentelemetry/api'
import { playbackProviderListSchema, playbackSessionSchema, type PlaybackEvents, type PlaybackFailureRequest, type PlaybackProvider, type PlaybackSession, type PlaybackPreferences, type ResolvePlaybackRequest } from '@consumit/contracts'
import { allowedMediaUrl, isRelayMediaUrl, sourceIdentity, suppliesVideo, type ProviderHttp, type ProviderRegistration } from '@consumit/provider-sdk'
import { MAX_GRANT_MS } from '@consumit/media-relay'
import { ApiError } from '../http/errors.ts'
import { collectSubtitleCandidates, createResolver, dedupeSubtitleTracks, type ResolvedSource, type SubtitleCandidate } from './resolver.ts'
import type { PlaybackStore } from './state.ts'
import { supportsRequestedAudio } from './audio-policy.ts'
import { createSeparateAudio } from './separate-audio.ts'
import type { PlaybackRelay } from './relay.ts'

type SessionRecord = { owner: string; input: ResolvePlaybackRequest; session: PlaybackSession; excluded: string[]; excludedAt?: Record<string, number>; group: string; fallbackAt?: number[]; restartFallback?: boolean }
function withPreferences(input: ResolvePlaybackRequest, preferences?: PlaybackPreferences): ResolvePlaybackRequest {
  if (!preferences) return input
  return { ...input, preferences: { ...input.preferences, ...preferences }, ...(preferences.audioLanguage ? { audioLanguage: preferences.audioLanguage } : {}) }
}
export interface Playback {
  relayManifest(token: string, origin: string, signal: AbortSignal): Promise<string>
  listAudio(owner: string, id: string, sourceId: string, signal: AbortSignal): Promise<import('@consumit/contracts').SeparateAudioTrack[]>
  prepareAudio(owner: string, id: string, sourceId: string, trackId: string, signal: AbortSignal): Promise<import('@consumit/contracts').SeparateAudioSource>
  resolve(owner: string, input: ResolvePlaybackRequest, signal: AbortSignal): Promise<PlaybackSession>
  recover(owner: string, id: string, failure: PlaybackFailureRequest, refresh: boolean, signal: AbortSignal): Promise<PlaybackSession>
  listProviders(input: ResolvePlaybackRequest, signal: AbortSignal): Promise<PlaybackProvider[]>
  switchProvider(owner: string, id: string, providerId: string, signal: AbortSignal, preferences?: PlaybackPreferences): Promise<PlaybackSession>
  events(owner: string, id: string, events: PlaybackEvents): Promise<void>
  providerStatus?(kind: ResolvePlaybackRequest['ref']['kind']): Array<{ id: string; failures: number; playbackFailures: number; openUntil: number; outcomes: number; success: number; latency: number }>
  resetProviderCircuit?(providerId: string, kind: ResolvePlaybackRequest['ref']['kind']): Promise<void>
}
const unavailable = (input?: ResolvePlaybackRequest) => new ApiError('PLAYBACK_UNAVAILABLE', input?.ref.kind === 'anime' && input.audioLanguage.split('-')[0] === 'en'
  ? 'We couldn’t load an English dub for this episode. Try again or choose SUB.'
  : 'No compatible playback source is available.', { retryable: true })
// Signed upstream URLs live 5–30 minutes while a title plays for hours, so
// mid-stream re-resolution is routine. Bound automatic provider switches to a
// rolling window (not a session-lifetime total) so a long watch never dies
// after three early switches, while a true outage still stops quickly.
export const MAX_FALLBACKS_PER_WINDOW = 3
export const FALLBACK_WINDOW_MS = 10 * 60_000
/** Demotion signal for the resolver circuit. Definitive means the bytes are
 *  not coming back (gone-class source) or the direct path is blocked
 *  (a forbidden direct request) — both cool the
 *  provider five times longer than a transient stall. */
export function failureCause(failure: Pick<PlaybackFailureRequest, 'reason' | 'deliveryFailure'>): 'transient' | 'definitive' {
  if (failure.reason === 'unsupported' || failure.deliveryFailure === 'forbidden') return 'definitive'
  return 'transient'
}
function prunedFallbacks(fallbackAt: readonly number[] | undefined, now = Date.now()): number[] {
  if (!Array.isArray(fallbackAt)) return []
  return fallbackAt.filter((stamp) => typeof stamp === 'number' && Number.isFinite(stamp) && now - stamp < FALLBACK_WINDOW_MS)
}

export function createPlayback({ providers, store, region, providerOrders, audioHttp, audioOrigin, relay, relayOrigin }: { providers: readonly ProviderRegistration[]; store: PlaybackStore; region: string; providerOrders?: Record<'movie' | 'series' | 'anime', string[]> | undefined; audioHttp?: ProviderHttp; audioOrigin?: string; relay?: PlaybackRelay; relayOrigin?: string }): Playback {
  const separateAudio = createSeparateAudio(providers, region, audioHttp, audioOrigin)
  // The resolver gates every source on hostile-output validation
  // (schema, expiry, allowlisted https media, no credentials/transforms).
  // Only explicitly declared relay rows enter that tier. Worker host
  // approval and browser failures never convert a direct provider to relay.
  const resolver = createResolver(providers, { region, store, providerFilter: provider => (provider.deliveryMode ?? 'direct') === 'direct', ...(providerOrders ? { providerOrders } : {}) })
  const relayResolver = relay ? createResolver(providers, {
    region, store, healthScope: 'relay', providerFilter: provider => provider.deliveryMode === 'relay' && relay.includes(provider.adapter.id), sourceFilter: (source, registration) => relay.permits({ source, registration }),
    ...(providerOrders ? { providerOrders } : {}),
  }) : undefined
  const embedResolver = createResolver(providers, { region, store, healthScope: 'embed', providerFilter: provider => provider.deliveryMode === 'embed', ...(providerOrders ? { providerOrders } : {}) })
  const resolverFor = (delivery: PlaybackSession['source']['delivery']) => delivery === 'embed' ? embedResolver : delivery === 'relay' ? relayResolver : resolver
  // Each delivery tier gets its own finite provider waterfall and circuit.
  // A blocked browser path must not cool the same provider's edge path.
  const fallbackLimit = (input: ResolvePlaybackRequest) => relay ? Math.min(128, Math.max(MAX_FALLBACKS_PER_WINDOW,
    providers.filter(provider => provider.enabled && suppliesVideo(provider) && provider.approvedRegions.includes(region)
      && provider.mediaKinds.includes(input.ref.kind) && supportsRequestedAudio(provider, input)
      && (provider.deliveryMode !== 'relay' || relay.includes(provider.adapter.id)))
      .length)) : MAX_FALLBACKS_PER_WINDOW
  const providerHealth = (input: ResolvePlaybackRequest, providerId: string): 'ok' | 'degraded' => {
    const registration = providers.find(provider => provider.adapter.id === providerId)
    const state = resolverFor(registration?.deliveryMode ?? 'direct')?.status(input.ref.kind).find((entry) => entry.id === providerId)
    if (!state) return 'ok'
    return state.openUntil > Date.now() || state.failures >= 3 ? 'degraded' : 'ok'
  }
  const events = metrics.getMeter('consumit.playback').createCounter('playback.events')
  const timing = metrics.getMeter('consumit.playback').createHistogram('playback.client.duration', { unit: 'ms' })
  const selected = metrics.getMeter('consumit.playback').createCounter('playback.source.selected')
  const recoveries = metrics.getMeter('consumit.playback').createCounter('playback.recovery')
  const viewing = metrics.getMeter('consumit.playback').createCounter('playback.viewing.duration', { unit: 's' })
  async function claimRecovery(id: string): Promise<string> {
    const token = randomUUID()
    if (!await store.claim(`recovery:${id}`, token, 60)) throw new ApiError('CONFLICT', 'Playback is already recovering.', { retryable: true })
    return token
  }

  async function read(owner: string, id: string) {
    const raw = await store.get(`session:${id}`)
    if (!raw) throw new ApiError('NOT_FOUND', 'This playback session expired. Start playback again.', { retryable: true })
    const record = JSON.parse(raw) as SessionRecord
    if (record.owner !== owner || Date.parse(record.session.expiresAt) <= Date.now()) throw new ApiError('NOT_FOUND', 'Playback session not found.')
    const validDelivery = record.session.source.delivery === 'embed' ? record.session.source.type === 'iframe' && providers.some(provider => provider.deliveryMode === 'embed' && provider.adapter.id === record.session.source.providerId && provider.mediaKinds.includes(record.input.ref.kind) && allowedMediaUrl(record.session.source.src, provider.mediaHosts, provider.mediaHostPatterns))
      : record.session.source.delivery === 'direct' ? !isRelayMediaUrl(record.session.source.src)
      : record.session.source.delivery === 'relay' && relay && await relay.accepts(record.session.source.src, record.session.source.providerId)
    if (!validDelivery) {
      throw new ApiError('NOT_FOUND', 'This playback session needs a new source. Start playback again.', { retryable: true })
    }
    return record
  }

  async function save(owner: string, input: ResolvePlaybackRequest, resolved: ResolvedSource, previous?: SessionRecord, delivery: PlaybackSession['source']['delivery'] = 'direct') {
    const { source, registration } = resolved
    const qualityHint = source.qualityHint ?? (source.height ? `${source.height}p` : undefined)
    const qualityHeights = [...new Set((resolved.qualitySources ?? []).flatMap(candidate => candidate.height === undefined ? [] : [candidate.height]))].sort((a, b) => b - a)
    // A five-minute unknown-expiry freshness estimate is useful for cached
    // resolution, but would force healthy relay segments to fail on a clock.
    // Known upstream expiry and every unmarked source stay authoritative.
    // Stay below the edge's strict maximum even when its clock trails the
    // issuer slightly. Publish that actual cutoff so renewal agrees with it.
    const cutoff = Date.now() + MAX_GRANT_MS - (delivery === 'relay' ? 5000 : 0)
    const expiry = delivery === 'relay' && source.expiryEstimated === true ? cutoff
      : Math.min(Date.parse(source.expiresAt) - 5000, cutoff)
    const src = delivery === 'relay' ? await relay?.issue(resolved, expiry, relayOrigin ?? audioOrigin ?? '') : source.url
    if (!src || (registration.deliveryMode ?? 'direct') !== delivery) throw unavailable(input)
    // Captions aggregate across every provider that answered, plus the tracks
    // the member already had: a video fallback never takes the subtitles down
    // with it. Only upstream https WebVTT survives — legacy lease paths from
    // pre-removal sessions fail closed here and refresh into direct tracks.
    const carried: SubtitleCandidate[] = (previous?.session.source.subtitles ?? [])
      .filter((track) => track.format === 'vtt' && track.url.startsWith('https://'))
      .map((track) => ({ track, hosts: [], headers: {} }))
    const subtitles = dedupeSubtitleTracks([
      ...collectSubtitleCandidates([source], registration),
      ...resolved.subtitles,
      ...carried,
    ])
      .map(({ track }) => track)
      .filter((track) => track.format === 'vtt' && track.url.startsWith('https://'))
    const windowedFallbacks = prunedFallbacks(previous?.fallbackAt)
    const session: PlaybackSession = {
      id: previous?.session.id ?? randomUUID(), ref: input.ref,
      source: { id: sourceIdentity(registration.adapter.id, input.ref, source.key) + (delivery === 'relay' ? ':relay' : ''), providerId: registration.adapter.id, type: source.type, src, ...(qualityHint ? { qualityHint } : {}), ...(qualityHeights.length > 1 ? { qualityHeights } : {}), delivery, ...(source.frameSandbox ? { frameSandbox: source.frameSandbox } : {}), expiresAt: new Date(expiry).toISOString(), subtitles: (delivery === 'embed' ? [] : subtitles).filter((track) => track.format === 'vtt'), skipSegments: delivery === 'embed' ? [] : source.skipSegments ?? [] },
      expiresAt: previous?.session.expiresAt ?? new Date(Date.now() + 4 * 3600_000).toISOString(),
      fallbackCount: windowedFallbacks.length,
      capabilities: { refresh: delivery !== 'embed', fallback: windowedFallbacks.length < fallbackLimit(input), externalSubtitles: delivery !== 'embed' && subtitles.some((track) => track.format === 'vtt') },
    }
    playbackSessionSchema.parse(session)
    await store.set(`session:${session.id}`, JSON.stringify({ owner, input, session, group: registration.upstreamGroup, excluded: previous?.excluded ?? [], excludedAt: previous?.excludedAt ?? {}, fallbackAt: windowedFallbacks, restartFallback: previous?.restartFallback ?? false } satisfies SessionRecord), (Date.parse(session.expiresAt) - Date.now()) / 1000)
    selected.add(1, { provider: registration.adapter.id, kind: input.ref.kind, region, delivery, surface: owner.startsWith('embed') ? 'embed' : 'watch', action: previous ? previous.session.source.providerId === registration.adapter.id ? 'refresh' : 'switch' : 'resolve' })
    return session
  }

  return {
    async relayManifest(token: string, origin: string, signal: AbortSignal) {
      if (!relay) throw new ApiError('PLAYBACK_UNAVAILABLE', 'This relay is unavailable.')
      return relay.manifest(token, origin, signal)
    },
    async listAudio(owner, id, sourceId, signal) {
      const record = await read(owner, id)
      if (record.session.source.id !== sourceId) throw new ApiError('CONFLICT', 'The stream changed. Open Audio again.', { retryable: true })
      if (record.session.source.delivery === 'embed') return []
      return separateAudio.list(record.input, signal)
    },
    async prepareAudio(owner, id, sourceId, trackId, signal) {
      const record = await read(owner, id)
      if (record.session.source.id !== sourceId) throw new ApiError('CONFLICT', 'The stream changed. Open Audio again.', { retryable: true })
      if (record.session.source.delivery === 'embed') throw unavailable(record.input)
      return separateAudio.prepare(record.input, trackId, signal)
    },
    providerStatus(kind) { return providers.flatMap(provider => resolverFor(provider.deliveryMode ?? 'direct')?.status(kind).filter(state => state.id === provider.adapter.id) ?? []) },
    async resetProviderCircuit(providerId, kind) { await Promise.all([resolver.reset(providerId, kind), relayResolver?.reset(providerId, kind), embedResolver.reset(providerId, kind)]) },
    async resolve(owner, input, signal) {
      if (input.providerId) {
        const target = providers.find(provider => provider.adapter.id === input.providerId && provider.enabled && suppliesVideo(provider)
          && provider.approvedRegions.includes(region) && provider.mediaKinds.includes(input.ref.kind) && supportsRequestedAudio(provider, input)
          && (provider.deliveryMode !== 'relay' || relay?.includes(provider.adapter.id)))
        if (!target) throw new ApiError('BAD_REQUEST', 'Choose an available playback provider.')
        const delivery = target.deliveryMode ?? 'direct'
        const result = await resolverFor(delivery)?.resolve(input, signal, [], target.adapter.id, true)
        if (!result || signal.aborted) throw unavailable(input)
        return save(owner, input, result, undefined, delivery)
      }
      const result = await resolver.resolve(input, signal)
      if (signal.aborted) throw unavailable(input)
      if (result) return save(owner, input, result)
      const relayed = await relayResolver?.resolve(input, signal)
      if (signal.aborted) throw unavailable(input)
      if (relayed) return save(owner, input, relayed, undefined, 'relay')
      const framed = await embedResolver.resolve(input, signal)
      if (!framed || signal.aborted) throw unavailable(input)
      return save(owner, input, framed, undefined, 'embed')
    },
    async listProviders(input) {
      // Watch requests this fixed snapshot only when opening Server. No
      // existing session or upstream probe is needed, so it consumes no
      // provider quota, including when automatic startup has failed.
      const eligible = providers
        .filter((registration) => {
          if (!registration.enabled || !suppliesVideo(registration) || !registration.approvedRegions.includes(region)) return false
          if (registration.deliveryMode === 'relay' && !relay?.includes(registration.adapter.id)) return false
          if (!supportsRequestedAudio(registration, input)) return false
          return (registration.mediaKinds as readonly string[]).includes(input.ref.kind)
        })
        .sort((a, b) => (providerOrders ? providerOrders[input.ref.kind].indexOf(a.adapter.id) - providerOrders[input.ref.kind].indexOf(b.adapter.id) : (b.priority ?? 0) - (a.priority ?? 0)))
      const seen = new Set<string>()
      const listed: PlaybackProvider[] = []
      for (const registration of eligible) {
        if (seen.has(registration.adapter.id)) continue
        seen.add(registration.adapter.id)
        const dash = registration.adapter.id.indexOf('-')
        listed.push({
          id: registration.adapter.id, label: registration.adapter.id,
          // Mirror families: `vidcore-nova` serves family `vidcore`,
          // mirror `nova`; a whole-provider aggregate serves mirror `auto`.
          family: dash === -1 ? registration.adapter.id : registration.adapter.id.slice(0, dash),
          mirror: dash === -1 ? 'auto' : registration.adapter.id.slice(dash + 1),
          regions: [...registration.approvedRegions],
          health: providerHealth(input, registration.adapter.id),
          deliveryMode: registration.deliveryMode ?? 'direct',
          available: true,
          subtitles: [],
        } satisfies PlaybackProvider)
      }
      return playbackProviderListSchema.parse({ providers: listed }).providers
    },
    async switchProvider(owner, id, providerId, signal, preferences) {
      const lock = await claimRecovery(id)
      try {
        const record = await read(owner, id)
        const target = providers.find((registration) => registration.adapter.id === providerId && registration.enabled && suppliesVideo(registration) && registration.approvedRegions.includes(region))
        if (!target) throw new ApiError('BAD_REQUEST', 'Choose an available playback provider.')
        record.input = withPreferences(record.input, preferences)
        const delivery = target.deliveryMode ?? 'direct'
        if (record.session.source.providerId === providerId && !preferences && record.session.source.delivery === delivery) return record.session
        // Manual switches ride outside the automatic fallback budget and never
        // extend the exclusion history: the member explicitly chose this
        // provider, including retrying one that failed before. Route-level
        // rate limits still bound switching.
        const excluded = record.excluded.filter((group) => group !== target.upstreamGroup)
        const targetResolver = resolverFor(delivery)
        const result = await targetResolver?.resolve(record.input, signal, excluded, providerId, true)
        if (!result || signal.aborted) throw unavailable()
        record.excluded = []
        record.excludedAt = {}
        record.restartFallback = true
        return save(owner, record.input, result, record, delivery)
      } finally { await store.release(`recovery:${id}`, lock) }
    },
    async recover(owner, id, failure, refresh, signal) {
      const lock = await claimRecovery(id)
      try {
        const record = await read(owner, id)
        if (record.session.source.id !== failure.sourceId) return record.session
        record.input = withPreferences(record.input, failure.preferences)
        const now = Date.now()
        record.excludedAt ??= Object.fromEntries(record.excluded.map((group) => [group, now]))
        if (!refresh) {
          const windowed = prunedFallbacks(record.fallbackAt)
          if (windowed.length >= fallbackLimit(record.input)) throw unavailable()
          const order = providerOrders?.[record.input.ref.kind] ?? providers
            .filter((provider) => provider.mediaKinds.includes(record.input.ref.kind))
            .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
            .map((provider) => provider.adapter.id)
          const position = order.indexOf(record.session.source.providerId)
          // Manual selection jumps the waterfall; earlier providers have not
          // failed. Retry the configured order while excluding this selection.
          const attempted = !record.restartFallback && position >= 0 ? order.slice(0, position + 1) : [record.session.source.providerId]
          for (const id of attempted) {
            const group = providers.find((provider) => provider.adapter.id === id)?.upstreamGroup
            // Earlier misses retain their original cooling window.
            if (group && record.excludedAt[group] === undefined) record.excludedAt[group] = now
          }
          record.excludedAt[record.group] = now
          record.excluded = Object.entries(record.excludedAt).filter(([, at]) => now - at < FALLBACK_WINDOW_MS).map(([group]) => group)
          windowed.push(Date.now())
          record.fallbackAt = windowed
          record.session.fallbackCount = windowed.length
          record.session.capabilities.fallback = windowed.length < fallbackLimit(record.input)
          const currentResolver = resolverFor(record.session.source.delivery)
          currentResolver?.recordFailure(record.session.source.providerId, record.input.ref.kind, failureCause(failure))
          await store.set(`session:${id}`, JSON.stringify(record), (Date.parse(record.session.expiresAt) - Date.now()) / 1000)
        }
        record.excluded = Object.entries(record.excludedAt).filter(([, at]) => now - at < FALLBACK_WINDOW_MS).map(([group]) => group)
        // Refresh is a lease renewal for the member's selected server. A
        // different provider is only considered by the explicit fallback
        // request after this renewal has failed.
        const failedDelivery = record.session.source.delivery
        const recoveryAttributes = {
          action: refresh ? 'refresh' : 'fallback',
          delivery: failedDelivery,
          deliveryFailure: failure.deliveryFailure ?? 'none',
          reason: failure.reason,
        }
        let nextDelivery = failedDelivery
        const currentResolver = resolverFor(failedDelivery)
        let result = await currentResolver?.resolve(record.input, signal, record.excluded, refresh ? record.session.source.providerId : undefined, true)
        if (!result && !refresh && failedDelivery === 'direct' && relayResolver && !signal.aborted) {
          // Enter the relay tier only after the direct waterfall finishes.
          // Direct exclusions never suppress approved relay candidates.
          result = await relayResolver.resolve(record.input, signal, [], undefined, true)
          if (result) {
            nextDelivery = 'relay'
            record.excluded = []
            record.excludedAt = {}
          }
        }
        if (!result && !refresh && failedDelivery !== 'embed' && !signal.aborted) {
          result = await embedResolver.resolve(record.input, signal, [], undefined, true)
          if (result) { nextDelivery = 'embed'; record.excluded = []; record.excludedAt = {} }
        }
        if (!result || signal.aborted) {
          // A failed same-provider refresh still teaches the circuit breaker:
          // without this, a dead preferred provider would be retried at full
          // 8s cost on every expiry instead of cooling down and letting the
          // follow-up fallback win fast.
          if (refresh) currentResolver?.recordFailure(record.session.source.providerId, record.input.ref.kind, failureCause(failure))
          recoveries.add(1, { ...recoveryAttributes, outcome: 'failed' })
          throw unavailable()
        }
        if (!refresh) record.restartFallback = false
        const next = await save(owner, record.input, result, record, nextDelivery)
        recoveries.add(1, { ...recoveryAttributes, outcome: 'success' })
        return next
      } finally { await store.release(`recovery:${id}`, lock) }
    },
    async events(owner, id, batch) {
      const record = await read(owner, id)
      if (record.session.source.delivery === 'embed') return
      for (const event of batch.events) {
        const delivery = event.delivery ?? record.session.source.delivery
        const attributes = { provider: record.session.source.providerId, kind: record.input.ref.kind, region, delivery, surface: record.owner.startsWith('embed') ? 'embed' : 'watch', browser: event.browser ?? 'unknown', event: event.type }
        events.add(1, attributes)
        if (event.type === 'viewing' && event.elapsedMs !== undefined) viewing.add(Math.min(event.elapsedMs, 60_000) / 1000, attributes)
        else if (event.elapsedMs !== undefined) timing.record(event.elapsedMs, attributes)
      }
    },
  }
}
