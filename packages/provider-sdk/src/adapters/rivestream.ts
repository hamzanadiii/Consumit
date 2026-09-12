import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, document, mediaType, ProviderFailure, type ProviderHttp } from './http.ts'

const apiOrigin = 'https://scrapper.rivestream.app'
const defaultReferer = 'https://nextgencloudfabric.com/'
const PROVIDERS = ['citadel', 'quasar']

const captionSchema = z.object({
  file: z.string().max(4096),
  label: z.string().max(64).optional(),
  language: z.string().max(32).optional(),
  type: z.string().max(16).optional(),
})

const sourceEntrySchema = z.object({
  url: z.string().max(4096),
  quality: z.string().max(64).optional(),
})

const responseSchema = z.object({
  data: z.object({
    sources: z.array(sourceEntrySchema).max(64).optional(),
    captions: z.array(captionSchema).max(64).optional(),
  }).optional(),
})

function parseQualityAndLang(q?: string): { height?: number; qualityHint?: string; language?: string } {
  if (!q) return {}
  let qualityHint: string | undefined
  let language: string | undefined

  if (q.includes('|')) {
    const parts = q.split('|').map((p) => p.trim())
    qualityHint = parts[0]
    language = parts[1]
  } else {
    qualityHint = q
  }

  const match = qualityHint?.match(/(\d{3,4})p?/i)
  const height = match ? Number.parseInt(match[1], 10) : undefined
  if (height) qualityHint = `${height}p`

  return { height, qualityHint, language }
}

function unwrapProxy(rawUrl: string): { url: string; headers: Record<string, string> } {
  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    return { url: rawUrl, headers: {} }
  }

  if (parsed.pathname.includes('proxy')) {
    const innerUrl = parsed.searchParams.get('url')
    if (innerUrl) {
      const headersParam = parsed.searchParams.get('headers')
      if (headersParam) {
        try {
          const rawHeaders = JSON.parse(headersParam) as Record<string, string>
          const sanitized: Record<string, string> = {}
          for (const [k, v] of Object.entries(rawHeaders)) {
            if (k.toLowerCase() === 'referer') {
              sanitized.referer = v
            }
          }
          return { url: innerUrl, headers: sanitized }
        } catch {
          return { url: innerUrl, headers: {} }
        }
      }
      return { url: innerUrl, headers: { referer: defaultReferer } }
    }
  }

  return { url: rawUrl, headers: {} }
}

export function createRivestreamProvider(http: ProviderHttp, now = Date.now) {
  return adapter('rivestream', async (input, signal) => {
    const { ref } = input
    const isTv = ref.kind === 'series'
    const qBase = isTv ? `id=${ref.id}&season=${ref.season}&episode=${ref.episode}` : `id=${ref.id}`

    const results = await Promise.all(
      PROVIDERS.map(async (prov) => {
        const url = `${apiOrigin}/api/provider?provider=${prov}&${qBase}`
        try {
          const res = await document(http, url, signal)
          const data = responseSchema.parse(JSON.parse(res.text))
          return { provider: prov, data: data.data }
        } catch {
          return { provider: prov, data: undefined }
        }
      }),
    )

    const allSources: ProviderSource[] = []
    const seen = new Set<string>()

    for (const { provider, data } of results) {
      if (!data?.sources) continue

      const subtitles = (data.captions || []).map((c, idx) => ({
        id: `rivestream-sub-${idx}`,
        label: c.label || c.language || `Subtitle ${idx + 1}`,
        language: (c.language || c.label || 'und').toLowerCase().slice(0, 10),
        url: c.file,
        format: (c.type || (c.file.endsWith('.srt') ? 'srt' : 'vtt')) as 'vtt' | 'srt',
      }))

      for (let idx = 0; idx < data.sources.length; idx++) {
        const entry = data.sources[idx]
        if (!entry.url || seen.has(entry.url)) continue

        const { url, headers } = unwrapProxy(entry.url)
        const type = mediaType(url)
        if (!type) continue
        seen.add(entry.url)

        const { height, qualityHint, language } = parseQualityAndLang(entry.quality)
        const lang = language || (provider === 'quasar' ? 'French' : 'English')
        const qTag = qualityHint ? qualityHint.toLowerCase() : 'auto'

        allSources.push({
          key: `${provider}:${qTag}:${idx}`,
          url,
          type,
          expiresAt: accessDeadline(url, now()),
          language: lang,
          headers,
          subtitles,
          ...(height ? { height } : {}),
          ...(qualityHint ? { qualityHint } : {}),
        })
      }
    }

    if (!allSources.length) throw new ProviderFailure('empty')

    // Prefer English/Original audio over dubs/French
    allSources.sort((a, b) => {
      const aIsEn = /english|original/i.test(a.language) ? 0 : 1
      const bIsEn = /english|original/i.test(b.language) ? 0 : 1
      return aIsEn - bIsEn
    })

    return allSources
  })
}
