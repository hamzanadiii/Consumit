import { z } from 'zod'
import type { PlaybackRef } from '@consumit/contracts'
import { allowedMediaUrl, isRelayMediaUrl, type ProviderSource } from '../index.ts'
import { assertHlsManifest, parseHlsReferences } from '../manifest.ts'
import { sealCinejoyRequest } from './cinejoy-gate.ts'
import { accessDeadline, adapter, document, masterVariantHeights, ProviderFailure, type ProviderHttp } from './http.ts'

const apiOrigin = 'https://api.wing.st'
const directHosts = ['api.wing.st', 'cheaptruckrepairs.cc', '*.cheaptruckrepairs.cc']
type CinejoyMetadataResolver = (ref: PlaybackRef, signal: AbortSignal) => Promise<{ title: string; year: number; imdbId?: string | undefined }>
const resultSchema = z.object({
  data: z.object({ stream: z.array(z.object({
    playlist: z.string().max(4096),
    captions: z.array(z.object({ url: z.string().max(4096), language: z.string().max(64).optional() })).max(32).optional(),
  })).max(4).optional() }).optional(),
})

export function createCinejoyLisbonProvider(http: ProviderHttp, metadata: CinejoyMetadataResolver, now = Date.now) {
  const directUrl = (url: string) => allowedMediaUrl(url, directHosts) && !isRelayMediaUrl(url)

  async function verify(url: string, signal: AbortSignal) {
    let current = url
    let height: number | undefined
    for (let depth = 0; depth < 3; depth++) {
      if (!directUrl(current)) throw new ProviderFailure('empty')
      const response = await document(http, current, signal)
      if (!directUrl(response.url)) throw new ProviderFailure('empty')
      const kind = assertHlsManifest(response.text)
      const refs = parseHlsReferences(response.text, response.url)
      if (!refs.length || !refs.every(directUrl)) throw new ProviderFailure('empty')
      if (kind === 'master') {
        const heights = masterVariantHeights(response.text) ?? []
        if (heights.length) height = Math.max(...heights)
        const first = response.text.split(/\r?\n/).map(line => line.trim()).find(line => line && !line.startsWith('#'))
        if (!first) throw new ProviderFailure('empty')
        current = new URL(first, response.url).href
      } else {
        const first = response.text.split(/\r?\n/).map(line => line.trim()).find(line => line && !line.startsWith('#'))
        if (!first) throw new ProviderFailure('empty')
        const segment = new URL(first, response.url).href
        const live = await document(http, segment, signal, { range: 'bytes=0-1023' }, { readPrefixBytes: 1024 })
        if (!directUrl(live.url) || (live.bytes?.byteLength ?? Buffer.byteLength(live.text)) < 100) throw new ProviderFailure('empty')
        return height
      }
    }
    throw new ProviderFailure('empty')
  }

  return adapter('cinejoylisbon', async ({ ref }, signal) => {
    if (ref.kind !== 'movie' && ref.kind !== 'series') throw new ProviderFailure('empty')
    const meta = await metadata(ref, signal)
    const payload = {
      tmdb: String(ref.id),
      ...(ref.kind === 'series' ? { season: String(ref.season), episode: String(ref.episode) } : {}),
      imdb: meta.imdbId ?? '', year: String(meta.year), title: meta.title,
    }
    const results = await Promise.allSettled(['Lisbon', 'Scout'].map(async chip => {
      const scoped = AbortSignal.any([signal, AbortSignal.timeout(9000)])
      const sealed = sealCinejoyRequest(JSON.stringify({ path: `/${chip}/${ref.kind === 'series' ? 'series' : 'movie'}`, payload }))
      const response = await document(http, `${apiOrigin}/g`, scoped, { 'content-type': 'text/plain;charset=UTF-8' }, { method: 'POST', body: sealed.body })
      if (!response.bytes) throw new ProviderFailure('malformed')
      const result = resultSchema.parse(JSON.parse(sealed.open(response.bytes)))
      const sources: ProviderSource[] = []
      for (const [index, stream] of (result.data?.stream ?? []).entries()) {
        if (!directUrl(stream.playlist)) continue
        const height = await verify(stream.playlist, scoped)
        sources.push({
          key: `${chip.toLowerCase()}:${index}`, url: stream.playlist, type: 'hls', language: 'original',
          expiresAt: accessDeadline(stream.playlist, now()), headers: {},
          qualityHint: height ? `${height}p` : 'Auto', ...(height ? { height } : {}),
          subtitles: (stream.captions ?? []).map((caption, i) => ({
            id: `${chip.toLowerCase()}-sub-${i}`, url: caption.url, label: caption.language ?? 'Subtitle',
            language: (caption.language ?? 'und').slice(0, 10).toLowerCase(), format: /\.srt(?:\?|$)/i.test(caption.url) ? 'srt' as const : 'vtt' as const,
          })),
        })
      }
      return sources
    }))
    const sources: ProviderSource[] = []
    const seen = new Set<string>()
    for (const result of results) if (result.status === 'fulfilled') for (const source of result.value) {
      if (!seen.has(source.url)) { sources.push(source); seen.add(source.url) }
    }
    if (!sources.length) {
      const failure = results.find(result => result.status === 'rejected')
      if (failure?.status === 'rejected') throw failure.reason
      throw new ProviderFailure('empty')
    }
    return sources.slice(0, 8)
  })
}
