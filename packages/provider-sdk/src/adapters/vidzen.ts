import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, mediaType, ProviderFailure, titlePath, userAgent, type ProviderHttp } from './http.ts'

// Port of the PROVE VidZen recipe (providers/vidzen/vidzen.ts, reversed
// 2026-09-27 from the vidking-bundle client on vidcore.org's watch page):
//   GET /api/sources?type=movie&id={tmdbId}
//   GET /api/sources?type=tv&id={tmdbId}&season={s}&episode={e}
//   -> { sources: [{ url, label, server, type? }], subtitles: [...] }
// Relative /api/stream/... URLs resolve against the base and play raw
// (CORS-permissive); absolute https://free.finepulfe.xyz/.../playlist.m3u8
// masters play browser-direct too. Servers seen: sv-ps, sv-vn-l, sv-pi.
// An optional sourcePool object carries extra per-server failover sources.
//
// Since the 2026-10-08 check /api/sources answers 401 TOKEN_MISSING unless the
// request carries the per-title `apiToken` the site mints into its own player
// page (payload { id, type, s?, ep?, iat, exp }, fifteen-minute life, bound to
// that exact title), so each resolve reads /movie/{id} or /tv/{id}/{s}/{e}
// first and passes the token through. A token for another title is refused
// with 401 Token ID mismatch.
//
// The same check found /api/stream/... refusing every request that does not
// carry an authorized Vidzen session: no Referer at all answers 401, a foreign
// Referer or Origin answers 403 Hotlinking prohibited, and only the site's own
// origin plus loopback dev origins pass. Sources therefore carry the
// `referer` hint so the server-side verification fetch gets a 200. The row
// stays browser-direct (ADR 0005) all the same: each media playlist re-rolls
// the third-party segment hosts it names on every fetch, so no exact-host
// relay lease can ever cover the graph, and the loopback allowance is what
// lets local Watch playback succeed while the production origin is refused
// upstream.
const apiOrigin = 'https://vidzen.fun'
const clientHeaders = { 'user-agent': userAgent, accept: 'application/json', referer: `${apiOrigin}/` }
const pageHeaders = { 'user-agent': userAgent, accept: 'text/html,application/xhtml+xml', referer: `${apiOrigin}/` }

const STEP_TIMEOUT_MS = 10_000
const PAGE_TIMEOUT_MS = 6_000

/** The player page carries the token inside its streamed payload; the first
 *  `apiToken` that opens with a signed `eyJ…` body is the live one. */
function readApiToken(html: string) {
  for (let from = 0; from < html.length;) {
    const anchor = html.indexOf('apiToken', from)
    if (anchor < 0) return undefined
    const window = html.slice(anchor, anchor + 400)
    const start = window.indexOf('eyJ')
    if (start >= 0) {
      const token = /^[A-Za-z0-9._-]+/.exec(window.slice(start))?.[0]
      if (token?.includes('.')) return token
    }
    from = anchor + 1
  }
  return undefined
}

const sourceSchema = z.object({
  url: z.string().max(4096).optional(),
  label: z.string().max(64).optional(),
  server: z.string().max(64).optional(),
  type: z.string().max(16).optional(),
}).passthrough()

const responseSchema = z.object({
  sources: z.array(sourceSchema).max(64).optional(),
  sourcePool: z.record(z.string(), z.unknown()).optional(),
  subtitles: z.array(z.object({
    url: z.string().max(4096).optional(),
    file: z.string().max(4096).optional(),
    label: z.string().max(128).optional(),
    lang: z.string().max(32).optional(),
  }).passthrough()).max(64).optional(),
}).passthrough()

export type VidzenOptions = { id?: string }

function bounded(parent: AbortSignal, ms: number) {
  const controller = new AbortController()
  if (parent.aborted) controller.abort(parent.reason)
  const onAbort = () => controller.abort(parent.reason)
  parent.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(new DOMException('VidZen step timed out', 'TimeoutError')), ms)
  return { signal: controller.signal, cleanup: () => { clearTimeout(timer); parent.removeEventListener('abort', onAbort) } }
}

