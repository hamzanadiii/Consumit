import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, document, mediaType, ProviderFailure, type ProviderHttp } from './http.ts'

const origin = 'https://screenscape.me'
const SERVERS = ['qsply', 'moviebox2']

const streamSchema = z.object({
  name: z.string().max(64).optional(),
  url: z.string().max(4096),
  quality: z.string().max(32).optional(),
  type: z.string().max(20).optional(),
  language: z.string().max(32).optional(),
})

const responseSchema = z.object({
  success: z.boolean().optional(),
  streams: z.array(streamSchema).max(32).optional(),
})

function unwrapUrl(u: string): string {
  if (u.includes('/proxy?url=')) {
    try {
      const parsed = new URL(u)
      const target = parsed.searchParams.get('url')
      if (target) return decodeURIComponent(target)
    } catch {}
  }
  return u
}

export function createScreenscapeProvider(http: ProviderHttp, now = Date.now) {
  return adapter('screenscape', async (input, signal) => {
    const { ref } = input
    const isTv = ref.kind === 'series'
    const qBase = isTv
      ? `tmdbId=${ref.id}&type=tv&id=${ref.id}&s=${ref.season}&e=${ref.episode}`
      : `tmdbId=${ref.id}&type=movie&id=${ref.id}`

    const allSources: ProviderSource[] = []
    const seen = new Set<string>()

    for (const server of SERVERS) {
      const url = `${origin}/api/servers/${server}?${qBase}`
      let res: { text: string }
      try {
        res = await document(http, url, signal, { referer: `${origin}/`, accept: 'application/json' })
      } catch {
        continue
      }

      let data: z.infer<typeof responseSchema>
      try {
        data = responseSchema.parse(JSON.parse(res.text))
      } catch {
        continue
      }

      if (!data.success && !data.streams?.length) continue

      const streams = data.streams || []
      for (let idx = 0; idx < streams.length; idx++) {
        const str = streams[idx]
        const cleanUrl = unwrapUrl(str.url)
        if (!cleanUrl || seen.has(cleanUrl)) continue
        seen.add(cleanUrl)

        const type = str.type === 'mp4' ? 'native' : (mediaType(cleanUrl) || 'hls')
        const qMatch = (str.quality || str.name || '').match(/(\d{3,4})p/i)
        const qualityHint = qMatch ? `${qMatch[1]}p` : (str.quality || 'Auto')

        allSources.push({
          key: `screenscape:${server}:${idx}`,
          url: cleanUrl,
          type,
          qualityHint,
          expiresAt: accessDeadline(cleanUrl, now()),
          language: str.language || 'original',
          headers: { referer: `${origin}/` },
          subtitles: [],
        })
      }
    }

    if (!allSources.length) throw new ProviderFailure('empty')
    return allSources
  })
}
