import { type ProviderRegistration, type ProviderSource, providerResultSchema, validatedSources } from '@consumit/provider-sdk'
import { playbackTrackSchema, type ResolvePlaybackRequest } from '@consumit/contracts'
import { metrics, trace, SpanStatusCode } from '@opentelemetry/api'
import { createHash } from 'node:crypto'
import type { z } from 'zod'
import type { PlaybackStore } from './state.ts'

export type ResolvedSource = { source: ProviderSource; registration: ProviderRegistration; subtitles: SubtitleCandidate[] }
/** A caption track plus the provider context needed to lease it: subtitle and
 *  video sources stay independent decisions behind one resolve. */
export type SubtitleCandidate = { track: z.infer<typeof playbackTrackSchema>; hosts: readonly string[]; headers: Record<string, string> }
/** Legacy hedged-subtitle window; kept for compatibility. Static sequential
 *  resolution returns the winning provider's tracks immediately. */
export const SUBTITLE_SETTLE_MS = 500
const MAX_SESSION_SUBTITLES = 24

/** Tracks from every validated source, not just the played one. */
export function collectSubtitleCandidates(sources: readonly ProviderSource[], registration: ProviderRegistration): SubtitleCandidate[] {
  const candidates: SubtitleCandidate[] = []
  for (const source of sources) {
    for (const track of source.subtitles) {
      let sameHost = false
      try { sameHost = new URL(track.url).hostname === new URL(source.url).hostname } catch { continue }
      const headers = sameHost ? source.headers
        : Object.fromEntries(Object.entries(source.headers).filter(([name]) => !/^(cookie|authorization)$/i.test(name)))
      candidates.push({ track, hosts: [...registration.mediaHosts], headers })
    }
  }
  return candidates
}

export function dedupeSubtitleTracks(candidates: readonly SubtitleCandidate[]): SubtitleCandidate[] {
  const seenUrls = new Set<string>()
  const seenIds = new Set<string>()
  const tracks: SubtitleCandidate[] = []
  for (const candidate of candidates) {
    // Dedupe by both URL and track id. URLs alone are not enough: carried
    // stale session tracks can keep their original ids while fresh candidates
    // carry new upstream HTTPS URLs,
    // so the same logical track would otherwise survive as a duplicate and
    // surface downstream as two `external:consumit-external-<id>` options
    // with the same React key.
    if (seenUrls.has(candidate.track.url) || seenIds.has(candidate.track.id) || tracks.length >= MAX_SESSION_SUBTITLES) continue
    seenUrls.add(candidate.track.url)
    seenIds.add(candidate.track.id)
    tracks.push(candidate)
  }
  return tracks
}
type Health = { active: number; failures: number; openUntil: number; window: number; requests: number; latency: number; success: number; outcomes: number }
type Cached = { value: ResolvedSource | null; until: number }
type Pending = { controller: AbortController; promise: Promise<ResolvedSource | null>; waiters: number }

function cancellable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason)
    if (signal.aborted) abort()
    else signal.addEventListener('abort', abort, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
  })
}

