import { playbackRefSchema } from '@consumit/contracts'
import { z } from 'zod'
import { assertHlsManifest } from '../manifest.ts'
import { providerResultSchema, type ProviderAdapter, type ProviderInput, type ProviderSource, type SkipSegment } from '../index.ts'

/** Intro/outro/recap ranges in seconds from upstream skip metadata. Only
 *  finite, ordered, in-day ranges survive; anything else is dropped. */
export function parseSkipSegments(value: unknown): SkipSegment[] {
  if (!value || typeof value !== 'object') return []
  const record = value as Record<string, unknown>
  const out: SkipSegment[] = []
  for (const kind of ['intro', 'outro', 'recap'] as const) {
    const segment = record[kind]
    if (!segment || typeof segment !== 'object') continue
    const fields = segment as Record<string, unknown>
    const start = Number(fields.start)
    const end = Number(fields.end)
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > 86400) continue
    out.push({ kind, start, end })
  }
  return out
}

/** The host application supplies bounded, DNS-pinned HTTP; adapters never call global fetch. */
export type ProviderHttpRequest = {
  method?: 'POST'
  body?: string | Uint8Array
  /** Read only this many response bytes, for bounded media liveness probes. */
  readPrefixBytes?: number
}
export type ProviderHttpResponse = { status: number; text: string; url: string; headers?: Headers; bytes?: Uint8Array }
export type ProviderHttp = ((url: string, headers: Record<string, string>, signal: AbortSignal, init?: ProviderHttpRequest) => Promise<ProviderHttpResponse>) & {
  /** Present only for explicitly configured relay-discovery adapters. */
  mediaScope?: (hosts: readonly string[]) => ProviderHttp
}
export type ProviderTitleMetadataResolver = (ref: ProviderInput['ref'], signal: AbortSignal) => Promise<{ title: string; year: number }>
export const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36'

export class ProviderFailure extends Error {
  constructor(readonly code: 'empty' | 'timeout' | 'malformed' | 'unavailable' | 'blocked' | 'rate_limited', readonly retryAfterMs?: number) { super(code) }
}

export type ProviderOutcome = { code: 'ok' } | { code: ProviderFailure['code']; retryAfterMs?: number }

