import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, document, mediaType, ProviderFailure, type ProviderHttp } from './http.ts'

const encOrigin = 'https://enc-dec.app'
const origin = 'https://vidlink.pro'

const captionSchema = z.object({
  url: z.string().max(4096),
  language: z.string().max(32).optional(),
})

const streamSchema = z.object({
  playlist: z.string().max(4096).optional(),
  qualities: z.record(z.string(), z.object({ url: z.string().max(4096) })).optional(),
  captions: z.array(captionSchema).optional(),
})

const responseSchema = z.object({
  stream: streamSchema.optional(),
})

export function createVidlinkProvider(http: ProviderHttp, now = Date.now) {
  return adapter('vidlink', async (input, signal) => {
    const { ref } = input
    const isTv = ref.kind === 'series'

    // Get token from enc-dec.app with retry
    let token: string | undefined
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const encRes = await document(http, `${encOrigin}/api/enc-vidlink`, signal)
        const encData = JSON.parse(encRes.text)
        if (encData && typeof encData === 'object' && encData.result) {
          token = encData.result
          break
        }
      } catch {
        // retry
      }
    }
    if (!token) throw new ProviderFailure('empty')

    const path = isTv
      ? `/api/b/tv/${token}/${ref.season}/${ref.episode}?multiLang=0`
      : `/api/b/movie/${token}?multiLang=0`
    const url = `${origin}${path}`

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

    const stream = data.stream
    if (!stream) throw new ProviderFailure('empty')

    const subtitles = (stream.captions || [])
      .filter((c) => Boolean(c.language))
      .map((c, idx) => ({
        id: `vidlink-sub-${idx}`,
        label: c.language || `Subtitle ${idx + 1}`,
        language: (c.language || 'und').toLowerCase().slice(0, 10),
        url: c.url,
        format: (c.url.endsWith('.srt') ? 'srt' : 'vtt') as 'vtt' | 'srt',
      }))

    const sources: ProviderSource[] = []

    if (stream.playlist) {
      const cleanPlaylist = stream.playlist.split('?')[0] || stream.playlist
      sources.push({
        key: 'vidlink:auto:0',
        url: cleanPlaylist,
        type: 'hls',
        qualityHint: 'Auto',
        expiresAt: accessDeadline(cleanPlaylist, now()),
        language: 'original',
        headers: { referer: `${origin}/` },
        subtitles,
      })
    }

    if (stream.qualities) {
      const qEntries = Object.entries(stream.qualities)
      // Sort qualities descending (e.g. 1080 before 720)
      qEntries.sort((a, b) => Number(b[0]) - Number(a[0]))

      for (const [q, entry] of qEntries) {
        if (!entry?.url) continue
        const type = entry.url.endsWith('.mp4') ? 'native' : (mediaType(entry.url) || 'hls')
        const qualityHint = `${q}p`
        sources.push({
          key: `vidlink:${q}p:${sources.length}`,
          url: entry.url,
          type,
          qualityHint,
          expiresAt: accessDeadline(entry.url, now()),
          language: 'original',
          headers: { referer: `${origin}/` },
          subtitles,
        })
      }
    }

    if (!sources.length) throw new ProviderFailure('empty')
    return sources
  })
}
