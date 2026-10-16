import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, document, ProviderFailure, type ProviderHttp } from './http.ts'

// Port of the PROVE Poseidon recipe (hahaevilcraft split providers):
//   GET hahaevilcraft.site/api/search?q={tmdb}&type={movie|tv}[&season=&episode=]
//   -> { results: [{ providerName, streams: [{ url, quality, title }] }] }
// Only the Poseidon slice is served; nested proxy URLs (?u=&h=) unwrap to
// the raw origin URL. Browser-direct like the rest of the fleet.
const apiOrigin = 'https://hahaevilcraft.site'

const streamSchema = z.object({
  url: z.string().max(4096),
  quality: z.string().max(64).optional(),
  title: z.string().max(128).optional(),
  name: z.string().max(128).optional(),
}).passthrough()

const resultSchema = z.object({
  provider: z.string().max(80).optional(),
  providerName: z.string().max(80).optional(),
  streams: z.array(streamSchema).max(32).optional(),
}).passthrough()

const searchSchema = z.object({
  results: z.array(resultSchema).max(32),
}).passthrough()

function unwrap(rawUrl: string): { url: string; headers: Record<string, string> } {
  try {
    const parsed = new URL(rawUrl)
    const inner = parsed.searchParams.get('u')
    if (inner && /^https?:\/\//i.test(inner)) {
      let headers: Record<string, string> = {}
      try {
        const decoded = JSON.parse(parsed.searchParams.get('h') ?? 'null') as unknown
        if (decoded && typeof decoded === 'object') {
          for (const [key, value] of Object.entries(decoded as Record<string, unknown>)) {
            if (key.toLowerCase() === 'referer' && typeof value === 'string') headers = { referer: value }
          }
        }
      } catch {
        // keep no headers
      }
      return { url: inner, headers }
    }
  } catch {
    // keep original
  }
  return { url: rawUrl, headers: {} }
}

export function createPoseidonProvider(http: ProviderHttp, now = Date.now) {
  return adapter('poseidon', async (input, signal) => {
    const { ref } = input
    const isTv = ref.kind === 'series'
    if (ref.kind !== 'movie' && !(isTv && ref.season && ref.episode)) throw new ProviderFailure('empty')
    const params = new URLSearchParams({ q: String(ref.id), type: isTv ? 'tv' : 'movie' })
    if (isTv) {
      params.set('season', String(ref.season))
      params.set('episode', String(ref.episode))
    }
    const res = await document(http, `${apiOrigin}/api/search?${params}`, signal)
    let data: z.infer<typeof searchSchema>
    try {
      data = searchSchema.parse(JSON.parse(res.text))
    } catch {
      throw new ProviderFailure('malformed')
    }
    const sources: ProviderSource[] = []
    const seen = new Set<string>()
    for (const result of data.results) {
      const name = result.providerName || result.provider || ''
      if (name.toLowerCase() !== 'poseidon') continue
      for (const item of result.streams ?? []) {
        const { url, headers } = unwrap(item.url)
        if (!/^https:\/\//i.test(url) || seen.has(url)) continue
        seen.add(url)
        const type = /\.mp4(\?|#|$)/i.test(url) ? 'native' as const : 'hls' as const
        const quality = String(item.quality || item.title || 'auto')
        const height = quality.match(/(\d{3,4})p/i)?.[1]
        let expiresAt: string
        try {
          expiresAt = accessDeadline(url, now())
        } catch {
          continue
        }
        sources.push({
          key: `poseidon:${quality.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 24) || 'auto'}:${sources.length}`,
          url,
          type,
          expiresAt,
          language: 'original',
          headers: { referer: 'https://vidcore.org/', ...headers },
          subtitles: [],
          ...(height ? { height: Number.parseInt(height, 10), qualityHint: `${height}p` } : { qualityHint: 'Auto' }),
        })
        if (sources.length >= 4) break
      }
    }
    if (!sources.length) throw new ProviderFailure('empty')
    return sources
  })
}