/** Shared lane classification keeps provider waterfalls consistent when adapters fan out. */
export function providerOutcome(error: unknown): ProviderOutcome {
  if (error instanceof ProviderFailure) return { code: error.code, ...(error.retryAfterMs !== undefined ? { retryAfterMs: error.retryAfterMs } : {}) }
  if (error instanceof z.ZodError || error instanceof SyntaxError) return { code: 'malformed' }
  if (error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')) return { code: 'timeout' }
  return { code: 'unavailable' }
}

/** Preserve actionable upstream blocks/rate limits across parallel lane results. */
export function providerFailureFromOutcomes(outcomes: readonly ProviderOutcome[]): ProviderFailure {
  const failures = outcomes.filter((outcome): outcome is Exclude<ProviderOutcome, { code: 'ok' }> => outcome.code !== 'ok')
  if (failures.some((outcome) => outcome.code === 'rate_limited')) {
    const retryAfterMs = Math.max(0, ...failures.filter((outcome) => outcome.code === 'rate_limited').map((outcome) => outcome.retryAfterMs ?? 0))
    return new ProviderFailure('rate_limited', retryAfterMs || undefined)
  }
  if (failures.some((outcome) => outcome.code === 'blocked')) return new ProviderFailure('blocked')
  if (failures.length && failures.every((outcome) => outcome.code === 'malformed')) return new ProviderFailure('malformed')
  if (failures.length && failures.every((outcome) => outcome.code === 'timeout')) return new ProviderFailure('timeout')
  if (failures.length && failures.every((outcome) => outcome.code === 'unavailable' || outcome.code === 'timeout')) return new ProviderFailure('unavailable')
  return new ProviderFailure('empty')
}

export function adapter(id: string, resolve: (input: ProviderInput, signal: AbortSignal) => Promise<ProviderSource[]>): ProviderAdapter {
  return { id, async resolve(input, signal) {
    try {
      signal.throwIfAborted()
      playbackRefSchema.parse(input.ref)
      const sources = await resolve(input, signal)
      signal.throwIfAborted()
      if (!sources.length) return { ok: false, code: 'empty', retryable: false }
      const result = providerResultSchema.safeParse({ ok: true, sources })
      if (!result.success || sources.some((source) => {
        try {
          const url = new URL(source.url)
          return !['http:', 'https:'].includes(url.protocol) || Boolean(url.username || url.password)
        } catch { return true }
      })) return { ok: false, code: 'malformed', retryable: false }
      return { ok: true, sources }
    } catch (error) {
      const code = signal.aborted ? (signal.reason?.name === 'TimeoutError' ? 'timeout' : 'cancelled')
        : error instanceof ProviderFailure ? error.code : error instanceof z.ZodError || error instanceof SyntaxError ? 'malformed' : 'unavailable'
      return { ok: false, code, retryable: code === 'timeout' || code === 'unavailable' || code === 'rate_limited', ...(error instanceof ProviderFailure && error.retryAfterMs !== undefined ? { retryAfterMs: error.retryAfterMs } : {}) }
    }
  } }
}

export function titlePath({ ref }: ProviderInput) {
  if (ref.kind === 'movie') return `/movie/${ref.id}`
  if (ref.kind === 'anime') return `/anime/${ref.id}/${ref.episode}`
  return `/tv/${ref.id}/${ref.season}/${ref.episode}`
}

export async function document(http: ProviderHttp, url: string, signal: AbortSignal, headers: Record<string, string> = {}, init?: ProviderHttpRequest) {
  const response = await http(url, { 'user-agent': userAgent, ...headers }, signal, init)
  if (response.status === 404) throw new ProviderFailure('empty')
  if (response.status === 403) throw new ProviderFailure('blocked')
  if (response.status === 429) {
    const value = response.headers?.get('retry-after')
    const seconds = value && /^\d{1,7}(?:\.\d+)?$/.test(value) ? Number(value) : value ? (Date.parse(value) - Date.now()) / 1000 : 0
    const retryAfterMs = Number.isFinite(seconds) && seconds > 0 ? Math.min(900_000, Math.ceil(seconds * 1000)) : undefined
    throw new ProviderFailure('rate_limited', retryAfterMs)
  }
  if (response.status < 200 || response.status >= 300) throw new ProviderFailure('unavailable')
  return response
}

/** Unknown upstream expiry gets a conservative refresh deadline, never a durable cache entry. */
export function accessDeadline(url: string, now: number, explicit?: number) {
  return sourceAccess(url, now, explicit).expiresAt
}

/** Distinguish a real upstream expiry from our conservative freshness timer.
 * The latter must not become a hard five-minute edge-media cutoff. */
export function sourceAccess(url: string, now: number, explicit?: number) {
  const query = new URL(url).searchParams
  // Some upstreams sign `expire` in seconds or milliseconds instead of the
  // `expires`/`exp` names; values at/above 1e12 are already milliseconds.
  const expireRaw = Number(query.get('expire') ?? 0)
  const expireMs = expireRaw >= 1e12 ? expireRaw : expireRaw * 1000
  const expiry = explicit ?? (expireMs > 0 ? expireMs : Number(query.get('expires') ?? query.get('exp') ?? 0) * 1000)
  const until = expiry > 0 ? Math.min(expiry, now + 1_800_000) : now + 300_000
  if (!Number.isFinite(until) || until <= now + 30_000) throw new ProviderFailure('empty')
  return { expiresAt: new Date(until).toISOString(), expiryEstimated: !(expiry > 0) }
}

export function mediaType(url: string, hint?: string): ProviderSource['type'] | undefined {
  // Proxy-wrapped delivery (e.g. `https://proxy.site/https%3A%2F%2Fcdn…%2Ffile.mp4%3Fsign%3D…`)
  // buries the real extension mid-path behind percent-encoding, so classify the
  // decoded stem too. Query and fragment never participate in classification.
  const candidates = [url]
  try {
    const decoded = decodeURIComponent(url)
    if (decoded !== url) candidates.push(decoded)
  } catch { /* keep the raw URL */ }
  const stem = (value: string) => value.split(/[?#]/)[0] ?? value
  if (candidates.some((candidate) => /\.m3u8$/i.test(stem(candidate))) || hint === 'hls') return 'hls'
  if (candidates.some((candidate) => /\.mp4$/i.test(stem(candidate))) || hint === 'mp4') return 'native'
  return undefined
}

/** Variant heights of an HLS master playlist, or null when the text is not a master. */
export function masterVariantHeights(text: string): number[] | null {
  if (!/#EXT-X-STREAM-INF/.test(text)) return null
  const heights: number[] = []
  for (const match of text.matchAll(/RESOLUTION=\d+x(\d+)/g)) {
    const height = Number.parseInt(match[1]!, 10)
    if (Number.isFinite(height) && height >= 144 && height <= 4320) heights.push(height)
  }
  return heights
}

/** Absolute media hosts referenced by an HLS playlist: segment and nested
 *  variant URIs on bare lines, plus EXT-X-MAP and EXT-X-KEY URIs. Relative
 *  references resolve against the playlist host and are not listed. */
export function playlistAbsoluteHosts(text: string): string[] {
  const hosts = new Set<string>()
  const absolute = (value: string | undefined) => {
    if (!value) return
    const trimmed = value.trim()
    const absoluteUrl = /^https?:\/\//i.test(trimmed) ? trimmed : trimmed.startsWith('//') ? `https:${trimmed}` : null
    if (!absoluteUrl) return
    try { hosts.add(new URL(absoluteUrl).hostname.toLowerCase()) } catch { /* ignore malformed */ }
  }
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('#')) {
      absolute(line.match(/#EXT-X-MAP:URI="([^"]+)"/)?.[1])
      absolute(line.match(/#EXT-X-KEY:[^\n]*URI="([^"]+)"/)?.[1])
      continue
    }
    absolute(line)
  }
  return [...hosts]
}

/** Verify HLS roots before selection so dead provider URLs never become sessions. */
export async function verifiedPlaybackSources(
  http: ProviderHttp,
  candidates: readonly ProviderSource[],
  signal: AbortSignal,
  refine?: ((source: ProviderSource, manifest: string) => ProviderSource) | undefined,
) {
  const verified: Array<ProviderSource | undefined> = new Array(candidates.length)
  let cursor = 0
  const worker = async () => {
    while (cursor < candidates.length) {
      const index = cursor++
      const source = candidates[index]!
      if (source.type !== 'hls') { verified[index] = source; continue }
      try {
        const response = await document(http, source.url, signal, source.headers)
        // Strict shared validation: error pages, empty playlists, and
        // unsupported manifest features fail closed into a skipped
        // candidate instead of a session.
        assertHlsManifest(response.text)
        const settled = { ...source, url: response.url }
        verified[index] = refine ? refine(settled, response.text) : settled
      } catch { signal.throwIfAborted() }
    }
  }
  await Promise.all(Array.from({ length: Math.min(2, candidates.length) }, worker))
  return verified.filter((source): source is ProviderSource => source !== undefined)
}