export function createVidzenProvider(http: ProviderHttp, now = Date.now, options: VidzenOptions = {}) {
  const id = options.id ?? 'vidzen'

  return adapter(id, async (input, signal) => {
    const { ref } = input
    if (ref.kind !== 'movie' && ref.kind !== 'series') throw new ProviderFailure('empty')
    const isTv = ref.kind === 'series'
    if (isTv && (!ref.season || !ref.episode)) throw new ProviderFailure('empty')
    const query = isTv
      ? `type=tv&id=${encodeURIComponent(String(ref.id))}&season=${ref.season}&episode=${ref.episode}`
      : `type=movie&id=${encodeURIComponent(String(ref.id))}`

    const pageOp = bounded(signal, PAGE_TIMEOUT_MS)
    let token: string
    try {
      const page = await http(`${apiOrigin}${titlePath(input)}`, pageHeaders, pageOp.signal)
      if (page.status === 404) throw new ProviderFailure('empty')
      if (page.status < 200 || page.status >= 300) throw new ProviderFailure('unavailable')
      const minted = readApiToken(page.text)
      if (!minted) throw new ProviderFailure('unavailable')
      token = minted
    } catch (error) {
      if (error instanceof ProviderFailure) throw error
      throw new ProviderFailure('unavailable')
    } finally {
      pageOp.cleanup()
    }

    const op = bounded(signal, STEP_TIMEOUT_MS)
    let data: z.infer<typeof responseSchema>
    try {
      const response = await http(`${apiOrigin}/api/sources?${query}&token=${encodeURIComponent(token)}`, clientHeaders, op.signal)
      if (response.status === 404) throw new ProviderFailure('empty')
      if (response.status < 200 || response.status >= 300) throw new ProviderFailure('unavailable')
      data = responseSchema.parse(JSON.parse(response.text))
    } catch (error) {
      if (error instanceof ProviderFailure) throw error
      throw new ProviderFailure('malformed')
    } finally {
      op.cleanup()
    }

    const raw: z.infer<typeof sourceSchema>[] = [...(data.sources ?? [])]
    // Per-server pool (sv-ps/sv-vn-l/sv-pi): extra failover sources.
    const pool = data.sourcePool
    if (pool && typeof pool === 'object') {
      for (const name of Object.keys(pool)) {
        const entry = (pool as Record<string, unknown>)[name]
        const list = Array.isArray(entry) ? entry : (entry && typeof entry === 'object' ? (entry as Record<string, unknown>).sources : undefined)
        if (!Array.isArray(list)) continue
        for (const item of list) {
          if (item && typeof item === 'object') {
            const record = item as Record<string, unknown>
            const parsed = sourceSchema.safeParse({ ...record, server: record.server ?? name })
            if (parsed.success) raw.push(parsed.data)
          }
          if (raw.length >= 12) break
        }
        if (raw.length >= 12) break
      }
    }

    const subtitles: ProviderSource['subtitles'] = []
    const seenSubs = new Set<string>()
    for (const sub of data.subtitles ?? []) {
      const file = String(sub.file ?? sub.url ?? '')
      if (!file.startsWith('https://') || seenSubs.has(file) || subtitles.length >= 20) continue
      seenSubs.add(file)
      const label = String(sub.label ?? sub.lang ?? 'Unknown').slice(0, 64)
      subtitles.push({
        id: `${id}-sub-${subtitles.length}`,
        label,
        language: label.slice(0, 32),
        url: file,
        format: /\.srt/i.test(file) ? 'srt' : 'vtt',
      })
    }

    const sources: ProviderSource[] = []
    const seen = new Set<string>()
    for (const [index, item] of raw.entries()) {
      let url = String(item.url ?? '').trim()
      if (!url) continue
      if (url.startsWith('/')) url = `${apiOrigin}${url}`
      if (!url.startsWith('https://') || seen.has(url)) continue
      const type = mediaType(url) ?? (/\.mp4(\?|#|$)/i.test(url) ? 'native' : 'hls')
      const label = String(item.label ?? item.server ?? 'VidZen')
      const height = Number.parseInt(/(\d{3,4})\s*p/i.exec(label)?.[1] ?? '0', 10)
      let expiresAt: string
      try {
        expiresAt = accessDeadline(url, now())
      } catch {
        continue
      }
      seen.add(url)
      sources.push({
        key: `${id}:${height > 0 ? `${height}p` : 'auto'}:${index}`,
        url,
        type,
        qualityHint: height > 0 ? `${height}p` : 'Auto',
        expiresAt,
        language: 'original',
        headers: { referer: `${apiOrigin}/` },
        subtitles,
        ...(height > 0 ? { height } : {}),
      })
      if (sources.length >= 32) break
    }
    if (!sources.length) throw new ProviderFailure('empty')
    return sources
  })
}
