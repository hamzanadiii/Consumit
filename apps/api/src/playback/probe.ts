import { validatedSources, suppliesVideo, providerResultSchema, type MediaKind, type ProviderRegistration } from '@consumit/provider-sdk'
import type { PlaybackRef } from '@consumit/contracts'
import type { PlaybackStore } from './state.ts'
import { acquireProviderBudget } from './provider-budget.ts'

/** Synthetic probes: each enabled provider resolves one reference title on
 *  an interval, staggered so upstream rate limits never notice. Results feed
 *  the admin health endpoint — outages surface there instead of arriving
 *  via a member's failed watch. Probe failures never touch resolver
 *  circuits; they are signal, not traffic shaping. */

export type ProbeRef = PlaybackRef
export type ProbeResult = { ok: boolean; ms: number; at: number; code?: string | undefined }
export type ProbeStatus = Record<string, ProbeResult>

const MOVIE_REF: ProbeRef = { kind: 'movie', id: 550 }
const SERIES_REF: ProbeRef = { kind: 'series', id: 1399, season: 1, episode: 1 }
const ANIME_REF: ProbeRef = { kind: 'anime', id: 21, episode: 1 }

function refFor(kind: 'movie' | 'series' | 'anime'): ProbeRef {
  return kind === 'anime' ? ANIME_REF : kind === 'series' ? SERIES_REF : MOVIE_REF
}

