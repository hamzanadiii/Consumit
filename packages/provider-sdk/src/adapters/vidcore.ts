import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, document, mediaType, ProviderFailure, verifiedPlaybackSources, type ProviderHttp } from './http.ts'

const apiOrigin = 'https://vidrack.created.app'
const streamripOrigin = 'https://movie.streamrip.fun'
const streamripKey = 'streamrip_secret_2026'
const playerOrigin = 'https://vidcore.org'

const sourceSchema = z.object({
  url: z.url().max(4096),
  quality: z.string().max(32).optional(),
  label: z.string().max(64).optional(),
  type: z.string().max(20).optional(),
  language: z.string().min(1).max(32).optional(),
  headers: z.record(z.string().max(64), z.string().max(2048)).optional(),
})

const responseSchema = z.object({
  sources: z.array(sourceSchema).max(40).optional(),
  data: z.object({ sources: z.array(sourceSchema).max(40) }).optional(),
})

type Endpoint = { server: string; url: string }
const VIDRACK_KEYS = ['1embed', 'cinextream', 'movy', 'overlook', 'vaplayer', 'vidnest', 'viduki']

function endpoints(tmdbId: string, type: 'movie' | 'tv', season?: number, episode?: number): Endpoint[] {
  const tvQuery = type === 'tv' ? `id=${tmdbId}&type=tv&season=${season}&episode=${episode}` : `id=${tmdbId}&type=movie`
  const cineplayQuery = tvQuery
  const list: Endpoint[] = [
    { server: 'cineplay', url: `${apiOrigin}/api/sources/cineplay?${cineplayQuery}` },
    { server: 'vidrift', url: `${apiOrigin}/api/sources/vidrift?${tvQuery}` },
    ...VIDRACK_KEYS.map((server) => ({ server, url: `${apiOrigin}/api/sources/${server}?${tvQuery}` })),
  ]
  if (type === 'movie') list.push({ server: 'streamrip', url: `${streamripOrigin}/api/source/${tmdbId}?api_key=${streamripKey}&apikey=${streamripKey}` })
  return list
}

function parseQuality(q?: string): { height?: number; qualityHint?: string } {
  if (!q) return {}
  const match = q.match(/(\d{3,4})p?/i)
  if (match?.[1]) {
    const h = Number.parseInt(match[1], 10)
    if (h >= 2160) return { height: 2160, qualityHint: '4K' }
    return { height: h, qualityHint: `${h}p` }
  }
  if (/4k|uhd/i.test(q)) return { height: 2160, qualityHint: '4K' }
  return { qualityHint: q }
}

export function createVidcoreProvider(http: ProviderHttp, now = Date.now) {
  return adapter('vidcore', async (input, signal) => {
    const params = input.ref.kind === 'movie'
      ? { tmdbId: String(input.ref.id), type: 'movie' as const }
      : { tmdbId: String(input.ref.id), type: 'tv' as const, season: input.ref.season, episode: input.ref.episode }

    const settled = await Promise.all(
      endpoints(params.tmdbId, params.type, params.season, params.episode).map(async ({ server, url }) => {
        const scoped = AbortSignal.any([signal, AbortSignal.timeout(5000)])
        try {
          const response = await document(http, url, scoped, { accept: 'application/json', referer: `${playerOrigin}/` })
          const data = responseSchema.parse(JSON.parse(response.text))
          return { server, sources: (data.sources ?? data.data?.sources ?? []).slice(0, 3) }
        } catch { return { server, sources: [] as z.infer<typeof sourceSchema>[] } }
      }),
    )

    const rawSources: ProviderSource[] = []
    const seenUrls = new Set<string>()
    const seenKeys = new Set<string>()

    for (const { server, sources } of settled) {
      for (const s of sources) {
        if (!s.url || seenUrls.has(s.url)) continue
        const { height, qualityHint } = parseQuality(s.quality || s.label)
        const key = `${server}:${s.quality || qualityHint || 'auto'}`
        if (seenKeys.has(key)) continue
        seenUrls.add(s.url)
        seenKeys.add(key)

        const type = mediaType(s.url)
        if (!type) continue

        const isHevc = /hevc|h\.?265/i.test(`${s.url} ${s.quality || ''} ${s.label || ''}`)
        rawSources.push({
          key,
          url: s.url,
          type,
          expiresAt: accessDeadline(s.url, now()),
          language: s.language || 'original',
          headers: { referer: `${playerOrigin}/`, ...(s.headers || {}) },
          subtitles: [],
          ...(height ? { height } : {}),
          ...(qualityHint ? { qualityHint } : {}),
          _hevc: isHevc,
        } as ProviderSource & { _hevc?: boolean })
      }
    }

    if (!rawSources.length) throw new ProviderFailure('empty')

    // Sort: non-HEVC before HEVC, and direct-playable servers (vidrift, cinextream, movy) before others
    const directPriority = (key: string) => {
      if (key.startsWith('vidrift:')) return 0
      if (key.startsWith('cinextream:')) return 1
      if (key.startsWith('movy:')) return 2
      if (key.startsWith('cineplay:')) return 10
      return 5
    }
    rawSources.sort((a: any, b: any) => {
      const aHevc = a._hevc ? 1 : 0
      const bHevc = b._hevc ? 1 : 0
      if (aHevc !== bHevc) return aHevc - bHevc
      return directPriority(a.key) - directPriority(b.key)
    })

    for (const s of rawSources) {
      delete (s as any)._hevc
    }

    return verifiedPlaybackSources(http, rawSources, signal)
  })
}
