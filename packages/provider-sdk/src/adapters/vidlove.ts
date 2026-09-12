import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, document, mediaType, ProviderFailure, verifiedPlaybackSources, type ProviderHttp } from './http.ts'

const BASES = ['https://api.tungtungtungtungsahur.app', 'https://api.vidlove.cc']
const SOURCES = ['vidapi', 'moviebox', 'warden', 'cinefreak', 'moviebox2', 'ipcloud', 'tcloud']
const REFERER = 'https://player.vidlove.cc/'

const subSchema = z.object({
  file: z.string().optional(),
  label: z.string().max(64).optional(),
}).passthrough()

const responseSchema = z.object({
  source: z.object({
    source: z.string().max(64).optional(),
    label: z.string().max(64).optional(),
    url: z.string().max(4096),
  }).nullable().optional(),
  subtitles: z.array(subSchema).optional(),
})

export function createVidloveProvider(http: ProviderHttp, now = Date.now) {
  return adapter('vidlove', async (input, signal) => {
    const { ref } = input
    const isTv = ref.kind === 'series'
    const query = (src: string) => isTv
      ? `id=${encodeURIComponent(ref.id)}&season=${ref.season}&episode=${ref.episode}&mode=json&sources=${src}`
      : `id=${encodeURIComponent(ref.id)}&mode=json&sources=${src}`

    const results = await Promise.all(
      SOURCES.map(async (src) => {
        for (const base of BASES) {
          const path = isTv ? `${base}/tv?${query(src)}` : `${base}/movie?${query(src)}`
          try {
            const res = await document(http, path, signal, { referer: REFERER, accept: 'application/json' })
            const data = responseSchema.parse(JSON.parse(res.text))
            if (data.source?.url) {
              return { src, source: data.source, subtitles: data.subtitles }
            }
          } catch {
            continue
          }
        }
        return null
      }),
    )

    const allSources: ProviderSource[] = []
    const seen = new Set<string>()
    const seenSubs = new Set<string>()

    for (let i = 0; i < results.length; i++) {
      const res = results[i]
      if (!res?.source?.url || seen.has(res.source.url)) continue
      seen.add(res.source.url)

      const type = mediaType(res.source.url)
      if (!type) continue

      const subtitles = (res.subtitles || [])
        .filter((sub) => {
          if (!sub.file || sub.file.length > 2000) return false
          if (seenSubs.has(sub.file)) return false
          seenSubs.add(sub.file)
          return true
        })
        .slice(0, 20)
        .map((sub, sIdx) => ({
          id: `vidlove-sub-${sIdx}`,
          label: sub.label || `Subtitle ${sIdx + 1}`,
          language: (sub.label || 'und').toLowerCase().slice(0, 10),
          url: sub.file!,
          format: (sub.file!.endsWith('.srt') ? 'srt' : 'vtt') as 'vtt' | 'srt',
        }))

      allSources.push({
        key: `vidlove:${res.source.source || res.src}:${allSources.length}`,
        url: res.source.url,
        type,
        expiresAt: accessDeadline(res.source.url, now()),
        language: 'original',
        headers: { referer: REFERER },
        subtitles,
      })
    }

    if (!allSources.length) throw new ProviderFailure('empty')
    return verifiedPlaybackSources(http, allSources, signal)
  })
}
