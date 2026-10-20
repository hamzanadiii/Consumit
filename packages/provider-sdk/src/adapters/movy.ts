import { z } from 'zod'
import { allowedMediaUrl, isRelayMediaUrl, type ProviderSource } from '../index.ts'
import { adapter, document, mediaType, ProviderFailure, sourceAccess, verifiedPlaybackSources, type ProviderHttp } from './http.ts'

// Port of PROVE/providers/movy/movy.ts: key-gated plain-JSON resolver on
// api.movy.lol resolving to direct img.rousav.tech HLS masters (movies strong,
// the TV episode database only indexes recent uploads, so the roster registers
// movy for movies alone). Masters carry EXT-X-MEDIA audio lanes that
// separate-audio discovery walks and shared-host subtitle playlists.
const origin = 'https://api.movy.lol'
const key = '0f461eaa465bb2a7acd037425217f2f209ef540a3171e1ac'
const hosts = ['img.rousav.tech']
// The CDN serves its nested playlists reliably only while an Origin header is
// present. Direct delivery never attaches provider headers from the browser
// (the app origin rides along there); this hint covers every server-side walk.
const sourceHeaders = { origin: 'https://www.movy.sx' }
const resultSchema = z.object({
  sources: z.array(z.object({
    url: z.string().min(1).max(4096),
    quality: z.string().max(64).optional(),
    type: z.string().max(64).optional(),
  })).max(32).default([]),
})

function mediaUrl(value: string) {
  const url = new URL(value)
  if (!allowedMediaUrl(url, hosts) || isRelayMediaUrl(url)) throw new ProviderFailure('malformed')
  return url.href
}

export function createMovyProvider(http: ProviderHttp, now = Date.now) {
  return Object.assign(adapter('movy', async (input, signal) => {
    if (input.ref.kind === 'anime') throw new ProviderFailure('empty')
    const { id } = input.ref
    const path = input.ref.kind === 'movie' ? `/api/source/${id}` : `/api/tv/${id}/${input.ref.season}/${input.ref.episode}`
    const bounded = AbortSignal.any([signal, AbortSignal.timeout(12_000)])
    const response = await document(http, `${origin}${path}?api_key=${key}`, bounded, { accept: 'application/json' })
    if (new URL(response.url).origin !== origin) throw new ProviderFailure('malformed')
    const data = resultSchema.parse(JSON.parse(response.text))
    const candidates: ProviderSource[] = []
    const seen = new Set<string>()
    let failure: unknown
    for (const [index, item] of data.sources.entries()) {
      try {
        const url = mediaUrl(item.url)
        if (seen.has(url)) continue
        seen.add(url)
        const hint = item.type?.toLowerCase()
        const type = mediaType(url, hint === 'm3u8' ? 'hls' : hint === 'mp4' ? 'mp4' : undefined)
        if (!type) continue
        const quality = item.quality ?? ''
        const height = /2160|4k/i.test(quality) ? 2160 : /1080/.test(quality) ? 1080 : /720/.test(quality) ? 720 : /480/.test(quality) ? 480 : undefined
        const access = sourceAccess(url, now())
        candidates.push({
          key: `${input.ref.kind}:${index}`,
          url, type,
          expiresAt: access.expiresAt,
          ...(access.expiryEstimated ? { expiryEstimated: true } : {}),
          language: 'original',
          headers: { ...sourceHeaders },
          subtitles: [],
          ...(height ? { height, qualityHint: `${height}p` } : { qualityHint: 'auto' }),
        })
      } catch (error) { failure = error }
    }
    if (!candidates.length) throw failure ?? new ProviderFailure('empty')
    // One bounded master fetch per candidate: dead or non-HLS roots never
    // become sessions, and redirects settle on the final media URL.
    const verified = await verifiedPlaybackSources(http, candidates, bounded)
    if (!verified.length) throw failure ?? new ProviderFailure('empty')
    return verified
  }), { separateAudio: { label: 'Movy' } })
}
