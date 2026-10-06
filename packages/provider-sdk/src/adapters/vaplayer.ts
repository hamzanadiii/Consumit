import { z } from 'zod'
import type { ProviderIdentityResolver, ProviderSource } from '../index.ts'
import { sourceAccess, adapter, document, mediaType, ProviderFailure, userAgent, verifiedPlaybackSources, type ProviderHttp } from './http.ts'

const streamApi = 'https://streamdata.vaplayer.ru/api.php'
const playerOrigin = 'https://nextgencloudfabric.com'
const responseSchema = z.object({
  status_code: z.union([z.literal(200), z.literal('200')]),
  data: z.object({
    file_name: z.string().max(200).optional(),
    stream_urls: z.array(z.url().max(4096)).max(8),
  }),
})

function inferQuality(fileName?: string): { qualityHint: string; height?: number } {
  const name = (fileName ?? '').toLowerCase()
  if (/2160|4k/.test(name)) return { qualityHint: '4K', height: 2160 }
  const match = name.match(/(1080|720|480|360)p/)
  if (match?.[1]) {
    const height = Number.parseInt(match[1], 10)
    return { qualityHint: `${height}p`, height }
  }
  return { qualityHint: 'Auto · up to 1080p' }
}

/** VAPlayer resolves by IMDb identity and returns adaptive HLS/progressive media. */
export function createVaPlayerProvider(http: ProviderHttp, identity: ProviderIdentityResolver, now = Date.now) {
  return adapter('vaplayer', async (input, signal) => {
    const { imdbId } = await identity(input.ref, signal)
    if (!imdbId || !/^tt\d{5,12}$/.test(imdbId)) throw new ProviderFailure('empty')
    const params = new URLSearchParams({ imdb: imdbId, type: input.ref.kind === 'movie' ? 'movie' : 'tv' })
    const embed = input.ref.kind === 'movie'
      ? `${playerOrigin}/embed/movie/${imdbId}`
      : `${playerOrigin}/embed/tv/${imdbId}/${input.ref.season}/${input.ref.episode}`
    if (input.ref.kind === 'series') {
      params.set('season', String(input.ref.season))
      params.set('episode', String(input.ref.episode))
    }
    const response = await document(http, `${streamApi}?${params}`, signal, {
      accept: 'application/json', origin: playerOrigin, referer: embed,
    })
    const parsed = responseSchema.parse(JSON.parse(response.text))
    const seen = new Set<string>()
    const sources: ProviderSource[] = []
    const { qualityHint, height } = inferQuality(parsed.data.file_name)
    for (const url of parsed.data.stream_urls) {
      if (seen.has(url)) continue
      seen.add(url)
      // Extension-less manifests are common here; the HLS verification probe
      // keeps valid streams and drops the rest, so defaulting is safe.
      const type = mediaType(url) ?? 'hls'
      // Several CDN nodes gate on the site referer, so these sources ride the
      // lease-scoped relay like every other header-locked adapter instead of
      // playing cross-origin direct (hotlink 403s, no nested-manifest rewrite).
      sources.push({
        key: `adaptive-${sources.length + 1}`,
        url,
        type,
        headers: { referer: `${playerOrigin}/`, origin: playerOrigin, 'user-agent': userAgent },
        language: 'original',
        qualityHint,
        ...(height === undefined ? {} : { height }),
        ...sourceAccess(url, now()),
        subtitles: [],
      })
    }
    return verifiedPlaybackSources(http, sources, signal)
  })
}
