import { createCipheriv } from 'node:crypto'
import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, document, mediaType, ProviderFailure, userAgent, type ProviderHttp } from './http.ts'

const apiOrigin = 'https://vidstorm.ru'
const subtitleOrigin = 'https://sub.vdrk.site'
// Raw AES-256-CBC key from the supplied Vidstorm recipe (player bundle):
// id = base64url(AES(key, iv=key[0:16])(tmdb[_s_e])), no padding.
const apiKey = 'x7k9mPqT2rWvY8zA5bC3nF6hJ2lK4mN9'
const baseHeaders = { 'user-agent': userAgent, accept: 'application/json' }
const mediaHeaders = { referer: `${apiOrigin}/`, origin: apiOrigin, 'user-agent': userAgent }

const serversSchema = z.record(z.string().max(64), z.object({
  url: z.string().min(1).max(4096),
  language: z.string().max(32).optional(),
  flag: z.string().max(16).optional(),
  type: z.string().max(16).optional(),
}))
const levelsSchema = z.array(z.object({ resolution: z.union([z.number(), z.string().max(8)]).optional(), url: z.url().max(4096) }).passthrough())
const subtitleSchema = z.object({ file: z.url().max(4096), label: z.string().max(64).optional() })

export function encodeVidstormId(plain: string): string {
  const cipher = createCipheriv('aes-256-cbc', Buffer.from(apiKey, 'utf8'), Buffer.from(apiKey.slice(0, 16), 'utf8'))
  return Buffer.concat([cipher.update(Buffer.from(plain, 'utf8')), cipher.final()])
    .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function qualityOf(resolution?: number | string, fallback = 'Auto'): string {
  const raw = String(resolution ?? '')
  if (/2160|4k/i.test(raw)) return '4K'
  const match = /(\d{3,4})/.exec(raw)
  return match ? `${match[1]}p` : fallback
}

/** Port of the supplied Vidstorm recipe: AES-id lookup, then a cheap
 *  ranged probe per server distinguishes JSON quality lists from direct
 *  streams. Upstreams gate hotlinking, so the player referer rides with
 *  direct playback. vdrk subtitles are keyless. No page scripts run. */
export function createVidstormProvider(http: ProviderHttp, now = Date.now) {
  return adapter('vidstorm', async (input, signal) => {
    const { ref } = input
    const plain = ref.kind === 'movie' ? String(ref.id) : `${ref.id}_${ref.season}_${ref.episode}`
    const response = await document(http,
      `${apiOrigin}/api/${ref.kind === 'movie' ? 'movie' : 'tv'}/${encodeURIComponent(encodeVidstormId(plain))}`,
      signal, baseHeaders)
    const servers = serversSchema.parse(JSON.parse(response.text))
    const entries = Object.entries(servers)
      .filter(([, server]) => server.url.startsWith('http'))
      .slice(0, 8)
    if (!entries.length) throw new ProviderFailure('empty')
    const settled = await Promise.all(entries.map(async ([server, entry]) => {
      const scoped = AbortSignal.any([signal, AbortSignal.timeout(10000)])
      try {
        // Range keeps the probe cheap; JSON lists stay under the first bytes.
        const probe = await http(entry.url, { ...mediaHeaders, accept: '*/*', range: 'bytes=0-4095' }, scoped)
        if (probe.status !== 200 && probe.status !== 206) return { server, urls: [] as Array<{ url: string; quality: string }> }
        const contentType = probe.headers?.get('content-type') ?? ''
        const head = probe.text
        if (contentType.includes('application/json')) {
          try {
            const levels = levelsSchema.parse(JSON.parse(head))
            if (levels.length && levels[0]?.url) {
              return { server, urls: levels
                .filter((level) => level.url)
                .sort((a, b) => Number(b.resolution) - Number(a.resolution))
                .slice(0, 3)
                .map((level) => ({ url: level.url, quality: `${qualityOf(level.resolution)} ${entry.language ?? 'Original'}`.trim() })) }
            }
          } catch { /* truncated JSON falls through to direct handling */ }
        }
        if (/^#EXTM3U/i.test(head.trim()) || mediaType(entry.url)) {
          return { server, urls: [{ url: entry.url, quality: `Auto ${entry.language ?? 'Original'}`.trim() }] }
        }
        return { server, urls: [] as Array<{ url: string; quality: string }> }
      } catch { return { server, urls: [] as Array<{ url: string; quality: string }> } }
    }))
    const sources: ProviderSource[] = []
    const seen = new Set<string>()
    for (const { server, urls } of settled) {
      for (const item of urls) {
        if (sources.length >= 12 || seen.has(item.url)) continue
        seen.add(item.url)
        const type = mediaType(item.url) ?? 'hls'
        let deadline: string
        try { deadline = accessDeadline(item.url, now()) } catch { continue }
        sources.push({ key: `vidstorm:${server.toLowerCase().replace(/[^a-z0-9-]/g, '')}:${sources.length}`,
          url: item.url, type, headers: mediaHeaders,
          expiresAt: deadline, language: 'original', qualityHint: item.quality.slice(0, 24) || 'Auto', subtitles: [] })
      }
      if (sources.length >= 12) break
    }
    if (!sources.length) throw new ProviderFailure('empty')
    try {
      const subPath = ref.kind === 'movie' ? `/v2/movie/${ref.id}` : `/v2/tv/${ref.id}/${ref.season}/${ref.episode}`
      const scoped = AbortSignal.any([signal, AbortSignal.timeout(8000)])
      const subResponse = await http(`${subtitleOrigin}${subPath}`,
        { 'user-agent': userAgent, accept: 'application/json' }, scoped)
      if (subResponse.status >= 200 && subResponse.status < 300) {
        const list = JSON.parse(subResponse.text) as unknown
        if (Array.isArray(list)) {
          const tracks = list.filter((track): track is z.infer<typeof subtitleSchema> =>
            subtitleSchema.safeParse(track).success).slice(0, 20).map((track, index) => ({
            id: `vidstorm-sub-${index}`, label: (track.label || 'Unknown').slice(0, 64),
            language: (track.label || 'Unknown').slice(0, 32),
            url: track.file, format: (/\.srt/i.test(track.file) ? 'srt' : 'vtt') as 'srt' | 'vtt',
          }))
          return sources.map((source) => ({ ...source, subtitles: tracks }))
        }
      }
    } catch { /* subtitles stay empty */ }
    return sources
  })
}
