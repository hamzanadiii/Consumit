import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, document, mediaType, ProviderFailure, userAgent, type ProviderHttp } from './http.ts'

const streamApi = 'https://streamdata.vaplayer.ru/api.php'
const playerOrigin = 'https://nextgencloudfabric.com'
const envelopeSchema = z.object({
  status_code: z.unknown(),
  data: z.unknown(),
  default_subs: z.unknown(),
})
const responseSchema = z.object({
  data: z.object({
    file_name: z.string().max(200).optional(),
    stream_urls: z.array(z.url().max(4096)).max(16),
  }),
  default_subs: z.array(z.object({
    lang: z.string().max(64), code: z.string().max(16), url: z.string().max(4096),
  })).max(32).default([]),
})

type Subtitle = { id: string; label: string; language: string; url: string; format: 'vtt' | 'srt' }

function inferQuality(fileName?: string): string {
  const name = (fileName ?? '').toLowerCase()
  if (/2160|4k/.test(name)) return '4K'
  if (/1080/.test(name)) return '1080p'
  if (/720/.test(name)) return '720p'
  if (/480/.test(name)) return '480p'
  return 'Auto'
}

/** Port of the supplied VidApi recipe: tmdb-keyed streamdata lookup (no IMDb
 *  identity needed) with first-party subtitles. No page scripts are executed. */
export function createVidapiProvider(http: ProviderHttp, now = Date.now) {
  return adapter('vidapi', async (input, signal) => {
    const { ref } = input
    const params = new URLSearchParams({ tmdb: String(ref.id), type: ref.kind === 'movie' ? 'movie' : 'tv' })
    if (ref.kind === 'series') { params.set('season', String(ref.season)); params.set('episode', String(ref.episode)) }
    const response = await document(http, `${streamApi}?${params}`, signal, {
      accept: 'application/json', origin: playerOrigin, referer: `${playerOrigin}/`,
      'x-requested-with': 'XMLHttpRequest',
    })
    const envelope = envelopeSchema.parse(JSON.parse(response.text))
    if (envelope.status_code !== 200 && envelope.status_code !== '200') throw new ProviderFailure('empty')
    const parsed = responseSchema.parse(envelope)
    if (!parsed.data.stream_urls.length) throw new ProviderFailure('empty')
    // Header-locked CDN delivery rides the lease-scoped relay, never the
    // browser directly.
    const headers = { referer: `${playerOrigin}/`, origin: playerOrigin, 'user-agent': userAgent }
    const quality = inferQuality(parsed.data.file_name)
    const sources: ProviderSource[] = []
    const seen = new Set<string>()
    for (const [index, url] of parsed.data.stream_urls.entries()) {
      if (seen.has(url)) continue
      // Extension-less manifests are common here; the HLS verification probe
      // keeps valid streams and drops the rest, so defaulting is safe.
      // Container URLs play as progressive native sources, like the recipe.
      const type = /\.mkv/i.test(url) ? 'native' : mediaType(url) ?? 'hls'
      seen.add(url)
      sources.push({ key: `vidapi:${quality.toLowerCase()}:${index}`, url, type,
        headers, expiresAt: accessDeadline(url, now()),
        language: 'original', qualityHint: quality, subtitles: [] })
      if (sources.length >= 32) break
    }
    if (!sources.length) throw new ProviderFailure('empty')
    const subtitles: Subtitle[] = []
    for (const [index, sub] of parsed.default_subs.entries()) {
      let parsedUrl: URL
      try { parsedUrl = new URL(sub.url) } catch { continue }
      if (parsedUrl.protocol !== 'https:') continue
      // The relay normalizes VTT/SRT only; styled formats travel no further.
      const ext = sub.url.split('.').pop()?.toLowerCase().split(/[?#]/)[0]
      if (ext !== 'vtt' && ext !== 'srt') continue
      subtitles.push({ id: `vidapi-sub-${index}`, label: sub.lang.slice(0, 64),
        language: (sub.code || sub.lang).slice(0, 32), url: sub.url, format: ext })
    }
    return sources.map((source) => ({ ...source, subtitles }))
  })
}
