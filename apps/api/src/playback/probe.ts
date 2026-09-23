import type { ProviderRegistration } from '@consumit/provider-sdk'

/** Synthetic probes: each enabled provider resolves one reference title on
 *  an interval, staggered so upstream rate limits never notice. Results feed
 *  the admin health endpoint — outages surface there instead of arriving
 *  via a member's failed watch. Probe failures never touch resolver
 *  circuits; they are signal, not traffic shaping. */

export type ProbeRef = { kind: 'movie'; id: number } | { kind: 'series'; id: number; season: number; episode: number } | { kind: 'anime'; id: number; episode: number }
export type ProbeResult = { ok: boolean; ms: number; at: number; code?: string | undefined }
export type ProbeStatus = Record<string, ProbeResult>

const MOVIE_REF: ProbeRef = { kind: 'movie', id: 550 }
const SERIES_REF: ProbeRef = { kind: 'series', id: 1399, season: 1, episode: 1 }
const ANIME_REF: ProbeRef = { kind: 'anime', id: 21, episode: 1 }

function refFor(registration: ProviderRegistration): ProbeRef {
  const kinds = registration.mediaKinds as readonly string[]
  if (kinds.includes('anime') && !kinds.includes('movie')) return ANIME_REF
  if (kinds.includes('series') && !kinds.includes('movie')) return SERIES_REF
  return MOVIE_REF
}

export function createProbeScheduler(deps: {
  providers: readonly ProviderRegistration[]
  region: string
  intervalMs: number
  gapMs?: number
  timeoutMs?: number
  log?: (fields: { provider: string; ok: boolean; ms: number; code?: string }) => void
  now?: () => number
}): { start(): void; stop(): void; status(): ProbeStatus; runOnce(): Promise<void> } {
  const { providers, region, intervalMs } = deps
  const gapMs = deps.gapMs ?? 3000
  const timeoutMs = deps.timeoutMs ?? 10000
  const clock = deps.now ?? Date.now
  const results = new Map<string, ProbeResult>()
  let timer: ReturnType<typeof setInterval> | undefined
  let running = false

  async function probe(registration: ProviderRegistration): Promise<void> {
    const started = clock()
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(new DOMException('Probe timed out', 'TimeoutError')), timeoutMs)
    try {
      const result = await registration.adapter.resolve({ ref: refFor(registration), region, audioLanguage: 'en' }, controller.signal)
      const ms = clock() - started
      const record: ProbeResult = result.ok
        ? { ok: true, ms, at: started }
        : { ok: false, ms, at: started, code: result.code }
      results.set(registration.adapter.id, record)
      deps.log?.({ provider: registration.adapter.id, ok: record.ok, ms, ...(record.code ? { code: record.code } : {}) })
    } catch {
      const ms = clock() - started
      results.set(registration.adapter.id, { ok: false, ms, at: started, code: 'error' })
      deps.log?.({ provider: registration.adapter.id, ok: false, ms, code: 'error' })
    } finally {
      clearTimeout(timeout)
    }
  }

  async function runOnce(): Promise<void> {
    if (running) return
    running = true
    try {
      for (const registration of providers) {
        if (!registration.enabled) continue
        await probe(registration)
        await new Promise((resolve) => setTimeout(resolve, gapMs))
      }
    } finally {
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
    status() {
      return Object.fromEntries(results)
    },
    runOnce,
  }
}
