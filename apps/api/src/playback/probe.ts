import { validatedSources, type MediaKind, type ProviderRegistration } from '@consumit/provider-sdk'
import type { PlaybackRef } from '@consumit/contracts'
import type { PlaybackStore } from './state.ts'

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
}): { start(): void; stop(): void; status(): Promise<ProbeStatus>; runOnce(): Promise<void> } {
  const { providers, region, intervalMs } = deps
  const gapMs = deps.gapMs ?? 3000
  const timeoutMs = deps.timeoutMs ?? 10000
  const clock = deps.now ?? Date.now
  const results = new Map<string, ProbeResult>()
  let timer: ReturnType<typeof setInterval> | undefined
  let running = false
  const regionsFor = (registration: ProviderRegistration) => [...new Set(registration.approvedRegions)]
    .sort((left, right) => left === region ? -1 : right === region ? 1 : left.localeCompare(right)).slice(0, 4)

  async function probe(registration: ProviderRegistration, kind: MediaKind, probeRegion: string): Promise<void> {
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
      const record: ProbeResult = result.ok
        ? validatedSources(result, registration, clock()).length > 0 ? { ok: true, ms, at: started } : { ok: false, ms, at: started, code: 'invalid-source' }
        : { ok: false, ms, at: started, code: result.code }
      results.set(key, record)
      if (deps.store) await deps.store.set(`probe:${key}`, JSON.stringify(record), Math.max(600, Math.ceil(intervalMs / 1000) * 3)).catch(() => undefined)
      deps.log?.({ provider: registration.adapter.id, ok: record.ok, ms, ...(record.code ? { code: record.code } : {}) })
    } catch {
      const ms = clock() - started
      const record = { ok: false, ms, at: started, code: 'error' }
      results.set(key, record)
      if (deps.store) await deps.store.set(`probe:${key}`, JSON.stringify(record), Math.max(600, Math.ceil(intervalMs / 1000) * 3)).catch(() => undefined)
      deps.log?.({ provider: registration.adapter.id, ok: false, ms, code: 'error' })
    } finally {
      clearTimeout(timeout)
    }
  }

  async function runOnce(): Promise<void> {
    if (running) return
    running = true
    const lock = `${clock()}:${Math.random()}`
    try {
      if (deps.store && !await deps.store.claim('probe:scheduler', lock, Math.max(60, Math.ceil(intervalMs / 1000))).catch(() => false)) return
      for (const registration of providers) {
        if (!registration.enabled) continue
        for (const kind of registration.mediaKinds) {
          for (const probeRegion of regionsFor(registration)) {
            await probe(registration, kind, probeRegion)
            await new Promise((resolve) => setTimeout(resolve, gapMs))
          }
        }
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
