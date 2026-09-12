import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, document, mediaType, ProviderFailure, userAgent, type ProviderHttp } from './http.ts'

const resolveOrigin = 'https://stellar.maybeoneday.ch'
const cdnOrigin = 'https://cdn.maybeoneday.ch'
const natsukiOrigin = 'https://natsuki.maybeoneday.ch'
const vdrkOrigin = 'https://sub.vdrk.site'

const clientHeaders = { 'user-agent': userAgent, accept: 'application/json' }
const deliveryHeaders = { referer: 'https://atlantic.st/', origin: 'https://atlantic.st', 'user-agent': userAgent }

const stellarResolveSchema = z.object({
  found: z.boolean(),
  url: z.string().min(1).max(4096).optional(),
  source: z.string().max(80).optional(),
  format: z.string().max(16).optional(),
})

const aphroditeSchema = z.object({
  found: z.boolean(),
  url: z.string().min(1).max(4096).optional(),
  type: z.string().max(16).optional(),
})

const natsukiSchema = z.object({
  subtitles: z.array(z.object({
    url: z.string().max(4096),
    fileName: z.string().max(128).optional(),
    language: z.string().max(64).optional(),
  })).optional(),
})

const vdrkSchema = z.array(z.object({
  file: z.string().max(4096),
  label: z.string().max(64).optional(),
}))

export type StellarOptions = {
  id?: string
  endpoint?: 'all' | 'stellar' | 'aphrodite'
}

/** Port of the direct Stellar/Aphrodite recipe from PROVE: keyless direct-HLS
 *  endpoints with CORS-open delivery, multi-audio HLS, and Natsuki/VDRK subtitles.
 *  No proxy or relay wrapping; browser-direct playback only. */
export function createStellarProvider(http: ProviderHttp, now = Date.now, options: StellarOptions = {}) {
  const id = options.id ?? 'stellar'
  const endpoint = options.endpoint ?? (id === 'aphrodite' ? 'aphrodite' : 'all')

  return adapter(id, async (input, signal) => {
    const { ref } = input
    const isTv = ref.kind === 'series'
    const tmdbId = String(ref.id)
    const season = ref.season ?? 1
    const episode = ref.episode ?? 1

    const sources: ProviderSource[] = []
    const seen = new Set<string>()

    const pushSource = (rawUrl: string, label: string) => {
      const trimmed = rawUrl.trim()
      if (!/^https?:\/\//i.test(trimmed) || seen.has(trimmed)) return
      let parsed: URL
      try { parsed = new URL(trimmed) } catch { return }
      if (parsed.protocol !== 'https:') return
      seen.add(trimmed)

      const type = mediaType(trimmed) ?? (/\.mp4(\?|#|$)/i.test(trimmed) ? 'native' : 'hls')
      let deadline: string
      try { deadline = accessDeadline(trimmed, now()) } catch { return }

      const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || id
      sources.push({
        key: `${id}:${slug}:${sources.length}`,
        url: trimmed,
        type,
        headers: deliveryHeaders,
        expiresAt: deadline,
        language: 'original',
        qualityHint: 'Auto',
        subtitles: [],
      })
    }

    // 1. Stellar resolver (multi-audio HLS).
    if (endpoint === 'all' || endpoint === 'stellar') {
      try {
        const q = new URLSearchParams({ tmdbId, type: isTv ? 'tv' : 'movie' })
        if (isTv) {
          q.set('season', String(season))
          q.set('episode', String(episode))
        }
        const response = await document(http, `${resolveOrigin}/resolve?${q.toString()}`, signal, clientHeaders)
        const data = stellarResolveSchema.parse(JSON.parse(response.text))
        if (data.found && data.url) {
          pushSource(data.url, data.source || 'Stellar')
        }
      } catch {
        // next source
      }
    }

    // 2. Aphrodite CDN mirror.
    if (endpoint === 'all' || endpoint === 'aphrodite') {
      try {
        const path = isTv
          ? `${cdnOrigin}/content/tv/${encodeURIComponent(tmdbId)}/${season}/${episode}`
          : `${cdnOrigin}/content/movie/${encodeURIComponent(tmdbId)}`
        const response = await document(http, path, signal, clientHeaders)
        const data = aphroditeSchema.parse(JSON.parse(response.text))
        if (data.found && data.url) {
          pushSource(data.url, 'Aphrodite')
        }
      } catch {
        // next
      }
    }

    if (!sources.length) throw new ProviderFailure('empty')

    // Subtitles: try Natsuki first, fall back to VDRK v1.
    const subtitles: ProviderSource['subtitles'] = []
    const seenSubs = new Set<string>()

    try {
      const q = new URLSearchParams({ tmdbId })
      if (isTv) {
        q.set('season', String(season))
        q.set('episode', String(episode))
      }
      const subResponse = await document(http, `${natsukiOrigin}/subs?${q.toString()}`, signal, {
        ...clientHeaders,
        referer: 'https://atlantic.st/',
        origin: 'https://atlantic.st',
      })
      const parsed = natsukiSchema.parse(JSON.parse(subResponse.text))
      const list = parsed.subtitles ?? []
      for (const track of list) {
        if (!track.url || seenSubs.has(track.url)) continue
        seenSubs.add(track.url)
        const label = (track.fileName || track.language || 'Unknown').slice(0, 64)
        subtitles.push({
          id: `${id}-sub-${subtitles.length}`,
          label,
          language: (track.language || label).slice(0, 32),
          url: track.url,
          format: /\.srt/i.test(track.url) ? 'srt' : 'vtt',
        })
        if (subtitles.length >= 20) break
      }
    } catch {
      // fallback to VDRK below
    }

    if (!subtitles.length) {
      try {
        const vdrkUrl = isTv
          ? `${vdrkOrigin}/v1/tv/${encodeURIComponent(tmdbId)}/${season}/${episode}`
          : `${vdrkOrigin}/v1/movie/${encodeURIComponent(tmdbId)}`
        const subResponse = await document(http, vdrkUrl, signal, clientHeaders)
        const list = vdrkSchema.parse(JSON.parse(subResponse.text))
        for (const track of list) {
          if (!track.file || seenSubs.has(track.file)) continue
          seenSubs.add(track.file)
          const label = (track.label || 'Unknown').slice(0, 64)
          subtitles.push({
            id: `${id}-sub-${subtitles.length}`,
            label,
            language: label.slice(0, 32),
            url: track.file,
            format: 'vtt',
          })
          if (subtitles.length >= 20) break
        }
      } catch {
        // subtitles stay empty
      }
    }

    return sources.map((source) => ({ ...source, subtitles }))
  })
}

export function createAphroditeProvider(http: ProviderHttp, now = Date.now) {
  return createStellarProvider(http, now, { id: 'aphrodite', endpoint: 'aphrodite' })
}
