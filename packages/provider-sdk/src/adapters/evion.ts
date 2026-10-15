import { z } from 'zod'
import { allowedMediaUrl, isRelayMediaUrl, type ProviderSource } from '../index.ts'
import { inspectHlsManifest } from '../manifest.ts'
import { accessDeadline, adapter, document, mediaType, ProviderFailure, type ProviderHttp } from './http.ts'

// Port of PROVE/providers/evion/evion.ts: exact TMDB TV episode, direct CDN.
const origin = 'https://api.bingr.one'
const hosts = ['img.animecurx.tech']
const resultSchema = z.object({ sources: z.array(z.object({
  url: z.string().min(1).max(4096), type: z.string().max(64).optional(),
  quality: z.string().max(64).optional(), name: z.string().max(128).optional(),
})).max(32).optional() })

function directUrl(value: string, base?: string) {
  const url = new URL(value, base)
  if (!allowedMediaUrl(url, hosts) || isRelayMediaUrl(url)) throw new ProviderFailure('malformed')
  return url.href
}

async function verify(http: ProviderHttp, root: string, type: ProviderSource['type'], signal: AbortSignal) {
  let current = root
  if (type === 'hls') {
    let segmentFound = false
    for (let depth = 0; depth < 3; depth++) {
      const response = await document(http, current, signal, { accept: 'application/vnd.apple.mpegurl' })
      directUrl(response.url)
      const { kind, references: refs } = inspectHlsManifest(response.text, response.url)
      if (!refs.length) throw new ProviderFailure('malformed')
      for (const ref of refs) directUrl(ref.url)
      if (kind === 'master') {
        const variant = response.text.split(/\r?\n/).map(line => line.trim()).find(line => line && !line.startsWith('#'))
        if (!variant) throw new ProviderFailure('malformed')
        current = directUrl(variant, response.url)
        continue
      }
      const segment = refs.find(ref => ref.media)
      if (!segment) throw new ProviderFailure('empty')
      current = segment.url
      segmentFound = true
      break
    }
    if (!segmentFound) throw new ProviderFailure('malformed')
  }
  const prefix = await document(http, current, signal, { range: 'bytes=0-16383' }, { readPrefixBytes: 16_384 })
  directUrl(prefix.url)
  if ((prefix.bytes?.length ?? Buffer.byteLength(prefix.text)) < 1000 || /(?:text\/html|application\/json)/i.test(prefix.headers?.get('content-type') ?? '')) throw new ProviderFailure('empty')
}

export function createEvionProvider(http: ProviderHttp, now = Date.now) {
  return adapter('evion', async (input, signal) => {
    if (input.ref.kind !== 'series') throw new ProviderFailure('empty')
    const { id, season, episode } = input.ref
    const bounded = AbortSignal.any([signal, AbortSignal.timeout(12_000)])
    const response = await document(http, `${origin}/api/stream/aphelion-tv/${id}/${season}/${episode}`, bounded, { accept: 'application/json' })
    if (new URL(response.url).origin !== origin) throw new ProviderFailure('malformed')
    const data = resultSchema.parse(JSON.parse(response.text))
    const sources: ProviderSource[] = []
    const seen = new Set<string>()
    let failure: unknown
    for (const item of (data.sources ?? []).slice(0, 4)) {
      try {
        const url = directUrl(item.url)
        if (seen.has(url)) continue
        seen.add(url)
        const hint = item.type?.toLowerCase()
        const type = mediaType(url, hint?.includes('mpegurl') ? 'hls' : hint)
        if (!type) continue
        const expiresAt = accessDeadline(url, now())
        await verify(http, url, type, bounded)
        const quality = item.quality || item.name || ''
        const height = /2160|4k/i.test(quality) ? 2160 : /1080/.test(quality) ? 1080 : /720/.test(quality) ? 720 : /480/.test(quality) ? 480 : undefined
        sources.push({ key: `tv:${season}:${episode}:${sources.length}`, url, type, expiresAt, language: 'original', headers: {}, subtitles: [],
          ...(height ? { height, qualityHint: `${height}p` } : { qualityHint: 'auto' }) })
      } catch (error) { failure = error }
    }
    if (!sources.length) throw failure ?? new ProviderFailure('empty')
    return sources
  })
}
