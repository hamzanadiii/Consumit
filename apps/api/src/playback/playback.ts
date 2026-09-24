import { randomUUID } from 'node:crypto'
import { metrics } from '@opentelemetry/api'
import { playbackProviderListSchema, playbackSessionSchema, type PlaybackEvents, type PlaybackFailureRequest, type PlaybackProvider, type PlaybackSession, type ResolvePlaybackRequest } from '@consumit/contracts'
import { sourceIdentity, type ProviderRegistration } from '@consumit/provider-sdk'
import { ApiError } from '../http/errors.ts'
import { proxyUrl } from './embed-tokens.ts'
import { collectSubtitleCandidates, createResolver, dedupeSubtitleTracks, type ResolvedSource, type SubtitleCandidate } from './resolver.ts'
import type { PlaybackStore } from './state.ts'

type SessionRecord = { owner: string; input: ResolvePlaybackRequest; session: PlaybackSession; excluded: string[]; group: string; fallbackAt?: number[] }
export interface Playback {
  resolve(owner: string, input: ResolvePlaybackRequest, signal: AbortSignal): Promise<PlaybackSession>
  recover(owner: string, id: string, failure: PlaybackFailureRequest, refresh: boolean, signal: AbortSignal): Promise<PlaybackSession>
  listProviders(input: ResolvePlaybackRequest, signal: AbortSignal): Promise<PlaybackProvider[]>
  switchProvider(owner: string, id: string, providerId: string, signal: AbortSignal): Promise<PlaybackSession>
  events(owner: string, id: string, events: PlaybackEvents): Promise<void>
}
const unavailable = () => new ApiError('PLAYBACK_UNAVAILABLE', 'No compatible playback source is available.', { retryable: true })
// Signed upstream URLs live 5–30 minutes while a title plays for hours, so
// mid-stream re-resolution is routine. Bound automatic provider switches to a
// rolling window (not a session-lifetime total) so a long watch never dies
// after three early switches, while a true outage still stops quickly.
export const MAX_FALLBACKS_PER_WINDOW = 3
export const FALLBACK_WINDOW_MS = 10 * 60_000
function prunedFallbacks(fallbackAt: readonly number[] | undefined, now = Date.now()): number[] {
  if (!Array.isArray(fallbackAt)) return []
  return fallbackAt.filter((stamp) => typeof stamp === 'number' && Number.isFinite(stamp) && now - stamp < FALLBACK_WINDOW_MS)
}

