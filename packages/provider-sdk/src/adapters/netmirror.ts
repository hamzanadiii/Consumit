import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, document, mediaType, ProviderFailure, type ProviderHttp } from './http.ts'

const origin = 'https://net27.cc'

const captionSchema = z.object({
  url: z.string().max(4096),
  name: z.string().max(64).optional(),
  lang: z.string().max(32).optional(),
})

const streamSchema = z.object({
  url: z.string().max(4096),
  resolution: z.union([z.number(), z.string()]).optional(),
})

const responseSchema = z.object({
  ok: z.boolean(),
  streams: z.array(streamSchema).optional(),
  mp4: z.string().max(4096).optional(),
  captions: z.array(captionSchema).optional(),
})

export function createNetmirrorProvider(http: ProviderHttp, now = Date.now) {
  return adapter('netmirror', async (input, signal) => {
    const { ref } = input
    const isTv = ref.kind === 'series'
    const url = isTv
      ? `${origin}/api/embed-tmdb/${ref.id}?type=tv&se=${ref.season}&ep=${ref.episode}`
      : `${origin}/api/embed-tmdb/${ref.id}`

    let res: { text: string }
    try {
      res = await document(http, url, signal, { referer: `${origin}/`, accept: 'application/json' })
    } catch {
      throw new ProviderFailure('empty')
    }

    let data: z.infer<typeof responseSchema>
    try {
      data = responseSchema.parse(JSON.parse(res.text))
    } catch {
      throw new ProviderFailure('empty')
    }

    if (!data.ok) throw new ProviderFailure('empty')

    const subtitles = (data.captions || [])
      .filter((c) => {
        if (!c.url || c.url.startsWith('http://')) return false
        return true
      })
      .map((c, idx) => {
        const fullUrl = c.url.startsWith('/') ? `${origin}${c.url}` : c.url
        return {
          id: `netmirror-sub-${idx}`,
          label: c.name || `Subtitle ${idx + 1}`,
          language: (c.lang || c.name || 'und').toLowerCase().slice(0, 10),
          url: fullUrl,
          format: (fullUrl.endsWith('.srt') ? 'srt' : 'vtt') as 'vtt' | 'srt',
        }
      })

    const sources: ProviderSource[] = []

    if (Array.isArray(data.streams)) {
      for (let idx = 0; idx < data.streams.length; idx++) {
        const str = data.streams[idx]
        if (!str.url) continue
        const type = mediaType(str.url) || 'hls'
        const res = str.resolution
        const qualityHint = res ? `${res}p` : 'Auto'
        const key = res
          ? `netmirror:netflix:${res}p:${idx}`
          : `netmirror:netflix:auto:${idx}`

        sources.push({
          key,
          url: str.url,
          type,
          qualityHint,
          expiresAt: accessDeadline(str.url, now()),
          language: 'original',
          headers: { referer: `${origin}/` },
          subtitles,
        })
      }
    }

    if (data.mp4) {
      sources.push({
        key: 'netmirror:netflix:mp4',
        url: data.mp4,
        type: 'native',
        qualityHint: 'Auto',
        expiresAt: accessDeadline(data.mp4, now()),
        language: 'original',
        headers: { referer: `${origin}/` },
        subtitles,
      })
    }

    if (!sources.length) throw new ProviderFailure('empty')
    return sources
  })
}
