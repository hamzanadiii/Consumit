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
  beginAttempt?(owner: string, input: ResolvePlaybackRequest, signal: AbortSignal, sessionId?: string, failure?: PlaybackFailureRequest): Promise<import('@consumit/contracts').PlaybackAttempt>
  continueAttempt?(owner: string, id: string, signal: AbortSignal): Promise<import('@consumit/contracts').PlaybackAttempt>
  cancelAttempt?(owner: string, id: string): Promise<void>
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
  const separateAudio = createSeparateAudio(providers, region, audioHttp, audioOrigin, { store, relay })
  // The resolver gates every source on hostile-output validation
  // (schema, expiry, allowlisted https media, no credentials/transforms).
  // Only explicitly declared relay rows enter that tier. Worker host
  // approval and browser failures never convert a direct provider to relay.
  const resolver = createResolver(providers, {
    region, store,
    providerFilter: provider => (provider.deliveryMode ?? 'direct') === 'direct',
    // CookieBakers is intermittent but frequently recovers between requests.
    // Keep it in the automatic Direct waterfall during cooldown; resolver
    // deadlines, concurrency and per-minute budgets still bound each attempt.
    alwaysAttemptProviderIds: ['cookiebakers'],
    ...(providerOrders ? { providerOrders } : {}),
  })
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
      source: { id: sourceIdentity(registration.adapter.id, input.ref, source.key) + (delivery === 'relay' ? ':relay' : ''), providerId: registration.adapter.id, type: source.type, src, ...(qualityHint ? { qualityHint } : {}), ...(qualityHeights.length > 1 ? { qualityHeights } : {}), delivery, ...(source.frameSandbox ? { frameSandbox: source.frameSandbox } : {}), ...(source.type === 'hls' && source.hlsSubtitlePlaylistFormat ? { hlsSubtitlePlaylistFormat: source.hlsSubtitlePlaylistFormat } : {}), expiresAt: new Date(expiry).toISOString(), subtitles: (delivery === 'embed' ? [] : subtitles).filter((track) => track.format === 'vtt'), skipSegments: delivery === 'embed' ? [] : source.skipSegments ?? [] },
      expiresAt: previous?.session.expiresAt ?? new Date(Date.now() + 4 * 3600_000).toISOString(),
      fallbackCount: windowedFallbacks.length,
      capabilities: { refresh: delivery !== 'embed', fallback: windowedFallbacks.length < fallbackLimit(input), externalSubtitles: delivery !== 'embed' && subtitles.some((track) => track.format === 'vtt') },
    }
    playbackSessionSchema.parse(session)
    await store.set(`session:${session.id}`, JSON.stringify({ owner, input, session, group: registration.upstreamGroup, excluded: previous?.excluded ?? [], excludedAt: previous?.excludedAt ?? {}, fallbackAt: windowedFallbacks, restartFallback: previous?.restartFallback ?? false } satisfies SessionRecord), (Date.parse(session.expiresAt) - Date.now()) / 1000)
    selected.add(1, { provider: registration.adapter.id, kind: input.ref.kind, region, delivery, surface: owner.startsWith('embed') ? 'embed' : 'watch', action: previous ? previous.session.source.providerId === registration.adapter.id ? 'refresh' : 'switch' : 'resolve' })
    return session
  }

  const eligible = (input: ResolvePlaybackRequest) => {
    const admin = providerOrders?.[input.ref.kind] ?? []
    const personal = input.preferences?.providerOrder ?? []
    const rank = (id: string, order: string[]) => { const index = order.indexOf(id); return index < 0 ? 10000 : index }
    const tier = (provider: ProviderRegistration) => provider.deliveryMode === 'embed' ? 2 : provider.deliveryMode === 'relay' ? 1 : 0
    return providers.filter(provider => provider.enabled && suppliesVideo(provider) && provider.approvedRegions.includes(region)
      && provider.mediaKinds.includes(input.ref.kind) && supportsRequestedAudio(provider, input)
      && (provider.deliveryMode !== 'relay' || relay?.includes(provider.adapter.id)))
      .sort((a, b) => rank(a.adapter.id, personal) - rank(b.adapter.id, personal) || tier(a) - tier(b)
        || rank(a.adapter.id, admin) - rank(b.adapter.id, admin) || (b.priority ?? 0) - (a.priority ?? 0))
  }
  type AttemptRecord = { owner: string; input: ResolvePlaybackRequest; order: string[]; visited: string[]; sessionId?: string; result?: PlaybackSession; cancelled?: boolean }
  const readAttempt = async (owner: string, id: string) => {
    const raw = await store.get(`attempt:${id}`)
    if (!raw) throw new ApiError('NOT_FOUND', 'This source search expired. Try again.')
    const record = JSON.parse(raw) as AttemptRecord
    if (record.owner !== owner || record.cancelled || await store.get(`attempt-cancelled:${id}`)) throw new ApiError('NOT_FOUND', 'Source search not found.')
    return record
  }
  const attemptView = (id: string, record: AttemptRecord): import('@consumit/contracts').PlaybackAttempt => record.result
    ? { status: 'ready', attemptId: id, tried: record.visited.length, total: record.order.length, session: record.result }
    : { status: record.visited.length >= record.order.length ? 'exhausted' : 'pending', attemptId: id, tried: record.visited.length, total: record.order.length }
  async function advanceAttempt(owner: string, id: string, signal: AbortSignal, update?: (record: AttemptRecord) => void) {
    const token = randomUUID(), lock = `attempt-lock:${id}`
    if (!await store.claim(lock, token, 30)) throw new ApiError('CONFLICT', 'This source search is already running.', { retryable: true })
    try {
      const record = await readAttempt(owner, id)
      if (update) {
        update(record)
        await store.set(`attempt:${id}`, JSON.stringify(record), 300)
      }
      if (record.result) {
        const source = record.result.source
        const registration = eligible(record.input).find(provider => provider.adapter.id === source.providerId)
        if (registration && Date.parse(source.expiresAt) > Date.now() + 5000 && (source.delivery === 'relay' ? await relay?.accepts(source.src, source.providerId) : allowedMediaUrl(source.src, registration.mediaHosts, registration.mediaHostPatterns))) return attemptView(id, record)
        delete record.result
      }
      const providerId = record.order.find(id => !record.visited.includes(id))
      if (!providerId) return attemptView(id, record)
      signal.throwIfAborted()
      record.visited.push(providerId)
      await store.set(`attempt:${id}`, JSON.stringify(record), 300)
      const registration = eligible(record.input).find(provider => provider.adapter.id === providerId)
      if (registration) {
        const delivery = registration.deliveryMode ?? 'direct'
        const result = await resolverFor(delivery)?.resolve(record.input, AbortSignal.any([signal, AbortSignal.timeout(10_000)]), [], providerId)
        signal.throwIfAborted()
        // Cancellation is separate from the step lock, so a long adapter cannot block it.
        await readAttempt(owner, id)
        if (result && eligible(record.input).some(provider => provider.adapter.id === providerId)) {
          const previous = record.sessionId ? await read(owner, record.sessionId) : undefined
          record.result = await save(owner, record.input, result, previous, delivery)
          record.sessionId = record.result.id
          await store.set(`session-attempt:${record.result.id}`, id, 4 * 3600)
        }
      }
      await readAttempt(owner, id)
      await store.set(`attempt:${id}`, JSON.stringify(record), 300)
      return attemptView(id, record)
    } finally { await store.release(lock, token) }
  }

  return {
    async beginAttempt(owner, input, signal, sessionId, failure) {
      const lock = sessionId ? await claimRecovery(sessionId) : undefined
      try {
      const previous = sessionId ? await read(owner, sessionId) : undefined
      if (previous && JSON.stringify(previous.input.ref) !== JSON.stringify(input.ref)) throw new ApiError('BAD_REQUEST', 'Use the current playback title.')
      if (previous && failure && previous.session.source.id !== failure.sourceId) throw new ApiError('CONFLICT', 'The playback source changed. Try again.')
      const mapped = sessionId ? await store.get(`session-attempt:${sessionId}`) : null
      let id = mapped ?? randomUUID(), record: AttemptRecord | undefined
      if (mapped) { try { record = await readAttempt(owner, mapped) } catch { id = randomUUID() } }
      const fresh = !record
      if (fresh) {
        record = { owner, input, order: eligible(input).map(provider => provider.adapter.id).slice(0, 128), visited: previous ? [previous.session.source.providerId] : [], ...(sessionId ? { sessionId } : {}) }
        await store.set(`attempt:${id}`, JSON.stringify(record), 300)
      }
      // Recovery and continuation mutate the same record under the step lock.
      return await advanceAttempt(owner, id, signal, current => {
        current.input = { ...withPreferences(current.input, input.preferences), audioLanguage: input.audioLanguage, capabilities: input.capabilities }
        if (failure && previous) {
          if (current.result?.source.id === failure.sourceId || fresh) resolverFor(previous.session.source.delivery)?.recordFailure(previous.session.source.providerId, input.ref.kind, failureCause(failure))
          delete current.result
        }
        current.visited = current.visited.filter(providerId => current.order.includes(providerId))
      })
      } finally { if (sessionId && lock) await store.release(`recovery:${sessionId}`, lock) }
    },
    continueAttempt: advanceAttempt,
    async cancelAttempt(owner, id) { await readAttempt(owner, id); await store.set(`attempt-cancelled:${id}`, '1', 300) },
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
      const permitted = eligible(input)
      const seen = new Set<string>()
      const listed: PlaybackProvider[] = []
      for (const registration of permitted) {
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
        const session = await save(owner, record.input, result, record, delivery)
        const attemptId = await store.get(`session-attempt:${id}`)
        if (attemptId) await store.set(`attempt-cancelled:${attemptId}`, '1', 300)
        return session
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
