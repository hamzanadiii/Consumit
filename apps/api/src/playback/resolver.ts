import { type ProviderRegistration, type ProviderSource, providerResultSchema, validatedSources } from '@consumit/provider-sdk'
import { playbackTrackSchema, type ResolvePlaybackRequest } from '@consumit/contracts'
import { metrics, trace, SpanStatusCode } from '@opentelemetry/api'
import { createHash } from 'node:crypto'
import type { z } from 'zod'
import { guessEngine, planSource, type CapabilityRegistry, type DeliveryEngine, type DeliveryPlan } from './delivery.ts'
import type { PlaybackStore } from './state.ts'

export type ResolvedSource = { source: ProviderSource; registration: ProviderRegistration; subtitles: SubtitleCandidate[] }
/** A caption track plus the provider context needed to lease it: subtitle and
 *  video sources stay independent decisions behind one resolve. */
export type SubtitleCandidate = { track: z.infer<typeof playbackTrackSchema>; hosts: readonly string[]; headers: Record<string, string> }
/** Extra resolve latency granted to in-flight attempts so their subtitle tracks
 *  can join; the fast path (nothing else in flight) returns immediately. */
export const SUBTITLE_SETTLE_MS = 500
const MAX_SESSION_SUBTITLES = 16

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

export function createResolver(providers: readonly ProviderRegistration[], options: { region: string; deadlineMs?: number; hedgeMs?: number; now?: () => number; store?: PlaybackStore; delivery?: { registry: CapabilityRegistry; enabled: boolean } }) {
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
        // Direct-only gating (Amendment D): a source plays iff every needed
        // resource is measured direct with browser headers alone. Anything
        // else is unsupported — there is no relay to fall back to. Planner
        // disabled means permissive mode (trust adapter declarations).
        const delivery = options.delivery
        const plans = new Map<string, DeliveryPlan>()
        let engine: DeliveryEngine = 'hlsjs'
        if (delivery?.enabled) {
          try {
            engine = guessEngine(input.capabilities)
            const verdicts = await Promise.all(
              matching.map(async (source) => ({ key: source.key, plan: await planSource(source, engine, delivery.registry) })),
            )
            for (const { key, plan } of verdicts) plans.set(key, plan)
          } catch {
            // Plans stay empty ⇒ nothing eligible below; never break resolve.
          }
        } else {
          for (const source of matching) plans.set(source.key, 'direct')
        }
        const candidates = matching.filter((source) => plans.get(source.key) === 'direct')
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
        // Delivery verdict for the chosen source. Observability only — the
        // gating above already decided playability.
        if (delivery?.enabled) {
          try {
            span.setAttribute('delivery.plan', plans.get(source.key) ?? 'unsupported')
            span.setAttribute('delivery.engine', engine)
          } catch {
            // Shadow telemetry must never break resolution.
          }
        }
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
    const groups = new Set<string>()
    const candidates = providers.filter((p) => p.enabled && p.approvedRegions.includes(options.region) && !excluded.includes(p.upstreamGroup) && (!preferred || p.adapter.id === preferred))
      // Operator-pinned order first (higher priority tries first), then learned
      // health: failures, then latency. Breakers still gate inside attempt().
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0)
        || state(a.adapter.id, input.ref.kind).failures - state(b.adapter.id, input.ref.kind).failures
        || (state(b.adapter.id, input.ref.kind).outcomes ? state(b.adapter.id, input.ref.kind).success / state(b.adapter.id, input.ref.kind).outcomes : 0.5)
          - (state(a.adapter.id, input.ref.kind).outcomes ? state(a.adapter.id, input.ref.kind).success / state(a.adapter.id, input.ref.kind).outcomes : 0.5)
        || (state(a.adapter.id, input.ref.kind).latency || 1000) - (state(b.adapter.id, input.ref.kind).latency || 1000))
      .filter((p) => { if (groups.has(p.upstreamGroup)) return false; groups.add(p.upstreamGroup); return true }).slice(0, 3)
    if (!candidates.length) return null
    const controller = new AbortController()
    const deadline = setTimeout(() => controller.abort(new DOMException('Resolution deadline reached', 'TimeoutError')), options.deadlineMs ?? 8000)
    const signal = AbortSignal.any([parent, controller.signal])
    try {
      return await new Promise<ResolvedSource | null>((resolve) => {
        let cursor = 0; let active = 0; let finished = false
        let settle: ReturnType<typeof setTimeout> | undefined
        let held: ResolvedSource | null | undefined
        const gathered: SubtitleCandidate[] = []
        const finish = (value: ResolvedSource | null) => {
          finished = true; clearTimeout(hedge); clearTimeout(settle); settle = undefined; held = undefined
          signal.removeEventListener('abort', aborted)
          controller.abort(); resolve(value)
        }
        const release = () => {
          clearTimeout(settle)
          settle = undefined
          const value: ResolvedSource | null = held ?? null
          held = undefined
          finish(value && { ...value, subtitles: dedupeSubtitleTracks(gathered) })
        }
        const done = (value: ResolvedSource | null) => {
          if (finished || held !== undefined) return
          if (value && active > 0) {
            // A hedged companion is still in flight: hold the decision briefly
            // so its subtitle tracks join the session. Drained companions
            // release immediately; only a hung companion costs the window.
            held = value
            settle = setTimeout(release, SUBTITLE_SETTLE_MS)
            return
          }
          held = value
          release()
        }
        const aborted = () => finish(null)
        const start = () => {
          if (finished || held !== undefined || signal.aborted) { done(null); return }
          if (active >= 2 || cursor >= candidates.length) { if (!active) done(null); return }
          const candidate = candidates[cursor++]!
          active++
          void attempt(candidate, input, signal).then((value) => {
            active--
            if (value) for (const track of value.subtitles) gathered.push(track)
            if (finished) return
            if (held !== undefined) {
              if (active === 0) release()
              return
            }
            if (value) done(value)
            else start()
          })
        }
        signal.addEventListener('abort', aborted, { once: true })
        const hedge = setTimeout(start, options.hedgeMs ?? 600)
        start()
      })
    } finally { clearTimeout(deadline); controller.abort() }
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
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(options.deadlineMs ?? 8000)])
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
                    const plan = options.delivery?.enabled
                      ? await planSource(source, guessEngine(input.capabilities), options.delivery.registry)
                      : 'direct'
                    if (plan === 'direct') return { source, registration, subtitles: [] }
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
    recordFailure(providerId: string, kind: ResolvePlaybackRequest['ref']['kind']) { const value = state(providerId, kind); value.failures++; value.outcomes++; if (value.failures >= 3) value.openUntil = now() + 60000; persist(providerId, kind, value); cache.clear() },
    status(kind: ResolvePlaybackRequest['ref']['kind'] = 'movie') { return providers.map((p) => ({ id: p.adapter.id, enabled: p.enabled, ...state(p.adapter.id, kind) })) },
  }
}
