import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, mediaType, ProviderFailure, userAgent, type ProviderHttp, type ProviderTitleMetadataResolver } from './http.ts'

// Port of the PROVE MovieNight recipe (verified live 2026-10-09):
//   GET /api/stream/v1/movie/{tmdbId}?title={title}
//   GET /api/stream/v1/tv/{tmdbId}/{s}/{e}?title={title}
//     Accept: text/event-stream   (server-sent events)
//   -> data: {"codename":"vienna"} ... data: {"server":"vienna",
//      "sources":[{"url":...}], "subtitles":[{url,language,...}]}
// Streams: proxy.scrapeequalsgayporn.st/api/stream/proxy?u=<b64 uccdn>
// (cloudwindow-route.com HLS urlsets). Direct-bar VERIFIED bare:
// master/variant/segment all 200/206 + ACAO *. Subs: 33-62 per title.
// Single "auto" rung per title; 4h signed URLs. Retry with &server=madison.

const baseOrigin = 'https://movienig.ht'
const clientHeaders = {
  'user-agent': userAgent,
  accept: 'text/event-stream, */*',
  referer: `${baseOrigin}/`,
  origin: baseOrigin,
}

const ssePayloadSchema = z.object({
  server: z.string().max(64).optional(),
  sources: z.array(z.object({ url: z.string().max(4096).optional() }).passthrough()).max(32).optional(),
  subtitles: z.array(z.object({
    url: z.string().max(4096).optional(),
    language: z.string().max(64).optional(),
    lang: z.string().max(64).optional(),
    label: z.string().max(128).optional(),
    format: z.string().max(16).optional(),
  }).passthrough()).max(64).optional(),
}).passthrough()

export function createMovieNightProvider(http: ProviderHttp, resolveMetadata: ProviderTitleMetadataResolver, now = Date.now) {
  return adapter('movienight', async (input, signal) => {
    const { ref } = input
    const isTv = ref.kind === 'series'
    if ((ref.kind !== 'movie' && !isTv) || (isTv && (!ref.season || !ref.episode))) throw new ProviderFailure('empty')

    const title = (await resolveMetadata(ref, signal)).title.trim()
    if (!title) throw new ProviderFailure('empty')
    const path = isTv
      ? `/api/stream/v1/tv/${ref.id}/${ref.season}/${ref.episode}?title=${encodeURIComponent(title)}`
      : `/api/stream/v1/movie/${ref.id}?title=${encodeURIComponent(title)}`

    let payload = await sseResolve(http, path, signal)
    if (!payload?.sources?.length) {
      payload = await sseResolve(http, `${path}&server=madison`, signal)
    }
    const urls = (payload?.sources ?? [])
      .map(s => s.url?.trim())
      .filter((u): u is string => !!u && /^https:\/\//.test(u))
    if (!urls.length) throw new ProviderFailure('empty')

    const subtitles = mapSubtitles(payload?.subtitles)
    const sources: ProviderSource[] = []
    const seen = new Set<string>()
    for (const url of urls) {
      if (sources.length >= 4 || seen.has(url)) continue
      seen.add(url)
      let expiresAt: string
      try { expiresAt = accessDeadline(url, now()) } catch { continue }
      sources.push({
        key: `movienight:${sources.length}`,
        url,
        type: mediaType(url) ?? 'hls',
        qualityHint: 'Auto',
        language: 'original',
        headers: {},
        subtitles,
        expiresAt,
      })
    }
    if (!sources.length) throw new ProviderFailure('empty')
    return sources
  })
}

/** One SSE response -> the first data: event carrying a sources array. */
async function sseResolve(http: ProviderHttp, path: string, signal: AbortSignal): Promise<z.infer<typeof ssePayloadSchema> | null> {
  const op = bounded(signal, 15000)
  try {
    const res = await http(`${baseOrigin}${path}`, clientHeaders, op.signal)
    if (res.status < 200 || res.status >= 300) return null
    for (const line of res.text.split('\n')) {
      if (line.startsWith('data:') && line.includes('"sources"')) {
        try {
          return ssePayloadSchema.parse(JSON.parse(line.slice(5).trim()))
        } catch {
          /* partial frame — keep scanning */
        }
      }
    }
    return null
  } catch {
    return null
  } finally {
    op.cleanup()
  }
}

function bounded(parent: AbortSignal, ms: number) {
  const controller = new AbortController()
  if (parent.aborted) controller.abort(parent.reason)
  const onAbort = () => controller.abort(parent.reason)
  parent.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(new DOMException('MovieNight request timed out', 'TimeoutError')), ms)
  return { signal: controller.signal, cleanup: () => { clearTimeout(timer); parent.removeEventListener('abort', onAbort) } }
}

function mapSubtitles(list: z.infer<typeof ssePayloadSchema>['subtitles']): ProviderSource['subtitles'] {
  const out: ProviderSource['subtitles'] = []
  const seen = new Set<string>()
  for (const sub of list ?? []) {
    const url = sub.url?.trim()
    if (!url?.startsWith('https://') || seen.has(url) || out.length >= 20) continue
    seen.add(url)
    const label = (sub.label ?? sub.language ?? sub.lang ?? 'Unknown').slice(0, 64) || 'Unknown'
    out.push({
      id: `movienight-sub-${out.length}`,
      label,
      language: label.slice(0, 32),
      url,
      format: /vtt/i.test(String(sub.format ?? '')) || url.toLowerCase().endsWith('.vtt') ? 'vtt' : 'srt',
    })
  }
  return out
}