export function createPlayback({ providers, store, region, workerUrl, hmacSecret }: { providers: readonly ProviderRegistration[]; store: PlaybackStore; region: string; workerUrl?: string | undefined; hmacSecret?: string | undefined }): Playback {
  if (workerUrl && !hmacSecret) throw new Error('Playback media Worker requires an HMAC secret.')
  // The resolver gates every source on hostile-output validation
  // (schema, expiry, allowlisted https media, no credentials/transforms).
  const resolver = createResolver(providers, { region, store, proxyAvailable: Boolean(workerUrl) })
  const providerHealth = (input: ResolvePlaybackRequest, providerId: string): 'ok' | 'degraded' => {
    const state = resolver.status(input.ref.kind).find((entry) => entry.id === providerId)
    if (!state) return 'ok'
    return state.openUntil > Date.now() || state.failures >= 3 ? 'degraded' : 'ok'
  }
  const events = metrics.getMeter('consumit.playback').createCounter('playback.events')
  const timing = metrics.getMeter('consumit.playback').createHistogram('playback.client.duration', { unit: 'ms' })
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
    return record
  }

  async function save(owner: string, input: ResolvePlaybackRequest, resolved: ResolvedSource, previous?: SessionRecord) {
    const { source, registration } = resolved
    const expiry = Math.min(Date.parse(source.expiresAt) - 5000, Date.now() + 30 * 60_000)
    // The provider seam validates each source. Proxy-enabled providers get a
    // signed, provider-scoped Worker URL when that delivery path is configured.
    const src = workerUrl && registration.proxy
      ? proxyUrl(workerUrl, hmacSecret!, source.url, registration, source.headers)
      : source.url
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
      source: { id: sourceIdentity(registration.adapter.id, input.ref, source.key), providerId: registration.adapter.id, type: source.type, src, ...(source.qualityHint ? { qualityHint: source.qualityHint } : {}), expiresAt: new Date(expiry).toISOString(), subtitles: subtitles.filter((track) => track.format === 'vtt'), skipSegments: source.skipSegments ?? [] },
      expiresAt: previous?.session.expiresAt ?? new Date(Date.now() + 4 * 3600_000).toISOString(),
      fallbackCount: windowedFallbacks.length,
      capabilities: { refresh: true, fallback: windowedFallbacks.length < MAX_FALLBACKS_PER_WINDOW, externalSubtitles: subtitles.some((track) => track.format === 'vtt') },
    }
    playbackSessionSchema.parse(session)
    await store.set(`session:${session.id}`, JSON.stringify({ owner, input, session, group: registration.upstreamGroup, excluded: previous?.excluded ?? [], fallbackAt: windowedFallbacks } satisfies SessionRecord), (Date.parse(session.expiresAt) - Date.now()) / 1000)
    return session
  }

  return {
    async resolve(owner, input, signal) {
      const result = await resolver.resolve(input, signal)
      if (!result || signal.aborted) throw unavailable()
      return save(owner, input, result)
    },
    async listProviders(input) {
      // Fixed fleet, no fan-out: Watch opens resolve exactly one provider
      // (the waterfall winner). The menu lists every eligible mirror with
      // its breaker health; tapping one resolves it fresh and auto-advances
      // on failure. No per-provider upstream work happens here, so opening
      // Watch never burns rate limits or trips upstream IP blocks.
      const eligible = providers
        .filter((registration) => {
          if (!registration.enabled || (registration.proxy && !workerUrl) || !registration.approvedRegions.includes(region)) return false
          return (registration.mediaKinds as readonly string[]).includes(input.ref.kind)
        })
        .sort((a, b) => Number(a.proxy) - Number(b.proxy) || (b.priority ?? 0) - (a.priority ?? 0))
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
        const target = providers.find((registration) => registration.adapter.id === providerId && registration.enabled && (!registration.proxy || workerUrl) && registration.approvedRegions.includes(region))
        if (!target) throw new ApiError('BAD_REQUEST', 'Choose an available playback provider.')
        if (record.session.source.providerId === providerId) return record.session
        // Manual switches ride outside the automatic fallback budget and never
        // extend the exclusion history: the member explicitly chose this
        // provider, including retrying one that failed before. Route-level
        // rate limits still bound switching.
        const excluded = record.excluded.filter((group) => group !== target.upstreamGroup)
        const result = await resolver.resolve(record.input, signal, excluded, providerId, true)
        if (!result || signal.aborted) throw unavailable()
        return save(owner, record.input, result, record)
      } finally { await store.release(`recovery:${id}`, lock) }
    },
    async recover(owner, id, failure, refresh, signal) {
      const lock = await claimRecovery(id)
      try {
        const record = await read(owner, id)
        if (record.session.source.id !== failure.sourceId) return record.session
        if (!refresh) {
          const windowed = prunedFallbacks(record.fallbackAt)
          if (windowed.length >= MAX_FALLBACKS_PER_WINDOW) throw unavailable()
          record.excluded.push(record.group)
          windowed.push(Date.now())
          record.fallbackAt = windowed
          record.session.fallbackCount = windowed.length
          record.session.capabilities.fallback = windowed.length < MAX_FALLBACKS_PER_WINDOW
          resolver.recordFailure(record.session.source.providerId, record.input.ref.kind)
          await store.set(`session:${id}`, JSON.stringify(record), (Date.parse(record.session.expiresAt) - Date.now()) / 1000)
        }
        const result = await resolver.resolve(record.input, signal, record.excluded, refresh ? record.session.source.providerId : undefined, true)
        if (!result || signal.aborted) {
          // A failed same-provider refresh still teaches the circuit breaker:
          // without this, a dead preferred provider would be retried at full
          // 8s cost on every expiry instead of cooling down and letting the
          // follow-up fallback win fast.
          if (refresh) resolver.recordFailure(record.session.source.providerId, record.input.ref.kind)
          throw unavailable()
        }
        return save(owner, record.input, result, record)
      } finally { await store.release(`recovery:${id}`, lock) }
    },
    async events(owner, id, batch) {
      const record = await read(owner, id)
      for (const event of batch.events) {
        const attributes = { provider: record.session.source.providerId, event: event.type }
        events.add(1, attributes)
        if (event.elapsedMs !== undefined) timing.record(event.elapsedMs, attributes)
      }
    },
  }
}
