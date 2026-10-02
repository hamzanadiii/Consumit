import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, mediaType, ProviderFailure, userAgent, type ProviderHttp } from './http.ts'

// Port of the PROVE VidZen recipe (providers/vidzen/vidzen.ts, reversed
// 2026-09-27 from the vidking-bundle client on vidcore.org's watch page):
//   GET /api/sources?type=movie&id={tmdbId}
//   GET /api/sources?type=tv&id={tmdbId}&season={s}&episode={e}
//   -> { sources: [{ url, label, server, type? }], subtitles: [...] }
// Relative /api/stream/... URLs resolve against the base and play raw
// (CORS-permissive); absolute https://free.finepulfe.xyz/.../playlist.m3u8
// masters play browser-direct too. Servers seen: sv-ps, sv-vn-l, sv-pi.
// An optional sourcePool object carries extra per-server failover sources.
// CORS-permissive origins, no hotlink gate, so sources ride no headers.
const apiOrigin = 'https://vidzen.fun'
const clientHeaders = { 'user-agent': userAgent, accept: 'application/json', referer: `${apiOrigin}/` }

const STEP_TIMEOUT_MS = 10_000

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

    const op = bounded(signal, STEP_TIMEOUT_MS)
    let data: z.infer<typeof responseSchema>
    try {
      const response = await http(`${apiOrigin}/api/sources?${query}`, clientHeaders, op.signal)
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
        headers: {},
        subtitles,
        ...(height > 0 ? { height } : {}),
      })
      if (sources.length >= 32) break
    }
    if (!sources.length) throw new ProviderFailure('empty')
    return sources
  })
}