export function createProbeScheduler(deps: {
  providers: readonly ProviderRegistration[]
  region: string
  intervalMs: number
  gapMs?: number
  timeoutMs?: number
  log?: (fields: { provider: string; ok: boolean; ms: number; code?: string }) => void
  now?: () => number
  store?: PlaybackStore
}): { start(): void; stop(): void; status(): Promise<ProbeStatus>; runOnce(options?: { budgetMs: number; onlyDue: boolean }): Promise<void> } {
  const { providers, region, intervalMs } = deps
  const gapMs = deps.gapMs ?? 3000
  const timeoutMs = deps.timeoutMs ?? 10000
  const clock = deps.now ?? Date.now
  const results = new Map<string, ProbeResult>()
  let timer: ReturnType<typeof setInterval> | undefined
  let running = false
  const regionsFor = (registration: ProviderRegistration) => [...new Set(registration.approvedRegions)]
    .sort((left, right) => left === region ? -1 : right === region ? 1 : left.localeCompare(right)).slice(0, 4)
  const retentionSeconds = () => Math.max(600, Math.ceil(intervalMs / 1000) * 3, providers.reduce((count, row) => count + row.mediaKinds.length * regionsFor(row).length, 0) * (15 + Math.ceil(gapMs / 1000)) * 3)

  async function probe(registration: ProviderRegistration, kind: MediaKind, probeRegion: string): Promise<void> {
    const release = await acquireProviderBudget(registration, probeRegion, deps.store).catch(() => null)
    if (!release) return
    const started = clock()
    const key = `${registration.adapter.id}:${kind}:${probeRegion}`
    const controller = new AbortController()
    const budgetMs = Math.min(Math.max(timeoutMs, registration.attemptMs ?? 0), 15_000)
    const timeout = setTimeout(() => controller.abort(new DOMException('Probe timed out', 'TimeoutError')), budgetMs)
    try {
      const result = await Promise.race([
        registration.adapter.resolve({
          ref: registration.probes?.[kind]?.ref ?? refFor(kind),
          region: probeRegion,
          audioLanguage: registration.probes?.[kind]?.audioLanguage ?? 'en',
        }, controller.signal),
        new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true })),
      ])
      const ms = clock() - started
      const parsed = providerResultSchema.safeParse(result)
      const record: ProbeResult = !parsed.success ? { ok: false, ms, at: started, code: 'invalid-source' }
        : parsed.data.ok ? validatedSources(parsed.data, registration, clock()).length > 0 ? { ok: true, ms, at: started } : { ok: false, ms, at: started, code: 'invalid-source' }
        : { ok: false, ms, at: started, code: parsed.data.code }
      results.set(key, record)
      if (deps.store) await deps.store.set(`probe:${key}`, JSON.stringify(record), retentionSeconds()).catch(() => undefined)
      deps.log?.({ provider: registration.adapter.id, ok: record.ok, ms, ...(record.code ? { code: record.code } : {}) })
    } catch {
      const ms = clock() - started
      const record = { ok: false, ms, at: started, code: 'error' }
      results.set(key, record)
      if (deps.store) await deps.store.set(`probe:${key}`, JSON.stringify(record), retentionSeconds()).catch(() => undefined)
      deps.log?.({ provider: registration.adapter.id, ok: false, ms, code: 'error' })
    } finally {
      clearTimeout(timeout)
      await release().catch(() => undefined)
    }
  }

  async function runOnce(options?: { budgetMs: number; onlyDue: boolean }): Promise<void> {
    if (running) return
    running = true
    const lock = `${clock()}:${Math.random()}`
    const deadline = options ? clock() + Math.min(60_000, Math.max(0, options.budgetMs)) : Infinity
    try {
      if (deps.store && !await deps.store.claim('probe:scheduler', lock, options ? 65 : Math.max(60, Math.ceil(intervalMs / 1000))).catch(() => false)) return
      const work: { registration: ProviderRegistration; kind: MediaKind; probeRegion: string; at: number }[] = []
      for (const registration of providers) {
        if (!registration.enabled || !suppliesVideo(registration)) continue
        for (const kind of registration.mediaKinds) {
          for (const probeRegion of regionsFor(registration)) {
            if (clock() >= deadline) return
            const key = `${registration.adapter.id}:${kind}:${probeRegion}`
            let at = results.get(key)?.at ?? 0
            if (options?.onlyDue && deps.store) {
              const raw = await deps.store.get(`probe:${key}`)
              try { const parsed = raw ? JSON.parse(raw) : null; if (Number.isFinite(parsed?.at)) at = parsed.at } catch { /* A malformed record is due for a new check. */ }
            }
            if (!options?.onlyDue || !at || at + intervalMs <= clock()) work.push({ registration, kind, probeRegion, at })
          }
        }
      }
      // Oldest evidence first gives every configured leg a turn across bounded jobs.
      if (options) work.sort((left, right) => left.at - right.at)
      for (const { registration, kind, probeRegion } of work) {
        if (clock() + Math.min(Math.max(timeoutMs, registration.attemptMs ?? 0), 15_000) + gapMs > deadline) break
        await probe(registration, kind, probeRegion)
        await new Promise((resolve) => setTimeout(resolve, gapMs))
      }
    } finally {
      if (deps.store) await deps.store.release('probe:scheduler', lock).catch(() => undefined)
      running = false
    }
  }

  return {
    start() {
      if (timer !== undefined || intervalMs <= 0) return
      void runOnce()
      timer = setInterval(() => { void runOnce() }, intervalMs)
    },
    stop() {
      if (timer !== undefined) clearInterval(timer)
      timer = undefined
    },
    async status() {
      if (!deps.store) return Object.fromEntries(results)
      const shared = await Promise.all(providers.flatMap((provider) => provider.mediaKinds.flatMap((kind) => regionsFor(provider).map(async (probeRegion) => {
        const key = `${provider.adapter.id}:${kind}:${probeRegion}`
        const raw = await deps.store!.get(`probe:${key}`).catch(() => null)
        if (!raw) return [key, results.get(key)] as const
        try {
          const parsed = JSON.parse(raw) as ProbeResult
          return [key, Number.isFinite(parsed.at) && Number.isFinite(parsed.ms) && typeof parsed.ok === 'boolean' ? parsed : undefined] as const
        } catch { return [key, undefined] as const }
      }))))
      return Object.fromEntries(shared.filter((entry) => entry[1] !== undefined)) as ProbeStatus
    },
    runOnce,
  }
}
