import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, document, mediaType, ProviderFailure, userAgent, type ProviderHttp } from './http.ts'
import type { TmdbIdentityResolver } from './cinehd.ts'
import { z } from 'zod'

const apiOrigin = 'https://api.filmu.in'
const metaOrigin = 'https://embed.filmu.in'
const apiKey = 'c2bee5b74986ab27aa92f3056f1b1732775e7b12022cab6b5267ad26bc9f65f1'

// FilmU multi-extractor API: IMDb identity (resolver first, META endpoint
// fallback), then Ainary/Videasy/NoTorrent scrapes in parallel. Only
// shape-direct https media crosses into playback — Ainary (*.boundescous.site)
// serves CORS-open HLS in 1080p/720p/480p; relay/embed shapes never survive.
// Time-bound URLs resolve fresh per attempt; the session refresh path
// re-mints them mid-watch. Every job is individually bounded.
const EXTRACTORS = ['Ainary', 'Videasy', 'NoTorrent'] as const
const JOB_TIMEOUT_MS = 3500

const metaSchema = z.object({
  external_ids: z.object({ imdb_id: z.string().regex(/^tt\d{5,12}$/).nullish() }).optional(),
  imdb_id: z.string().regex(/^tt\d{5,12}$/).nullish().optional(),
  title: z.string().max(300).optional(),
  name: z.string().max(300).optional(),
  release_date: z.string().max(10).optional(),
  first_air_date: z.string().max(10).optional(),
})

const scrapeSchema = z.object({
  sources: z.array(z.object({
    url: z.string().max(4096),
    quality: z.string().max(32).optional(),
    type: z.string().max(16).optional(),
    language: z.string().max(32).optional(),
    headers: z.record(z.string(), z.string()).optional(),
  }).passthrough()).optional(),
  subtitles: z.array(z.object({
    url: z.string().max(4096),
    label: z.string().max(128).optional(),
    lang: z.string().max(32).optional(),
  }).passthrough()).optional(),
})

const RELAY_RE = /proxy|relay|\bembed\b|\biframe\b|\.html?(?:[?#]|$)/i

function bounded(parent: AbortSignal, ms: number) {
  const controller = new AbortController()
  if (parent.aborted) controller.abort(parent.reason)
  const onAbort = () => controller.abort(parent.reason)
  parent.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(new DOMException('FilmU extractor timed out', 'TimeoutError')), ms)
  return { signal: controller.signal, cleanup: () => { clearTimeout(timer); parent.removeEventListener('abort', onAbort) } }
}

function classifyType(rawUrl: string): ProviderSource['type'] | null {
  if (/\.(mkv|avi|mov|wmv|flv|webm)(\?|#|$)/i.test(rawUrl)) return null
  return mediaType(rawUrl) ?? 'hls'
}

function isDirectCandidate(rawUrl: string): boolean {
  if (!/^https:\/\//i.test(rawUrl) || rawUrl.length > 4096) return false
  if (RELAY_RE.test(rawUrl)) return false
  try {
    const parsed = new URL(rawUrl)
    if (parsed.username || parsed.password) return false
    for (const value of parsed.searchParams.values()) {
      if (/https?%3A|https?:\/\//i.test(value)) return false
    }
  } catch {
    return false
  }
  return true
}

export function createFilmuProvider(http: ProviderHttp, identity: TmdbIdentityResolver, now = Date.now) {
  return adapter('filmu', async (input, signal) => {
    const { ref } = input
    const isTv = ref.kind === 'series'
    const season = ref.season ?? 1
    const episode = ref.episode ?? 1

    const ids = await identity(ref, signal).catch(() => ({}) as { imdbId?: string | undefined; tmdbId?: number | undefined })
    let imdbId = ids?.imdbId
    let title = ''
    let year = ''
    if (!imdbId) {
      const metaOp = bounded(signal, JOB_TIMEOUT_MS)
      try {
        const metaRes = await document(http, `${metaOrigin}/api/tmdb/${isTv ? 'tv' : 'movie'}/${ref.id}?append_to_response=external_ids`, metaOp.signal, {
          'user-agent': userAgent,
          accept: 'application/json',
        })
        const meta = metaSchema.parse(JSON.parse(metaRes.text))
        imdbId = meta.external_ids?.imdb_id ?? meta.imdb_id ?? undefined
        title = meta.title ?? meta.name ?? ''
        year = (meta.release_date ?? meta.first_air_date ?? '').slice(0, 4)
      } finally {
        metaOp.cleanup()
      }
    }
    if (!imdbId) throw new ProviderFailure('empty')

    const settled = await Promise.all(EXTRACTORS.map(async (extractor) => {
      const op = bounded(signal, JOB_TIMEOUT_MS)
      try {
        const qs = new URLSearchParams({ tmdbId: String(ref.id), title, year })
        if (isTv) {
          qs.set('season', String(season))
          qs.set('episode', String(episode))
        }
        const response = await document(http, `${apiOrigin}/scrape/${extractor}/${isTv ? 'tv' : 'movie'}/${imdbId}?${qs}`, op.signal, {
          'user-agent': userAgent,
          accept: 'application/json',
          'x-api-key': apiKey,
        })
        return scrapeSchema.parse(JSON.parse(response.text))
      } catch {
        return null
      } finally {
        op.cleanup()
      }
    }))

    const sources: ProviderSource[] = []
    const subtitles: ProviderSource['subtitles'] = []
    const seenSubs = new Set<string>()
    for (const [index, data] of settled.entries()) {
      if (!data) continue
      const extractor = EXTRACTORS[index]!.toLowerCase()
      // Every labeled rendition becomes its own stream (1080p/720p/480p):
      // the resolver top-picks the best, the rest ride along as same-title
      // alternatives surfaced in the lab and the server menu detail.
      for (const item of data.sources ?? []) {
        if (!isDirectCandidate(item.url)) continue
        const type = classifyType(item.url)
        if (!type) continue
        const quality = String(item.quality || 'auto').slice(0, 24)
        const height = Number.parseInt(/(\d{3,4})p?/i.exec(quality)?.[1] ?? '0', 10)
        let expiresAt: string
        try {
          expiresAt = accessDeadline(item.url, now())
        } catch {
          continue
        }
        sources.push({
          key: `filmu:${extractor}:${sources.length}`,
          url: item.url,
          type,
          qualityHint: quality || 'Auto',
          expiresAt,
          language: 'original',
          headers: {},
          subtitles: [],
          ...(height > 0 ? { height } : {}),
        })
        if (sources.length >= 32) break
      }
      for (const sub of data.subtitles ?? []) {
        if (!sub.url.startsWith('https://') || seenSubs.has(sub.url) || subtitles.length >= 20) continue
        seenSubs.add(sub.url)
        const label = (sub.label || sub.lang || 'Unknown').slice(0, 64)
        subtitles.push({ id: `filmu-sub-${subtitles.length}`, label, language: label.slice(0, 32), url: sub.url, format: /\.srt/i.test(sub.url) ? 'srt' : 'vtt' })
      }
    }
    if (!sources.length) throw new ProviderFailure('empty')
    return sources.map((source) => ({ ...source, subtitles }))
  })
}