export function createResolver(providers: readonly ProviderRegistration[], options: { region: string; deadlineMs?: number; /** Ignored: kept for compatibility with hedged callers. */ hedgeMs?: number; now?: () => number; store?: PlaybackStore }) {
  const now = options.now ?? Date.now
  const cache = new Map<string, Cached>()
  const pending = new Map<string, Pending>()
  const health = new Map<string, Health>()
  const hydrated = new Set<string>()
  const meter = metrics.getMeter('consumit.playback')
  const attempts = meter.createCounter('provider.attempts')
  const latency = meter.createHistogram('provider.resolve.duration', { unit: 'ms' })
  const healthKey = (id: string, kind: ResolvePlaybackRequest['ref']['kind']) => `provider-health:v1:${options.region}:${kind}:${id}`
  function state(id: string, kind: ResolvePlaybackRequest['ref']['kind']) {
    const key = healthKey(id, kind)
    let value = health.get(key)
    if (!value) { value = { active: 0, failures: 0, openUntil: 0, window: now(), requests: 0, latency: 0, success: 0, outcomes: 0 }; health.set(key, value) }
    return value
  }

  async function hydrate(id: string, kind: ResolvePlaybackRequest['ref']['kind']) {
    const key = healthKey(id, kind)
    if (!options.store || hydrated.has(key)) return
    hydrated.add(key)
    try {
      const raw = await options.store.get(key)
      if (!raw) return
      const row = JSON.parse(raw) as Partial<Health>
      if ([row.failures, row.openUntil, row.latency, row.success, row.outcomes].every((value) => typeof value === 'number' && Number.isFinite(value))) {
        health.set(key, { active: 0, requests: 0, window: now(), failures: row.failures!, openUntil: row.openUntil!, latency: row.latency!, success: row.success!, outcomes: row.outcomes! })
      }
    } catch { /* Shared ranking is an optimization, never an availability dependency. */ }
  }

  function persist(id: string, kind: ResolvePlaybackRequest['ref']['kind'], value: Health) {
    if (!options.store) return
    const row = { failures: value.failures, openUntil: value.openUntil, latency: value.latency, success: value.success, outcomes: value.outcomes }
    void options.store.set(healthKey(id, kind), JSON.stringify(row), 24 * 3600).catch(() => undefined)
  }

  async function attempt(registration: ProviderRegistration, input: ResolvePlaybackRequest, signal: AbortSignal): Promise<ResolvedSource | null> {
    const current = state(registration.adapter.id, input.ref.kind)
    if (current.window + 60000 <= now()) { current.window = now(); current.requests = 0 }
    const ceiling = current.failures >= 3 ? 1 : registration.concurrency
    if (current.openUntil > now() || current.active >= ceiling || current.requests >= registration.requestsPerMinute) return null
    current.active++; current.requests++
    const started = now()
    return trace.getTracer('consumit.playback').startActiveSpan('provider.resolve', async (span) => {
      span.setAttribute('provider.id', registration.adapter.id)
      try {
        const result = await cancellable(registration.adapter.resolve({ ref: input.ref, region: options.region, audioLanguage: input.audioLanguage }, signal), signal)
        const parsed = providerResultSchema.safeParse(result)
        if (parsed.success && ((!parsed.data.ok && (parsed.data.code === 'empty' || parsed.data.code === 'cancelled')) || (parsed.data.ok && !parsed.data.sources.length))) {
          current.outcomes++; attempts.add(1, { provider: registration.adapter.id, outcome: 'empty' }); return null
        }
        const validated = validatedSources(result, registration, now())
        const tracks = collectSubtitleCandidates(validated, registration)
        const matching = validated.filter((source) => input.capabilities[source.type])
        // Hostile-output validation already ran in validatedSources (schema,
        // expiry, allowlisted https media, no credentials/transforms).
        // Configured providers resolve directly with no approval step.
        const candidates = matching
        const targetHeight = input.capabilities.maxHeight ?? 1080
        const qualityScore = (source: ProviderSource) => source.height === undefined ? 10_000
          : source.height <= targetHeight ? 5_000 + source.height : 4_000 - source.height
        candidates.sort((a, b) => Number(b.language === 'original') - Number(a.language === 'original')
          || Number(b.language === input.audioLanguage) - Number(a.language === input.audioLanguage)
          || Number(input.capabilities.nativeHls && b.type === 'hls') - Number(input.capabilities.nativeHls && a.type === 'hls')
          || qualityScore(b) - qualityScore(a))
        const source = candidates[0]
        if (!source) { current.outcomes++; if (!validated.length) current.failures++; attempts.add(1, { provider: registration.adapter.id, outcome: 'empty' }); return null }
        current.failures = 0; current.openUntil = 0; current.success++
        current.latency = current.latency ? current.latency * 0.8 + (now() - started) * 0.2 : now() - started
        current.outcomes++
        attempts.add(1, { provider: registration.adapter.id, outcome: 'success' })
        return { source, registration, subtitles: tracks }
      } catch {
        if (!signal.aborted || signal.reason?.name === 'TimeoutError') { current.failures++; current.outcomes++ }
        span.setStatus({ code: SpanStatusCode.ERROR })
        attempts.add(1, { provider: registration.adapter.id, outcome: signal.aborted ? 'cancelled' : 'error' })
        return null
      } finally {
        current.active--
        if (current.failures >= 3) current.openUntil = now() + 60000
        latency.record(now() - started, { provider: registration.adapter.id })
        persist(registration.adapter.id, input.ref.kind, current)
        span.end()
      }
    })
  }

  async function run(input: ResolvePlaybackRequest, excluded: readonly string[], parent: AbortSignal, preferred?: string) {
    await Promise.all(providers.map((provider) => hydrate(provider.adapter.id, input.ref.kind)))
    // Static order: operator priority first (higher tries first), ties keep
    // the configured file order. No learned re-ranking, no hedging, no
    // upstream-group dedupe window — the player tries the first provider,
    // then the next, so the server list stays fixed.
    // Kind routing is load-bearing: without it a movie provider answers an
    // anime ref by numeric-id coincidence (AniList 793 played as TMDB 793).
    // Menu listing and probes already filter this way; the waterfall must too
    // — including manual switches, where a mismatch fails honest instead of
    // playing the wrong title.
    const candidates = providers.filter((p) => p.enabled && p.approvedRegions.includes(options.region) && (p.mediaKinds as readonly string[]).includes(input.ref.kind) && !excluded.includes(p.upstreamGroup) && (!preferred || p.adapter.id === preferred))
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
    if (!candidates.length) return null
    const controller = new AbortController()
    const deadline = setTimeout(() => controller.abort(new DOMException('Resolution deadline reached', 'TimeoutError')), options.deadlineMs ?? 12000)
    const signal = AbortSignal.any([parent, controller.signal])
    // One hung provider must not hold the whole request: bound each
    // sequential attempt so a stalled first provider falls through to the
    // next instead of burning the full deadline. Slow-but-good providers
    // carry their own budget, still capped by the total deadline.
    const deadlineMs = options.deadlineMs ?? 12000
    try {
      for (const candidate of candidates) {
        if (signal.aborted) return null
        const perAttempt = new AbortController()
        const onAbort = () => perAttempt.abort(signal.reason)
        signal.addEventListener('abort', onAbort, { once: true })
        const attemptSignal = AbortSignal.any([signal, perAttempt.signal])
        let timer: ReturnType<typeof setTimeout> | undefined
        const budget = Math.min(candidate.attemptMs ?? 5000, deadlineMs)
        const timeout = new Promise<null>((resolve) => { timer = setTimeout(() => { perAttempt.abort(new DOMException('Provider attempt timed out', 'TimeoutError')); resolve(null) }, budget) })
        try {
          const value = await Promise.race([attempt(candidate, input, attemptSignal), timeout])
          if (value) return { ...value, subtitles: dedupeSubtitleTracks(value.subtitles) }
        } finally { clearTimeout(timer); signal.removeEventListener('abort', onAbort); perAttempt.abort() }
      }
      return null
    } finally { clearTimeout(deadline); controller.abort() }
  }

  function invalidateProvider(providerId: string) {
    // One playback failure must not evict every title's good source (the old
    // cache.clear() caused a thundering herd that tripped provider rate
    // limits and turned one failure into "No compatible source" everywhere).
    // Drop only entries that served this provider plus stale negative caches;
    // healthy titles keep playing from cache while the failed provider cools.
    for (const [key, cached] of cache) {
      if (!cached.value || cached.value.registration.adapter.id === providerId) cache.delete(key)
    }
  }

  return {
    async resolve(input: ResolvePlaybackRequest, signal: AbortSignal, excluded: readonly string[] = [], preferred?: string, fresh = false): Promise<ResolvedSource | null> {
      if (signal.aborted) return null
      const key = JSON.stringify([input, options.region, excluded, preferred])
      const cached = cache.get(key)
      if (!fresh && cached && cached.until > now()) return cached.value
      if (fresh) cache.delete(key)
      let work = pending.get(key)
      if (!work) {
        if (pending.size >= 100) return null
        const controller = new AbortController()
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(options.deadlineMs ?? 12000)])
        const sharedKey = `access:${createHash('sha256').update(key).digest('hex')}`
        const discover = async () => {
          if (!fresh && options.store) {
            try {
              const raw = await cancellable(options.store.get(sharedKey), signal)
              if (raw) {
                const cached = JSON.parse(raw) as { provider: string; source: unknown }
                const registration = providers.find((entry) => entry.adapter.id === cached.provider && entry.enabled && entry.approvedRegions.includes(options.region) && !excluded.includes(entry.upstreamGroup) && (!preferred || preferred === entry.adapter.id) && state(entry.adapter.id, input.ref.kind).failures === 0)
                if (registration) {
                  const source = validatedSources({ ok: true, sources: [cached.source] }, registration, now())[0]
                  if (source && input.capabilities[source.type]) {
                    return { source, registration, subtitles: [] }
                  }
                }
              }
            } catch { /* Disposable access cache failure must not prevent fresh resolution. */ }
          }
          return run(input, excluded, signal, preferred)
        }
        const promise = discover().then((value) => {
          if (!controller.signal.aborted) {
            if (cache.size >= 500) cache.delete(cache.keys().next().value!)
            cache.set(key, { value, until: value ? Math.min(now() + 30000, Date.parse(value.source.expiresAt) - 30000) : now() + 3000 })
            if (value && options.store) {
              const ttl = Math.min(30, (Date.parse(value.source.expiresAt) - now() - 30000) / 1000)
              if (ttl > 0) void options.store.set(sharedKey, JSON.stringify({ provider: value.registration.adapter.id, source: value.source }), ttl).catch(() => undefined)
            }
          }
          return value
        }).finally(() => pending.delete(key))
        work = { controller, promise, waiters: 0 }; pending.set(key, work)
      }
      work.waiters++
      try { return await cancellable(work.promise, signal) } catch { return null }
      finally { if (--work.waiters === 0) work.controller.abort() }
    },
    recordFailure(providerId: string, kind: ResolvePlaybackRequest['ref']['kind']) { const value = state(providerId, kind); value.failures++; value.outcomes++; if (value.failures >= 3) value.openUntil = now() + 60000; persist(providerId, kind, value); invalidateProvider(providerId) },
    status(kind: ResolvePlaybackRequest['ref']['kind'] = 'movie') { return providers.map((p) => ({ id: p.adapter.id, enabled: p.enabled, ...state(p.adapter.id, kind) })) },
  }
}
