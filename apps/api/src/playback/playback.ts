import { randomUUID } from 'node:crypto'
import { metrics } from '@opentelemetry/api'
import { playbackProviderListSchema, playbackSessionSchema, type PlaybackEvents, type PlaybackFailureRequest, type PlaybackProvider, type PlaybackSession, type ResolvePlaybackRequest } from '@consumit/contracts'
import { isRelayMediaUrl, sourceIdentity, type ProviderRegistration } from '@consumit/provider-sdk'
import { ApiError } from '../http/errors.ts'
import { collectSubtitleCandidates, createResolver, dedupeSubtitleTracks, type ResolvedSource, type SubtitleCandidate } from './resolver.ts'
import type { PlaybackStore } from './state.ts'

type SessionRecord = { owner: string; input: ResolvePlaybackRequest; session: PlaybackSession; excluded: string[]; excludedAt?: Record<string, number>; group: string; fallbackAt?: number[] }
export interface Playback {
  resolve(owner: string, input: ResolvePlaybackRequest, signal: AbortSignal): Promise<PlaybackSession>
  recover(owner: string, id: string, failure: PlaybackFailureRequest, refresh: boolean, signal: AbortSignal): Promise<PlaybackSession>
  listProviders(input: ResolvePlaybackRequest, signal: AbortSignal): Promise<PlaybackProvider[]>
  switchProvider(owner: string, id: string, providerId: string, signal: AbortSignal): Promise<PlaybackSession>
  events(owner: string, id: string, events: PlaybackEvents): Promise<void>
  providerStatus?(kind: ResolvePlaybackRequest['ref']['kind']): Array<{ id: string; failures: number; playbackFailures: number; openUntil: number; outcomes: number; success: number; latency: number }>
  resetProviderCircuit?(providerId: string, kind: ResolvePlaybackRequest['ref']['kind']): Promise<void>
}
const unavailable = () => new ApiError('PLAYBACK_UNAVAILABLE', 'No compatible playback source is available.', { retryable: true })
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

