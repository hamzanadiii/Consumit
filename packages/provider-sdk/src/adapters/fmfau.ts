import { z } from 'zod'
import { allowedMediaUrl } from '../index.ts'
import { adapter, document, mediaType, ProviderFailure, sourceAccess, verifiedPlaybackSources, type ProviderHttp } from './http.ts'

// Port of PROVE/providers/fmfau/fmfau.ts: movie-web v2 fork (P-Stream family,
// "no ads ever") resolving through a public, ungated HTTP API:
//   GET /api/sources/moovie?tmdbId={id}&mediaType=movie&title=&year=&imdbId=
//        &sub=vaplayer&audioPreference=sub
//   GET /api/sources/moovie?tmdbId={id}&mediaType=show&title=&year=&imdbId=
//        &season={s}&episode={e}&sub=vaplayer&audioPreference=sub
//   -> { ok, provider, streams: [{ url, quality, type, headers, name }] }
// Stream URLs are self-proxy wraps: https://hahaevilcraft.site/proxy?u=<b64url
// real>&h=<b64url-json-headers> (vaplayer family). The proxy answers
// application/vnd.apple.mpegurl + ACAO:* to ANY Referer (moovie.fun,
// fmfau.com, none, empty — all probed 200 + #EXTM3U) so browser-direct works;
// the roster row keeps deliveryMode: 'direct'. Variant/segment legs are also
// proxy-wrapped (same host, same ACAO:*). Catalog gate: unknown tmdb ids ->
// ok:true streams:[] (empty). Subtitles: none seen on the source leg.
const origin = 'https://fmfau.com'
const apiPath = '/api/sources/moovie'
const mediaHosts = ['hahaevilcraft.site']
const clientHeaders = { referer: `${origin}/`, origin, accept: 'application/json' }

const streamsSchema = z.object({
  ok: z.boolean().optional(),
  streams: z.array(z.object({
    url: z.string().max(4096).optional(),
    quality: z.union([z.string(), z.number()]).optional(),
    type: z.string().max(16).optional(),
    headers: z.record(z.string(), z.string()).optional(),
    name: z.string().max(64).optional(),
  }).passthrough()).max(32).default([]),
}).passthrough()

function mediaUrl(value: string) {
  const url = new URL(value)
  // The /proxy path is a self-proxy wrap on an explicitly allowlisted host;
  // validatedSources applies its relay-vs-direct policy to it at the seam.
  if (!allowedMediaUrl(url, mediaHosts)) throw new ProviderFailure('malformed')
  return url.href
}

export function createFmfauProvider(http: ProviderHttp, now = Date.now) {
  return adapter('fmfau', async (input, signal) => {
    const { ref } = input
    const isTv = ref.kind === 'series'
    if ((ref.kind !== 'movie' && !isTv) || (isTv && (!ref.season || !ref.episode))) throw new ProviderFailure('empty')
    const query = new URLSearchParams({
      tmdbId: String(ref.id),
      mediaType: isTv ? 'show' : 'movie',
      title: '',
      sub: 'vaplayer',
      audioPreference: 'sub',
    })
    if (isTv) {
      query.set('season', String(ref.season))
      query.set('episode', String(ref.episode))
    }
    const bounded = AbortSignal.any([signal, AbortSignal.timeout(12_000)])
    const response = await document(http, `${origin}${apiPath}?${query}`, bounded, clientHeaders)
    if (new URL(response.url).origin !== origin) throw new ProviderFailure('malformed')
    const data = streamsSchema.parse(JSON.parse(response.text))
    const candidates = []
    const seen = new Set<string>()
    let failure: unknown
    for (const [index, item] of data.streams.entries()) {
      try {
        const url = mediaUrl(String(item.url ?? ''))
        if (seen.has(url)) continue
        seen.add(url)
        const hint = item.type?.toLowerCase()
        const type = hint === 'dash' ? 'dash' as const : mediaType(url, hint === 'hls' ? 'hls' : hint === 'mp4' ? 'mp4' : undefined)
        if (!type) continue
        const q = Number(item.quality)
        const height = Number.isFinite(q) && q >= 144 && q <= 4320 ? q : undefined
        const access = sourceAccess(url, now())
        candidates.push({
          key: `fmfau:${index}`,
          url, type,
          expiresAt: access.expiresAt,
          ...(access.expiryEstimated ? { expiryEstimated: true } : {}),
          language: 'original',
          // The proxy answers ACAO:* to any Referer; no provider headers needed.
          headers: {},
          subtitles: [],
          ...(height ? { height, qualityHint: `${height}p` } : { qualityHint: 'auto' }),
        })
      } catch (error) { failure = error }
    }
    if (!candidates.length) throw failure ?? new ProviderFailure('empty')
    const verified = await verifiedPlaybackSources(http, candidates, bounded)
    if (!verified.length) throw failure ?? new ProviderFailure('empty')
    return verified
  })
}
