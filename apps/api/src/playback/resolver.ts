import { type ProviderRegistration, type ProviderSource, providerResultSchema, validatedSources, suppliesVideo } from '@consumit/provider-sdk'
import { playbackTrackSchema, type ResolvePlaybackRequest } from '@consumit/contracts'
import { metrics, trace, SpanStatusCode } from '@opentelemetry/api'
import { createHash } from 'node:crypto'
import type { z } from 'zod'
import type { PlaybackStore } from './state.ts'
import { matchesRequestedAudio, supportsRequestedAudio } from './audio-policy.ts'
import { acquireProviderBudget } from './provider-budget.ts'

const permitsSource = (source: ProviderSource, input: ResolvePlaybackRequest) => matchesRequestedAudio(source, input)
  && !(input.preferences?.adsEnabled === false && source.type === 'iframe' && source.frameSandbox === 'none')

export type ResolvedSource = { source: ProviderSource; qualitySources?: ProviderSource[]; registration: ProviderRegistration; subtitles: SubtitleCandidate[]; delivery: 'direct' }

/** Adapter-declared siblings remain scoped to one mirror and audio track. */
function qualitySiblings(source: ProviderSource, candidates: ProviderSource[]) {
  if (!source.qualityGroup) return []
  return candidates.filter(candidate => candidate.qualityGroup === source.qualityGroup
    && candidate.type === source.type && candidate.language === source.language && candidate.height !== undefined)
}
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
type Health = { active: number; failures: number; playbackFailures: number; playbackWindow: number; openUntil: number; window: number; requests: number; latency: number; success: number; outcomes: number }
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