export function createPlayback({ providers, store, region, providerOrders }: { providers: readonly ProviderRegistration[]; store: PlaybackStore; region: string; providerOrders?: Record<'movie' | 'series' | 'anime', string[]> | undefined }): Playback {
  // The resolver gates every source on hostile-output validation
  // (schema, expiry, allowlisted https media, no credentials/transforms).
  const resolver = createResolver(providers, { region, store, ...(providerOrders ? { providerOrders } : {}) })
  const providerHealth = (input: ResolvePlaybackRequest, providerId: string): 'ok' | 'degraded' => {
    const state = resolver.status(input.ref.kind).find((entry) => entry.id === providerId)
    if (!state) return 'ok'
    return state.openUntil > Date.now() || state.failures >= 3 ? 'degraded' : 'ok'
  }
  const events = metrics.getMeter('consumit.playback').createCounter('playback.events')
  const timing = metrics.getMeter('consumit.playback').createHistogram('playback.client.duration', { unit: 'ms' })
  const selected = metrics.getMeter('consumit.playback').createCounter('playback.source.selected')
  const recoveries = metrics.getMeter('consumit.playback').createCounter('playback.recovery')
  async function claimRecovery(id: string): Promise<string> {
    const token = randomUUID()
    if (!await store.claim(`recovery:${id}`, token, 30)) throw new ApiError('CONFLICT', 'Playback is already recovering.', { retryable: true })
    return token
  }

  async function read(owner: string, id: string) {
    const raw = await store.get(`session:${id}`)
    if (!raw) throw new ApiError('NOT_FOUND', 'This playback session expired. Start playback again.', { retryable: true })
    const record = JSON.parse(raw) as SessionRecord
    if (record.owner !== owner || Date.parse(record.session.expiresAt) <= Date.now()) throw new ApiError('NOT_FOUND', 'Playback session not found.')
    if (record.session.source.delivery !== 'direct' || isRelayMediaUrl(record.session.source.src)) {
      throw new ApiError('NOT_FOUND', 'This playback session needs a new source. Start playback again.', { retryable: true })
    }
    return record
  }

  async function save(owner: string, input: ResolvePlaybackRequest, resolved: ResolvedSource, previous?: SessionRecord) {
    const { source, registration } = resolved
    const expiry = Math.min(Date.parse(source.expiresAt) - 5000, Date.now() + 30 * 60_000)
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
      source: { id: sourceIdentity(registration.adapter.id, input.ref, source.key), providerId: registration.adapter.id, type: source.type, src: source.url, ...(source.qualityHint ? { qualityHint: source.qualityHint } : {}), delivery: resolved.delivery, expiresAt: new Date(expiry).toISOString(), subtitles: subtitles.filter((track) => track.format === 'vtt'), skipSegments: source.skipSegments ?? [] },
      expiresAt: previous?.session.expiresAt ?? new Date(Date.now() + 4 * 3600_000).toISOString(),
      fallbackCount: windowedFallbacks.length,
      capabilities: { refresh: true, fallback: windowedFallbacks.length < MAX_FALLBACKS_PER_WINDOW, externalSubtitles: subtitles.some((track) => track.format === 'vtt') },
    }
    playbackSessionSchema.parse(session)
    await store.set(`session:${session.id}`, JSON.stringify({ owner, input, session, group: registration.upstreamGroup, excluded: previous?.excluded ?? [], excludedAt: previous?.excludedAt ?? {}, fallbackAt: windowedFallbacks } satisfies SessionRecord), (Date.parse(session.expiresAt) - Date.now()) / 1000)
    selected.add(1, { provider: registration.adapter.id, kind: input.ref.kind, region, delivery: resolved.delivery, surface: owner.startsWith('embed') ? 'embed' : 'watch', action: previous ? previous.session.source.providerId === registration.adapter.id ? 'refresh' : 'switch' : 'resolve' })
    return session
  }

  return {
    providerStatus(kind) { return resolver.status(kind) },
    resetProviderCircuit(providerId, kind) { return resolver.reset(providerId, kind) },
    async resolve(owner, input, signal) {
      const result = await resolver.resolve(input, signal)
      if (!result || signal.aborted) throw unavailable()
      return save(owner, input, result)
    },
    async listProviders(input) {
      // Internal diagnostic route only: normal Watch never requests a server
      // roster. This is a fixed config snapshot with breaker health, not a
      // per-provider upstream probe, so it never consumes provider quota.
      const eligible = providers
        .filter((registration) => {
          if (!registration.enabled || !registration.approvedRegions.includes(region)) return false
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
          deliveryMode: 'direct',
          available: true,
          subtitles: [],
        } satisfies PlaybackProvider)
      }
      return playbackProviderListSchema.parse({ providers: listed }).providers
    },
    async switchProvider(owner, id, providerId, signal) {
      const lock = await claimRecovery(id)
      try {
        const record = await read(owner, id)
        const target = providers.find((registration) => registration.adapter.id === providerId && registration.enabled && registration.approvedRegions.includes(region))
        if (!target) throw new ApiError('BAD_REQUEST', 'Choose an available playback provider.')
        if (record.session.source.providerId === providerId) return record.session
        // Manual switches ride outside the automatic fallback budget and never
        // extend the exclusion history: the member explicitly chose this
        // provider, including retrying one that failed before. Route-level
        // rate limits still bound switching.
        const excluded = record.excluded.filter((group) => group !== target.upstreamGroup)
        const result = await resolver.resolve(record.input, signal, excluded, providerId, true)
        if (!result || signal.aborted) throw unavailable()
        record.excluded = []
        record.excludedAt = {}
        return save(owner, record.input, result, record)
      } finally { await store.release(`recovery:${id}`, lock) }
    },
    async recover(owner, id, failure, refresh, signal) {
      const lock = await claimRecovery(id)
      try {
        const record = await read(owner, id)
        if (record.session.source.id !== failure.sourceId) return record.session
        const now = Date.now()
        record.excludedAt ??= Object.fromEntries(record.excluded.map((group) => [group, now]))
        if (!refresh) {
          const windowed = prunedFallbacks(record.fallbackAt)
          if (windowed.length >= MAX_FALLBACKS_PER_WINDOW) throw unavailable()
          const order = providerOrders?.[record.input.ref.kind] ?? providers
            .filter((provider) => provider.mediaKinds.includes(record.input.ref.kind))
            .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
            .map((provider) => provider.adapter.id)
          const position = order.indexOf(record.session.source.providerId)
          const attempted = position >= 0 ? order.slice(0, position + 1) : [record.session.source.providerId]
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
          record.session.capabilities.fallback = windowed.length < MAX_FALLBACKS_PER_WINDOW
          resolver.recordFailure(record.session.source.providerId, record.input.ref.kind, failureCause(failure))
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
        const result = await resolver.resolve(record.input, signal, record.excluded, refresh ? record.session.source.providerId : undefined, true)
        if (!result || signal.aborted) {
          // A failed same-provider refresh still teaches the circuit breaker:
          // without this, a dead preferred provider would be retried at full
          // 8s cost on every expiry instead of cooling down and letting the
          // follow-up fallback win fast.
          if (refresh) resolver.recordFailure(record.session.source.providerId, record.input.ref.kind, failureCause(failure))
          recoveries.add(1, { ...recoveryAttributes, outcome: 'failed' })
          throw unavailable()
        }
        const next = await save(owner, record.input, result, record)
        recoveries.add(1, { ...recoveryAttributes, outcome: 'success' })
        return next
      } finally { await store.release(`recovery:${id}`, lock) }
    },
    async events(owner, id, batch) {
      const record = await read(owner, id)
      for (const event of batch.events) {
        const delivery = record.session.source.delivery
        const attributes = { provider: record.session.source.providerId, kind: record.input.ref.kind, region, delivery, surface: record.owner.startsWith('embed') ? 'embed' : 'watch', browser: event.browser ?? 'unknown', event: event.type }
        events.add(1, attributes)
        if (event.elapsedMs !== undefined) timing.record(event.elapsedMs, attributes)
      }
    },
  }
}
