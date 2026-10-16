import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, document, mediaType, ProviderFailure, type ProviderHttp } from './http.ts'

const origin = 'https://streamguide.cfd'
const responseSchema = z.object({
  providers: z.array(z.object({
    name: z.string().max(80).optional(),
    sources: z.array(z.object({
      url: z.string().max(4096),
      quality: z.union([z.string().max(24), z.number()]).optional(),
      language: z.string().max(32).optional(),
    })).max(64),
  })).max(32),
})

/** Port of the supplied Perses streamguide recipe; no page scripts are executed. */
export function createPersesProvider(http: ProviderHttp, now = Date.now) {
  return adapter('perses', async (input, signal) => {
    const { ref } = input
    const url = ref.kind === 'movie'
      ? `${origin}/Perses/movie/${ref.id}`
      : `${origin}/Perses/tv/${ref.id}/${ref.season}/${ref.episode}`
    const response = await document(http, url, signal, { referer: 'https://vidcore.org/' })
    const data = responseSchema.parse(JSON.parse(response.text))
    const headers = { referer: 'https://vidcore.org/' }
    const sources: ProviderSource[] = []
    const seen = new Set<string>()
    for (const provider of data.providers) {
      const slug = (provider.name ?? 'src').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'src'
      for (const entry of provider.sources) {
        if (sources.length >= 32) break
        if (!entry.url || seen.has(entry.url)) continue
        const type = mediaType(entry.url)
        if (!type) continue
        let parsed: URL
        try { parsed = new URL(entry.url) } catch { continue }
        if (parsed.protocol !== 'https:') continue
        seen.add(entry.url)
        const quality = String(entry.quality ?? 'auto').slice(0, 24)
        sources.push({ key: `${slug}:${quality.toLowerCase()}:${sources.length}`, url: entry.url,
          type, headers, expiresAt: accessDeadline(entry.url, now()),
          language: (entry.language ?? 'original').slice(0, 32), subtitles: [] })
      }
      if (sources.length >= 32) break
    }
    if (!sources.length) throw new ProviderFailure('empty')
    return sources
  })
}