export function createResolver(providers: readonly ProviderRegistration[], options: { region: string; deadlineMs?: number; healthScope?: 'relay' | 'embed'; providerFilter?: (registration: ProviderRegistration) => boolean; sourceFilter?: (source: ProviderSource, registration: ProviderRegistration) => boolean; /** Providers that remain in automatic order during cooldown; normal admission limits still apply. */ alwaysAttemptProviderIds?: readonly string[]; /** Ignored: kept for compatibility with hedged callers. */ hedgeMs?: number; now?: () => number; store?: PlaybackStore; providerOrders?: Record<'movie' | 'series' | 'anime', string[]> }) {
  const now = options.now ?? Date.now
  // One resolve is a sequential waterfall with a shared deadline. Each
  // adapter gets its configured attempt limit; the usual limit is three
  // seconds, and explicitly slower adapters may use more of the 20s budget.
  const deadlineMs = options.deadlineMs ?? 20_000
  const cache = new Map<string, Cached>()
  const pending = new Map<string, Pending>()
  const health = new Map<string, Health>()
  const hydrated = new Set<string>()
  const meter = metrics.getMeter('consumit.playback')
  const attempts = meter.createCounter('provider.attempts')
  const latency = meter.createHistogram('provider.resolve.duration', { unit: 'ms' })
  const healthKey = (id: string, kind: ResolvePlaybackRequest['ref']['kind']) => `provider-health:v1:${options.region}:${kind}:${id}${options.healthScope ? `:${options.healthScope}` : ''}`
  function state(id: string, kind: ResolvePlaybackRequest['ref']['kind']) {
    const key = healthKey(id, kind)
    let value = health.get(key)
    if (!value) { value = { active: 0, failures: 0, playbackFailures: 0, playbackWindow: now(), openUntil: 0, window: now(), requests: 0, latency: 0, success: 0, outcomes: 0 }; health.set(key, value) }
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
        health.set(key, { active: 0, requests: 0, window: now(), failures: row.failures!, playbackFailures: Number.isFinite(row.playbackFailures) ? row.playbackFailures! : 0, playbackWindow: Number.isFinite(row.playbackWindow) ? row.playbackWindow! : now(), openUntil: row.openUntil!, latency: row.latency!, success: row.success!, outcomes: row.outcomes! })
      }
    } catch { /* Shared ranking is an optimization, never an availability dependency. */ }
  }

  function persist(id: string, kind: ResolvePlaybackRequest['ref']['kind'], value: Health) {
    if (!options.store) return
    const row = { failures: value.failures, playbackFailures: value.playbackFailures, playbackWindow: value.playbackWindow, openUntil: value.openUntil, latency: value.latency, success: value.success, outcomes: value.outcomes }
    void options.store.set(healthKey(id, kind), JSON.stringify(row), 24 * 3600).catch(() => undefined)
  }

  async function attempt(registration: ProviderRegistration, input: ResolvePlaybackRequest, signal: AbortSignal, retryCooldown = false): Promise<ResolvedSource | null> {
    if (options.providerFilter && !options.providerFilter(registration)) return null
    const current = state(registration.adapter.id, input.ref.kind)
    if (current.window + 60000 <= now()) { current.window = now(); current.requests = 0 }
    const ceiling = current.failures >= 3 ? 1 : registration.concurrency
    if (!retryCooldown && current.openUntil > now() || current.active >= ceiling || current.requests >= registration.requestsPerMinute) return null
    const releaseBudget = await acquireProviderBudget(registration, options.region, options.store)
    if (!releaseBudget) return null
    current.active++; current.requests++
    const started = now()
    return trace.getTracer('consumit.playback').startActiveSpan('provider.resolve', async (span) => {
      span.setAttribute('provider.id', registration.adapter.id)
      try {
        const result = await cancellable(registration.adapter.resolve({ ref: input.ref, region: options.region, audioLanguage: input.audioLanguage }, signal), signal)
        if (options.providerFilter && !options.providerFilter(registration)) return null
        const parsed = providerResultSchema.safeParse(result)
        if (parsed.success && ((!parsed.data.ok && (parsed.data.code === 'empty' || parsed.data.code === 'cancelled')) || (parsed.data.ok && !parsed.data.sources.length))) {
          current.outcomes++; attempts.add(1, { provider: registration.adapter.id, kind: input.ref.kind, region: options.region, outcome: 'empty' }); return null
        }
        const validated = validatedSources(result, registration, now())
        const tracks = collectSubtitleCandidates(validated, registration)
        const matching = validated.filter((source) => (source.type === 'iframe' || input.capabilities[source.type]) && permitsSource(source, input) && (!options.sourceFilter || options.sourceFilter(source, registration)))
        // Hostile-output validation already ran in validatedSources (schema,
        // expiry, allowlisted https media, no credentials/transforms).
        // Configured providers resolve directly with no approval step.
        const candidates = matching
        const targetHeight = input.preferences?.qualityHeight ?? input.capabilities.maxHeight ?? 1080
        const qualityScore = (source: ProviderSource) => source.height === undefined ? 10_000
          : source.height <= targetHeight ? 5_000 + source.height : 4_000 - source.height
        const languageScore = (source: ProviderSource) => {
          let language = source.language.toLowerCase()
          try { language = Intl.getCanonicalLocales(language)[0]?.toLowerCase() ?? language } catch { /* Provider labels may be non-language names. */ }
          const requested = input.audioLanguage.toLowerCase()
          return language === requested ? 3 : language.split('-')[0] === requested.split('-')[0] ? 2 : language === 'original' ? 1 : 0
        }
        candidates.sort((a, b) => languageScore(b) - languageScore(a)
          || Number(input.capabilities.nativeHls && b.type === 'hls') - Number(input.capabilities.nativeHls && a.type === 'hls')
          || qualityScore(b) - qualityScore(a))
        const source = candidates[0]
        if (!source) { current.outcomes++; if (!validated.length) current.failures++; attempts.add(1, { provider: registration.adapter.id, kind: input.ref.kind, region: options.region, outcome: 'empty' }); return null }
        current.failures = 0; if (current.playbackFailures < 3) current.openUntil = 0; current.success++
        current.latency = current.latency ? current.latency * 0.8 + (now() - started) * 0.2 : now() - started
        current.outcomes++
        attempts.add(1, { provider: registration.adapter.id, kind: input.ref.kind, region: options.region, outcome: 'success' })
        return { source, qualitySources: qualitySiblings(source, matching), registration, subtitles: tracks, delivery: 'direct' as const }
      } catch {
        const message = signal.reason instanceof Error ? signal.reason.message : typeof signal.reason === 'string' ? signal.reason : ''
        const ourCut = message === 'Resolution deadline reached'
        if (ourCut) {
          // Overall deadline exhaustion does not establish provider failure.
          // A provider's own timeout does, so repeated hangs cool down.
          current.outcomes++
        } else if (!signal.aborted || signal.reason?.name === 'TimeoutError') {
          current.failures++; current.outcomes++
        }
        span.setStatus({ code: SpanStatusCode.ERROR })
        attempts.add(1, { provider: registration.adapter.id, kind: input.ref.kind, region: options.region, outcome: signal.aborted ? 'cancelled' : 'error' })
        return null
      } finally {
        current.active--
        await releaseBudget().catch(() => undefined)
        if (current.failures >= 3) current.openUntil = now() + 60000
        latency.record(now() - started, { provider: registration.adapter.id, kind: input.ref.kind, region: options.region })
        persist(registration.adapter.id, input.ref.kind, current)
        span.end()
      }
    })
  }

  async function run(input: ResolvePlaybackRequest, excluded: readonly string[], parent: AbortSignal, preferred?: string, retryCooldown = false) {
    await Promise.all(providers.map((provider) => hydrate(provider.adapter.id, input.ref.kind)))
    // Kind routing is load-bearing: without it a movie provider answers an
    // anime ref by numeric-id coincidence (AniList 793 played as TMDB 793).
    // Menu listing and probes already filter this way; the waterfall must too
    // — including manual switches, where a mismatch fails honest instead of
    // playing the wrong title.
    const order = options.providerOrders?.[input.ref.kind]
    const orderIndex = (id: string) => {
      const index = order?.indexOf(id) ?? -1
      return index < 0 ? Number.MAX_SAFE_INTEGER : index
    }
    const candidates = providers.filter((p) => {
      return p.enabled && suppliesVideo(p) && p.approvedRegions.includes(options.region) && (p.mediaKinds as readonly string[]).includes(input.ref.kind)
        && !excluded.includes(p.upstreamGroup) && (!preferred || p.adapter.id === preferred) && supportsRequestedAudio(p, input) && (!options.providerFilter || options.providerFilter(p))
    }).sort((a, b) => order ? orderIndex(a.adapter.id) - orderIndex(b.adapter.id)
      : (b.priority ?? 0) - (a.priority ?? 0))
    if (!candidates.length) return null
    const controller = new AbortController()
    const deadline = setTimeout(() => controller.abort(new DOMException('Resolution deadline reached', 'TimeoutError')), deadlineMs)
    const signal = AbortSignal.any([parent, controller.signal])
    // One hung provider must not hold the whole request: bound each
    // sequential attempt so a stalled first provider falls through to the
    // next instead of burning the full deadline. Slow-but-good providers
    // carry their own budget, still capped by the total deadline.
    try {
      for (const candidate of candidates) {
        if (signal.aborted) return null
        const perAttempt = new AbortController()
        const onAbort = () => perAttempt.abort(signal.reason)
        signal.addEventListener('abort', onAbort, { once: true })
        const attemptSignal = AbortSignal.any([signal, perAttempt.signal])
        let timer: ReturnType<typeof setTimeout> | undefined
        const budget = candidate.attemptMs ?? 3000
        const timeout = new Promise<null>((resolve) => { timer = setTimeout(() => { perAttempt.abort(new DOMException('Provider attempt timed out', 'TimeoutError')); resolve(null) }, budget) })
        try {
          // An explicit fresh choice retries a recovered provider even while
          // automatic traffic is cooling. Admission limits still apply.
          const bypassCooldown = (retryCooldown && candidate.adapter.id === preferred)
            || options.alwaysAttemptProviderIds?.includes(candidate.adapter.id) === true
          const value = await Promise.race([attempt(candidate, input, attemptSignal, bypassCooldown), timeout])
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
      // Admin overrides mutate registrations in place. Include configuration
      // and saved order so a prior winner cannot bypass an Admin change.
      const deliveryConfig: unknown[] = providers.map((provider) => [provider.adapter.id, provider.enabled, provider.role ?? 'video', provider.deliveryMode ?? 'direct', provider.relayHostDiscovery, provider.priority ?? 0, provider.approvedRegions, provider.mediaKinds, provider.mediaHosts, provider.upstreamGroup, provider.adapter.audioLanguages])
      deliveryConfig.push([input.ref.kind, ...(options.providerOrders?.[input.ref.kind] ?? [])])
      const key = JSON.stringify([input, options.region, options.healthScope ?? 'direct', excluded, preferred, deliveryConfig])
      const cached = cache.get(key)
      if (!fresh && cached && cached.until > now()) return cached.value
      if (fresh) cache.delete(key)
      let work = pending.get(key)
      if (!work) {
        if (pending.size >= 100) return null
        const controller = new AbortController()
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(deadlineMs)])
        const sharedKey = `access:${createHash('sha256').update(key).digest('hex')}`
        const discover = async () => {
          if (!fresh && options.store) {
            try {
              const raw = await cancellable(options.store.get(sharedKey), signal)
              if (raw) {
                const cached = JSON.parse(raw) as { provider: string; source: unknown; qualitySources?: unknown[] }
                const registration = providers.find((entry) => {
                  return entry.adapter.id === cached.provider && entry.enabled && suppliesVideo(entry) && entry.mediaKinds.includes(input.ref.kind)
                    && entry.approvedRegions.includes(options.region) && !excluded.includes(entry.upstreamGroup)
                    && (!preferred || preferred === entry.adapter.id) && supportsRequestedAudio(entry, input) && state(entry.adapter.id, input.ref.kind).failures === 0 && (!options.providerFilter || options.providerFilter(entry))
                })
                if (registration) {
                  const source = validatedSources({ ok: true, sources: [cached.source] }, registration, now())[0]
                  if (source && (source.type === 'iframe' || input.capabilities[source.type]) && permitsSource(source, input) && (!options.sourceFilter || options.sourceFilter(source, registration))) {
                    const siblings = Array.isArray(cached.qualitySources) ? validatedSources({ ok: true, sources: cached.qualitySources.slice(0, 32) }, registration, now())
                      .filter(candidate => (candidate.type === 'iframe' || input.capabilities[candidate.type]) && permitsSource(candidate, input) && (!options.sourceFilter || options.sourceFilter(candidate, registration))) : []
                    return { source, qualitySources: qualitySiblings(source, siblings), registration, subtitles: [], delivery: 'direct' as const }
                  }
                }
              }
            } catch { /* Disposable access cache failure must not prevent fresh resolution. */ }
          }
          return run(input, excluded, signal, preferred, fresh && Boolean(preferred))
        }
        const promise = discover().then((value) => {
          if (!controller.signal.aborted) {
            if (cache.size >= 500) cache.delete(cache.keys().next().value!)
            const cacheSeconds = 30
            cache.set(key, { value, until: value ? Math.min(now() + cacheSeconds * 1000, Date.parse(value.source.expiresAt) - 30000) : now() + 3000 })
            if (value && options.store) {
              const ttl = Math.min(cacheSeconds, (Date.parse(value.source.expiresAt) - now() - 30000) / 1000)
              if (ttl > 0) void options.store.set(sharedKey, JSON.stringify({ provider: value.registration.adapter.id, source: value.source, qualitySources: value.qualitySources, delivery: value.delivery }), ttl).catch(() => undefined)
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
    recordFailure(providerId: string, kind: ResolvePlaybackRequest['ref']['kind'], cause: 'transient' | 'definitive' = 'transient') {
      const value = state(providerId, kind)
      if (now() - value.playbackWindow > 5 * 60_000) { value.playbackWindow = now(); value.playbackFailures = 0 }
      value.playbackFailures++
      value.outcomes++
      // Definitive failures (gone-class sources, blocked direct paths) are
      // not coming back soon: cool the provider five times longer than a
      // transient stall so traffic demotes to healthy providers instead of
      // burning budget and upstream goodwill on 60-second retries.
      if (value.playbackFailures >= 3) value.openUntil = now() + (cause === 'definitive' ? 300_000 : 60_000)
      persist(providerId, kind, value)
      invalidateProvider(providerId)
    },
    status(kind: ResolvePlaybackRequest['ref']['kind'] = 'movie') { return providers.map((p) => ({ id: p.adapter.id, enabled: p.enabled, ...state(p.adapter.id, kind) })) },
    async reset(providerId: string, kind: ResolvePlaybackRequest['ref']['kind']) {
      const current = state(providerId, kind)
      current.failures = 0
      current.playbackFailures = 0
      current.playbackWindow = now()
      current.openUntil = 0
      current.outcomes = 0
      current.success = 0
      if (options.store) await options.store.set(healthKey(providerId, kind), JSON.stringify({ failures: 0, playbackFailures: 0, playbackWindow: now(), openUntil: 0, latency: current.latency, success: 0, outcomes: 0 }), 24 * 3600)
      invalidateProvider(providerId)
    },
  }
}
