import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, document, mediaType, ProviderFailure, userAgent, type ProviderHttp } from './http.ts'

const apiOrigin = 'https://nagare.nexioapp.org'

// Port of the PROVE Nagare recipe: Stremio-protocol addon backend native to
// AniList ids (/stream/anime/anilist:{id}:{ep}.json). Dub rides a base64url
// config prefix and falls back to sub when the backend serves sub only.
// The backend scrapes live upstreams per request (~10-15s), far beyond the
// resolver's attempt budget, so a 20-minute in-process cache turns repeats
// instant while first misses degrade fast instead of burning the budget.
// Only browser-safe passthrough headers survive; credentials never cross.
const FETCH_TIMEOUT_MS = 4500
const CACHE_TTL_MS = 20 * 60_000
const CACHE_MAX = 300

const streamSchema = z.object({
  url: z.string().max(4096),
  name: z.string().max(200).optional(),
  behaviorHints: z.object({
    proxyHeaders: z.object({
      request: z.record(z.string(), z.string()).optional(),
    }).passthrough().optional(),
  }).passthrough().optional(),
  subtitles: z.array(z.object({
    url: z.string().max(4096),
    lang: z.string().max(64).optional(),
    label: z.string().max(128).optional(),
  }).passthrough()).optional(),
}).passthrough()

const responseSchema = z.object({
  streams: z.array(streamSchema).max(64),
}).passthrough()

type CachedResult = { at: number; sources: ProviderSource[] }

const cache = new Map<string, CachedResult>()

function cacheGet(key: string): ProviderSource[] | null {
  const hit = cache.get(key)
  if (!hit) return null
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key)
    return null
  }
  cache.delete(key)
  cache.set(key, hit)
  return hit.sources
}

function cacheSet(key: string, sources: ProviderSource[]): void {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next()
    if (!oldest.done) cache.delete(oldest.value)
  }
  cache.set(key, { at: Date.now(), sources })
}

function bounded(parent: AbortSignal, ms: number) {
  const controller = new AbortController()
  if (parent.aborted) controller.abort(parent.reason)
  const onAbort = () => controller.abort(parent.reason)
  parent.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(new DOMException('Nagare timed out', 'TimeoutError')), ms)
  return { signal: controller.signal, cleanup: () => { clearTimeout(timer); parent.removeEventListener('abort', onAbort) } }
}

function dubConfig(): string {
  return Buffer.from(JSON.stringify({ preferDub: true }))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')
}

function sanitizeHeaders(headers: Record<string, string> | undefined): Record<string, string> {
  if (!headers) return {}
  const clean: Record<string, string> = {}
  for (const [name, value] of Object.entries(headers)) {
    if (!/^(referer|origin|user-agent|accept)$/i.test(name) || /[\r\n]/.test(value) || value.length > 4096) continue
    clean[name.toLowerCase()] = value
  }
  return clean
}

function classifyType(rawUrl: string, name: string): ProviderSource['type'] | null {
  if (/\.(mkv|avi|mov|wmv|flv|webm)(\?|#|$)/i.test(rawUrl)) return null
  if (/hls|m3u8/i.test(name)) return 'hls'
  return mediaType(rawUrl) ?? 'hls'
}

function mapSubtitle(track: { url: string; lang?: string | undefined; label?: string | undefined }, id: string, index: number): ProviderSource['subtitles'][number] | null {
  if (!track.url.startsWith('https://')) return null
  const label = (track.lang || track.label || 'Unknown').slice(0, 64)
  return { id: `${id}-sub-${index}`, label, language: label.slice(0, 32), url: track.url, format: 'vtt' }
}

export function createNagareProvider(http: ProviderHttp, now = Date.now) {
  return adapter('nagare', async (input, signal) => {
    const { ref } = input
    if (ref.kind !== 'anime' || !ref.episode) throw new ProviderFailure('empty')
    const dub = input.audioLanguage === 'en'
    const cacheKey = `${ref.id}:${ref.episode}:${dub ? 'dub' : 'sub'}`
    const cached = cacheGet(cacheKey)
    if (cached?.length) return cached

    const op = bounded(signal, FETCH_TIMEOUT_MS)
    try {
      const prefix = dub ? `/${dubConfig()}` : ''
      const url = `${apiOrigin}${prefix}/stream/anime/anilist:${ref.id}:${ref.episode}.json`
      const response = await document(http, url, op.signal, {
        'user-agent': userAgent,
        accept: 'application/json',
      })
      const data = responseSchema.parse(JSON.parse(response.text))
      const sources: ProviderSource[] = []
      const subtitles: ProviderSource['subtitles'] = []
      const seenSubs = new Set<string>()
      for (const stream of data.streams) {
        if (!stream.url.startsWith('https://') || sources.length >= 12) continue
        const type = classifyType(stream.url, stream.name ?? '')
        if (!type) continue
        let expiresAt: string
        try {
          expiresAt = accessDeadline(stream.url, now())
        } catch {
          continue
        }
        const trackDub = /dub/i.test(stream.name ?? '')
        sources.push({
          key: `nagare:${trackDub ? 'dub' : 'sub'}:${ref.episode}:${sources.length}`,
          url: stream.url,
          type,
          headers: sanitizeHeaders(stream.behaviorHints?.proxyHeaders?.request),
          expiresAt,
          language: trackDub ? 'en' : 'original',
          qualityHint: (stream.name?.match(/\b(2160p|1080p|720p|480p|360p|4k)\b/i)?.[1] || 'auto').slice(0, 24),
          subtitles: [],
        })
        for (const sub of stream.subtitles ?? []) {
          if (!sub.url || seenSubs.has(sub.url) || subtitles.length >= 20) continue
          seenSubs.add(sub.url)
          const mapped = mapSubtitle(sub, 'nagare', subtitles.length)
          if (mapped) subtitles.push(mapped)
        }
      }
      if (!sources.length) throw new ProviderFailure('empty')
      const ordered = dub
        ? [...sources.filter((source) => source.language === 'en'), ...sources.filter((source) => source.language !== 'en')]
        : sources
      const result = ordered.map((source) => ({ ...source, subtitles }))
      cacheSet(cacheKey, result)
      return result
    } catch (error) {
      if (error instanceof ProviderFailure) throw error
      throw new ProviderFailure('empty')
    } finally {
      op.cleanup()
    }
  })
}
