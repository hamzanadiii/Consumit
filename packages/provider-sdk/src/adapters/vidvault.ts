import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, document, mediaType, ProviderFailure, type ProviderHttp } from './http.ts'

const origin = 'https://vidvault.ru'

const downloadSchema = z.object({
  url: z.string().max(4096),
  resolution: z.union([z.number(), z.string()]).optional(),
  vipLocked: z.boolean().optional(),
})

const captionSchema = z.object({
  url: z.string().max(4096),
  lanName: z.string().max(64).optional(),
})

const responseSchema = z.object({
  mp4Data: z.object({
    downloads: z.array(downloadSchema).optional(),
    captions: z.array(captionSchema).optional(),
  }).optional(),
  mkvData: z.object({
    downloads: z.array(downloadSchema).optional(),
  }).optional(),
})

export function createVidvaultProvider(http: ProviderHttp, now = Date.now) {
  return adapter('vidvault', async (input, signal) => {
    const { ref } = input
    const isTv = ref.kind === 'series'

    const tokRes = await document(http, `${origin}/api/get-token`, signal)
    const tokData = JSON.parse(tokRes.text)
    const token = tokData?.t
    if (!token) throw new ProviderFailure('empty')

    const path = isTv ? `/api/tv/${ref.id}/${ref.season}/${ref.episode}` : `/api/movie/${ref.id}`
    const url = `${origin}${path}`

    let res: { text: string }
    try {
      res = await document(http, url, signal, {
        referer: `${origin}/`,
        accept: 'application/json',
        'x-request-token': token,
      })
    } catch {
      throw new ProviderFailure('empty')
    }

    let data: z.infer<typeof responseSchema>
    try {
      data = responseSchema.parse(JSON.parse(res.text))
    } catch {
      throw new ProviderFailure('empty')
    }

    const downloads = data.mp4Data?.downloads || []
    const subtitles = (data.mp4Data?.captions || []).map((c, idx) => ({
      id: `vidvault-sub-${idx}`,
      label: c.lanName || `Subtitle ${idx + 1}`,
      language: (c.lanName || 'und').toLowerCase().slice(0, 10),
      url: c.url,
      format: (c.url.endsWith('.srt') ? 'srt' : 'vtt') as 'vtt' | 'srt',
    }))

    const sources: ProviderSource[] = []
    for (let idx = 0; idx < downloads.length; idx++) {
      const d = downloads[idx]
      if (!d.url || d.vipLocked) continue

      const type = mediaType(d.url) || 'native'
      const resVal = d.resolution || 'Auto'
      const qualityHint = typeof resVal === 'number' ? `${resVal}p` : String(resVal)

      sources.push({
        key: `vidvault:mp4:${qualityHint.toLowerCase()}:${sources.length}`,
        url: d.url,
        type,
        qualityHint,
        expiresAt: accessDeadline(d.url, now()),
        language: 'original',
        headers: { referer: `${origin}/` },
        subtitles,
      })
    }

    if (!sources.length) throw new ProviderFailure('empty')
    return sources
  })
}
