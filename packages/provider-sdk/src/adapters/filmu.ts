import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, document, mediaType, ProviderFailure, userAgent, type ProviderHttp } from './http.ts'
import type { TmdbIdentityResolver } from './cinehd.ts'
import { z } from 'zod'

const apiOrigin = 'https://api.filmu.in'
const metaOrigin = 'https://embed.filmu.in'
const apiKey = 'c2bee5b74986ab27aa92f3056f1b1732775e7b12022cab6b5267ad26bc9f65f1'

// FilmU two-chain API (ports PROVE providers/filmu/filmu.ts, verified 2026-10-05):
//   A. PRIMARY (browser-direct): embed.filmu.in/api/singularity-movie?id={tmdb}
//      or /api/singularity-tv?tmdb={id}&s={season}&e={episode} with
//      Origin: https://embed.filmu.in (bare fetches 403). Stream hosts
//      (img.rousav.tech / img.animecurx.tech) serve master + variants +
//      segments with ACAO:* to any Origin, so no proxy is needed.
//   B. FALLBACK: api.filmu.in/scrape/{Ainary|Videasy|NoTorrent}/... with the
//      public x-api-key plus first-party filmu.in Referer/Origin (key alone
//      intermittently 401s). Only shape-direct https media crosses into
//      playback; relay/embed shapes never survive. Time-bound URLs resolve
//      fresh per attempt; the session refresh path re-mints them mid-watch.
//      Every job is individually bounded.
const EXTRACTORS = ['Ainary', 'Videasy', 'NoTorrent'] as const
const JOB_TIMEOUT_MS = 3500
const SINGULARITY_TIMEOUT_MS = 8000

const metaSchema = z.object({
  external_ids: z.object({ imdb_id: z.string().regex(/^tt\d{5,12}$/).nullish() }).optional(),
  imdb_id: z.string().regex(/^tt\d{5,12}$/).nullish().optional(),
  title: z.string().max(300).optional(),
  name: z.string().max(300).optional(),
  release_date: z.string().max(10).optional(),
  first_air_date: z.string().max(10).optional(),
})

const singularitySchema = z.object({
  sources: z.array(z.object({
    url: z.string().max(4096),
    quality: z.string().max(32).optional(),
    type: z.string().max(16).optional(),
  }).passthrough()).optional(),
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

export type FilmuExtractor = typeof EXTRACTORS[number]
export type FilmuOptions = { id?: string; extractors?: readonly FilmuExtractor[] }

export function createFilmuProvider(
  http: ProviderHttp,
  identity: TmdbIdentityResolver,
  now = Date.now,
  options: FilmuOptions = {},
) {
  const id = options.id ?? 'filmu'
  const extractors = options.extractors ?? EXTRACTORS
  return adapter(id, async (input, signal) => {
    const { ref } = input
    const isTv = ref.kind === 'series'
    const season = ref.season ?? 1
    const episode = ref.episode ?? 1

    // Primary: singularity same-origin API. Its hosts are CORS-open, so the
    // browser fetches bare and no relay grant is needed. An empty lane falls
    // through to the extractor fallback below.
    const primary = await (async () => {
      const op = bounded(signal, SINGULARITY_TIMEOUT_MS)
      try {
        const qs = isTv ? `?tmdb=${ref.id}&s=${season}&e=${episode}` : `?id=${ref.id}`
        const response = await document(http, `${metaOrigin}/api/singularity-${isTv ? 'tv' : 'movie'}${qs}`, op.signal, {
          'user-agent': userAgent,
          accept: 'application/json',
          origin: metaOrigin,
          referer: `${metaOrigin}/`,
        })
        const data = singularitySchema.parse(JSON.parse(response.text))
        const sources: ProviderSource[] = []
        const seen = new Set<string>()
        for (const item of data.sources ?? []) {
          if (!isDirectCandidate(item.url) || seen.has(item.url)) continue
          const type = classifyType(item.url)
          if (!type) continue
          let expiresAt: string
          try {
            expiresAt = accessDeadline(item.url, now())
          } catch {
            continue
          }
          seen.add(item.url)
          // The upstream quality label names the rendition family; the master
          // playlist declares the actual variant heights, so no height is
          // claimed here and ranking stays honest against measured sources.
          sources.push({
            key: `${id}:singularity:${sources.length}`,
            url: item.url,
            type,
            qualityHint: String(item.quality || 'Auto').slice(0, 24) || 'Auto',
            expiresAt,
            language: 'original',
            headers: {},
            subtitles: [],
          })
          if (sources.length >= 8) break
        }
        return sources.length ? sources : null
      } catch {
        return null
      } finally {
        op.cleanup()
      }
    })()
    if (primary) return primary

    // TMDB supplies the canonical IMDb identity, while FilmU's own metadata
    // endpoint supplies the title and year its extractors use for matching.
    // Fetch both together: skipping FilmU metadata when TMDB already has an
    // IMDb ID left Ainary with empty title/year query parameters for most films.
    const [ids, meta] = await Promise.all([
      identity(ref, signal).catch(() => ({}) as { imdbId?: string | undefined; tmdbId?: number | undefined }),
      (async () => {
        const metaOp = bounded(signal, JOB_TIMEOUT_MS)
        try {
          const metaRes = await document(http, `${metaOrigin}/api/tmdb/${isTv ? 'tv' : 'movie'}/${ref.id}?append_to_response=external_ids`, metaOp.signal, {
            'user-agent': userAgent,
            accept: 'application/json',
          })
          return metaSchema.parse(JSON.parse(metaRes.text))
        } catch {
          return null
        } finally {
          metaOp.cleanup()
        }
      })(),
    ])
    const imdbId = ids?.imdbId ?? meta?.external_ids?.imdb_id ?? meta?.imdb_id ?? undefined
    const title = meta?.title ?? meta?.name ?? ''
    const year = (meta?.release_date ?? meta?.first_air_date ?? '').slice(0, 4)
    if (!imdbId) throw new ProviderFailure('empty')

    const settled = await Promise.all(extractors.map(async (extractor) => {
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
          referer: 'https://filmu.in/',
          origin: 'https://filmu.in',
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
      const extractor = extractors[index]!.toLowerCase()
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
          key: `${id}:${extractor}:${sources.length}`,
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
        subtitles.push({ id: `${id}-sub-${subtitles.length}`, label, language: label.slice(0, 32), url: sub.url, format: /\.srt/i.test(sub.url) ? 'srt' : 'vtt' })
      }
    }
    if (!sources.length) throw new ProviderFailure('empty')
    return sources.map((source) => ({ ...source, subtitles }))
  })
}
