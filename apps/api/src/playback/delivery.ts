import type { ProviderSource } from '@consumit/provider-sdk'
import type { MediaTransport } from './transport.ts'
import type { PlaybackStore } from './state.ts'

/**
 * Delivery capability registry + planner (ADR-0002, Phase 1a).
 *
 * The registry learns, per upstream host × resource kind × playback engine,
 * whether bytes can travel directly from the provider CDN. Unknown and failed
 * evidence is unsupported; no member request ever falls back to a media proxy.
 */

export type DeliveryResourceKind = 'manifest' | 'segment' | 'key' | 'subtitle' | 'mp4'
/** hlsjs fetches segments via XHR (upstream CORS required for direct);
 *  native built-in playback has no CORS requirement. */
export type DeliveryEngine = 'hlsjs' | 'native'
export type DeliveryPlan = 'direct' | 'unsupported'
export type DeliveryCapability = 'direct' | 'unsupported'
export type CapabilityRow = {
  capability: DeliveryCapability
  confidence: number
  probes: number
  successes: number
  streak: number
  updatedAt: number
}

const KEY_PREFIX = 'delivery:v2:'
const ROW_TTL_SECONDS = 7 * 24 * 3600
const PROMOTE_STREAK = 5
const MAX_MEMORY_ROWS = 2000

function isRow(value: unknown): value is CapabilityRow {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Record<string, unknown>
  return (
    (row.capability === 'direct' || row.capability === 'unsupported') &&
    typeof row.confidence === 'number' &&
    Number.isInteger(row.probes) &&
    Number.isInteger(row.successes) &&
    Number.isInteger(row.streak) &&
    typeof row.updatedAt === 'number'
  )
}

export function deliveryKey(host: string, kind: DeliveryResourceKind, engine: DeliveryEngine): string {
  return `${KEY_PREFIX}${host.toLowerCase()}:${kind}:${engine}`
}

export function createCapabilityRegistry(store: PlaybackStore, now: () => number = Date.now) {
  const memory = new Map<string, CapabilityRow>()

  async function get(host: string, kind: DeliveryResourceKind, engine: DeliveryEngine): Promise<CapabilityRow | null> {
    const key = deliveryKey(host, kind, engine)
    const hit = memory.get(key)
    if (hit) return hit
    let row: CapabilityRow | null = null
    try {
      const raw = await store.get(key)
      if (raw) {
        const parsed: unknown = JSON.parse(raw)
        if (isRow(parsed)) row = parsed
      }
    } catch {
      // Missing shared evidence is unsupported; callers may use the memory copy.
      return null
    }
    if (row) {
      if (memory.size >= MAX_MEMORY_ROWS) memory.delete(memory.keys().next().value!)
      memory.set(key, row)
    }
    return row
  }

  async function record(host: string, kind: DeliveryResourceKind, engine: DeliveryEngine, success: boolean): Promise<CapabilityRow> {
    const key = deliveryKey(host, kind, engine)
    const base = (await get(host, kind, engine)) ?? {
      capability: 'unsupported' as const,
      confidence: 0,
      probes: 0,
      successes: 0,
      streak: 0,
      updatedAt: now(),
    }
    // Demote instantly on any failure; promote only after sustained success.
    const streak = success ? base.streak + 1 : 0
    const probes = base.probes + 1
    const successes = base.successes + (success ? 1 : 0)
    const row: CapabilityRow = {
      capability: !success ? 'unsupported' : streak >= PROMOTE_STREAK ? 'direct' : base.capability,
      confidence: probes ? successes / probes : 0,
      probes,
      successes,
      streak,
      updatedAt: now(),
    }
    memory.set(key, row)
    try {
      await store.set(key, JSON.stringify(row), ROW_TTL_SECONDS)
    } catch {
      // Telemetry must never break resolution; the memory front keeps serving.
    }
    return row
  }

  /**
   * Load operator-attested verdicts (canary evidence) at boot. Rows are
   * validated and written through to both layers; malformed rows are skipped.
   * Attestation lives in git history plus the canary logs, not in counters.
   */
  async function importRows(rows: readonly unknown[]): Promise<number> {
    let loaded = 0
    for (const candidate of rows) {
      if (!candidate || typeof candidate !== 'object') continue
      const { host, kind, engine, row } = candidate as {
        host?: unknown; kind?: unknown; engine?: unknown; row?: unknown
      }
      if (typeof host !== 'string' || !isRow(row)) continue
      if (kind !== 'manifest' && kind !== 'segment' && kind !== 'key' && kind !== 'subtitle' && kind !== 'mp4') continue
      if (engine !== 'hlsjs' && engine !== 'native') continue
      const key = deliveryKey(host, kind, engine)
      memory.set(key, row)
      try {
        await store.set(key, JSON.stringify(row), ROW_TTL_SECONDS)
      } catch {
        // Boot seeding is best-effort; the memory front keeps serving.
      }
      loaded += 1
    }
    return loaded
  }

  return { get, record, importRows }
}

export type CapabilityRegistry = ReturnType<typeof createCapabilityRegistry>

type PlannedSource = Pick<ProviderSource, 'headers' | 'type'> & { segmentTransform?: ProviderSource['segmentTransform'] }

/**
 * Pure delivery verdict for one source. Direct-only architecture: a source
 * plays iff every needed resource kind is measured direct with browser
 * headers alone. Declared referer/origin requirements do NOT gate the
 * verdict — a `direct` registry row already proves those headers unenforced
 * for that host×kind (that is exactly what the probe tests). Unknown means
 * unsupported: there is no relay to fall back to. Cookie-bearing, dash, and
 * transformed sources are always unsupported (browsers cannot send
 * third-party cookies, and no MPD rewriter or byte transform exists).
 */
export function planDelivery(
  source: PlannedSource,
  engine: DeliveryEngine,
  capable: (kind: DeliveryResourceKind) => DeliveryCapability | null,
): DeliveryPlan {
  const names = Object.keys(source.headers ?? {})
  if (names.some((name) => /^(cookie|authorization)$/i.test(name))) return 'unsupported'
  if (source.type === 'dash' || source.segmentTransform) return 'unsupported'
  const direct = (kind: DeliveryResourceKind) => capable(kind) === 'direct'
  if (source.type === 'native') return direct('mp4') ? 'direct' : 'unsupported'
  // HLS. Encryption keys ride the same CDN as segments, so an unknown key
  // verdict inherits the segment verdict until keys are probed separately.
  const segment = direct('segment') && (capable('key') ?? (capable('segment') ? 'direct' : null)) === 'direct'
  return direct('manifest') && segment ? 'direct' : 'unsupported'
}

/** Guess the playback engine from request capabilities for shadow planning.
 *  Mirrors media-engine's preference: hls.js whenever MSE exists (dash flag),
 *  native only for MSE-less browsers with built-in HLS. */
export function guessEngine(capabilities: { hls: boolean; dash: boolean; nativeHls: boolean }): DeliveryEngine {
  if (capabilities.dash) return 'hlsjs'
  if (capabilities.nativeHls) return 'native'
  return 'hlsjs'
}

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
}

/**
 * End-to-end verdict for one concrete source: registry lookups plus the pure
 * planner. Unknown capability or any failure degrades to FULL (unsupported):
 * with no relay to fall back to, unmeasured sources do not play.
 */
export async function planSource(
  source: Pick<ProviderSource, 'headers' | 'type' | 'url'> & { segmentTransform?: ProviderSource['segmentTransform'] },
  engine: DeliveryEngine,
  registry: CapabilityRegistry,
): Promise<DeliveryPlan> {
  const kinds: DeliveryResourceKind[] =
    source.type === 'hls' ? ['manifest', 'segment', 'key'] : source.type === 'native' ? ['mp4'] : []
  if (!kinds.length) return 'unsupported'
  const host = hostnameOf(source.url)
  if (!host) return 'unsupported'
  try {
    const rows = await Promise.all(kinds.map((kind) => registry.get(host, kind, engine)))
    const byKind = new Map(kinds.map((kind, index) => [kind, rows[index]?.capability ?? null] as const))
    return planDelivery(source, engine, (kind) => byKind.get(kind) ?? null)
  } catch {
    return 'unsupported'
  }
}

const BROWSER_HEADERS = {
  'user-agent': 'Mozilla/5.0 AppleWebKit/537.36 Chrome/150 Safari/537.36',
  accept: '*/*',
}

/**
 * Probe whether one upstream URL is directly playable in the browser: 2xx
 * with a playable content type, plus an applicable CORS grant for hls.js
 * (XHR segments). Pass the web origin so echo-style
 * `Access-Control-Allow-Origin` hosts can promote; without it only `*`
 * qualifies. Unit-testable via an injected transport; never throws —
 * any failure simply means "not direct".
 */
export async function probeDirectSupport(
  url: string,
  hosts: readonly string[],
  engine: DeliveryEngine,
  transport: MediaTransport,
  signal: AbortSignal,
  origin?: string | undefined,
): Promise<boolean> {
  try {
    const headers = origin ? { ...BROWSER_HEADERS, origin } : BROWSER_HEADERS
    const response = await transport(url, hosts, headers, signal)
    try {
      if (response.status < 200 || response.status >= 300) return false
      const contentType = response.headers.get('content-type') ?? ''
      if (!/^(?:video\/|audio\/|application\/(?:octet-stream|mp4)|text\/vtt|application\/vnd\.apple\.mpegurl)/i.test(contentType)) return false
      if (engine === 'hlsjs') {
        const allow = response.headers.get('access-control-allow-origin') ?? ''
        if (allow !== '*' && allow !== origin) return false
      }
      return true
    } finally {
      response.body.destroy()
    }
  } catch {
    return false
  }
}

export type DeliveryProbeTarget = { url: string; host: string; kind: DeliveryResourceKind; engine: DeliveryEngine }

/**
 * Run explicit probe targets with bounded concurrency, recording each outcome
 * into the registry and returning the per-target verdicts for classification
 * tables (canary runs). Targets come from operators or canary resolves (see
 * probe.ts); scheduling lands with Phase 1b client telemetry.
 */
export async function runDeliveryProbes(
  targets: readonly DeliveryProbeTarget[],
  hosts: readonly string[],
  registry: CapabilityRegistry,
  transport: MediaTransport,
  signal: AbortSignal,
  concurrency = 4,
  origin?: string | undefined,
): Promise<Array<{ target: DeliveryProbeTarget; direct: boolean }>> {
  const queue = [...targets]
  const results: Array<{ target: DeliveryProbeTarget; direct: boolean }> = []
  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, queue.length)) }, async () => {
    while (queue.length) {
      if (signal.aborted) return
      const target = queue.shift()!
      const timeout = AbortSignal.any([signal, AbortSignal.timeout(10000)])
      const direct = await probeDirectSupport(target.url, hosts, target.engine, transport, timeout, origin)
      await registry.record(target.host, target.kind, target.engine, direct)
      results.push({ target, direct })
    }
  })
  await Promise.all(workers)
  return results.sort((a, b) => a.target.url.localeCompare(b.target.url))
}
