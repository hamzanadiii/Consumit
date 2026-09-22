import type { PlaybackRef } from '@consumit/contracts'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, document, mediaType, ProviderFailure, userAgent, type ProviderHttp } from './http.ts'

export type TmdbIdentityResolver = (ref: PlaybackRef, signal: AbortSignal) => Promise<{ imdbId?: string | undefined; tmdbId?: number | undefined }>

export type CinehdOptions = {
  id?: string
  /** When set, only leaves of that audio answer (honest absence otherwise).
   *  Powers per-audio rows like cinehd-hindi without duplicating logic. */
  audio?: 'hi' | 'en' | undefined
}

const origin = 'https://cinehd.vc'

// Direct HLS via the first-party Hdmovies backend: embed API (IMDb preferred,
// TMDB fallback) -> play page (file + CSRF key in HTML) -> L1 playlist POST
// (flat list or nested TV season/episode folders) -> L2 POST per `~` leaf to
// a time-bound direct stream URL. Leaves carry their audio language in the
// title (Hindi/English/...), mapped to codes so resolve-time language
// matching works. No iframes or proxy wrappers ever become sources; every
// network step is individually bounded so one stalled hop cannot burn the
// resolver's attempt budget.
const EMBED_TIMEOUT_MS = 2000
const PLAY_TIMEOUT_MS = 2000
const LIST_TIMEOUT_MS = 2500
const STREAM_TIMEOUT_MS = 2500
const MAX_LEAVES = 4

type Leaf = { file: string; title: string; season?: number | undefined; episode?: number | undefined }

function bounded(parent: AbortSignal, ms: number) {
  const controller = new AbortController()
  if (parent.aborted) controller.abort(parent.reason)
  const onAbort = () => controller.abort(parent.reason)
  parent.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(new DOMException('CineHD step timed out', 'TimeoutError')), ms)
  return { signal: controller.signal, cleanup: () => { clearTimeout(timer); parent.removeEventListener('abort', onAbort) } }
}

function collectLeaves(nodes: unknown[], seasonContext?: number, episodeContext?: number, out: Leaf[] = []): Leaf[] {
  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue
    const record = node as Record<string, unknown>
    const seasonHit = /season\s*(\d+)/i.exec(String(record['title'] ?? ''))?.[1]
    const season = seasonHit ? Number(seasonHit) : seasonContext
    const rawEpisode = record['episode']
    const episode = rawEpisode != null && rawEpisode !== '' ? Number(rawEpisode) : episodeContext
    if (typeof record['file'] === 'string' && record['file']) {
      out.push({
        file: record['file'],
        title: String(record['title'] ?? 'Auto'),
        ...(season !== undefined ? { season } : {}),
        ...(episode !== undefined && Number.isFinite(episode) ? { episode } : {}),
      })
    }
    if (Array.isArray(record['folder'])) collectLeaves(record['folder'], season, Number.isFinite(episode) ? episode : undefined, out)
  }
  return out
}

function languageOf(title: string): string {
  if (/hindi/i.test(title)) return 'hi'
  if (/english/i.test(title)) return 'en'
  if (/tamil/i.test(title)) return 'ta'
  if (/telugu/i.test(title)) return 'te'
  return 'original'
}

function classifyType(rawUrl: string): ProviderSource['type'] | null {
  if (/\.(mkv|avi|mov|wmv|flv|webm)(\?|#|$)/i.test(rawUrl)) return null
  return mediaType(rawUrl) ?? 'hls'
}

export function createCinehdProvider(http: ProviderHttp, identity: TmdbIdentityResolver, now = Date.now, options: CinehdOptions = {}) {
  const id = options.id ?? 'cinehd'
  return adapter(id, async (input, signal) => {
    const { ref } = input
    const isTv = ref.kind === 'series'
    const ids = await identity(ref, signal).catch(() => ({}) as { imdbId?: string | undefined; tmdbId?: number | undefined })
    const lookup = ids?.imdbId || (ids?.tmdbId != null ? String(ids.tmdbId) : String(ref.id))
    if (!lookup) throw new ProviderFailure('empty')

    const embedOp = bounded(signal, EMBED_TIMEOUT_MS)
    let playUrl: string
    try {
      const embedRes = await document(http, `${origin}/api/hdmovies/embed?type=${isTv ? 'tv' : 'movie'}&id=${encodeURIComponent(lookup)}`, embedOp.signal, {
        'user-agent': userAgent,
        accept: 'text/html,*/*',
        referer: `${origin}/`,
      })
      const found = embedRes.text.match(/<iframe[^>]*src="([^"]+)"/i)?.[1]
      if (!found || !/^https?:\/\//i.test(found)) throw new ProviderFailure('empty')
      playUrl = found
    } finally {
      embedOp.cleanup()
    }
    const playOrigin = new URL(playUrl).origin

    const playOp = bounded(signal, PLAY_TIMEOUT_MS)
    let rawFile: string
    let csrfKey: string
    try {
      const playRes = await document(http, playUrl, playOp.signal, {
        'user-agent': userAgent,
        accept: 'text/html,*/*',
        referer: `${origin}/`,
      })
      rawFile = playRes.text.match(/"file":"([^"]+)"/)?.[1]?.replace(/\\\//g, '/') ?? ''
      csrfKey = playRes.text.match(/"key":"([^"]+)"/)?.[1] ?? ''
      if (!rawFile || !csrfKey) throw new ProviderFailure('empty')
    } finally {
      playOp.cleanup()
    }
    const fileUrl = rawFile.startsWith('http') ? rawFile : `${playOrigin}${rawFile}`

    const postPlaylist = async (url: string, opSignal: AbortSignal): Promise<string> => {
      const response = await document(http, url, opSignal, {
        'user-agent': userAgent,
        accept: '*/*',
        referer: playUrl,
        'content-type': 'application/x-www-form-urlencoded',
        'x-csrf-token': csrfKey,
      }, { method: 'POST', body: '' })
      return response.text
    }

    const listOp = bounded(signal, LIST_TIMEOUT_MS)
    let leaves: Leaf[]
    try {
      const level1 = await postPlaylist(fileUrl, listOp.signal)
      const trimmed = level1.trim()
      if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
        try {
          const parsed: unknown = JSON.parse(trimmed)
          leaves = collectLeaves(Array.isArray(parsed) ? parsed : [parsed])
        } catch {
          leaves = []
        }
      } else {
        leaves = trimmed.split(/\s+/).filter(Boolean).map((file) => ({ file, title: 'Auto' }))
      }
    } finally {
      listOp.cleanup()
    }
    if (isTv) {
      const season = ref.season ?? 1
      const episode = ref.episode ?? 1
      const hits = leaves.filter((leaf) => leaf.season === season && leaf.episode === episode)
      leaves = hits.length ? hits : leaves.some((leaf) => leaf.season != null) ? [] : leaves
    }
    // Audio-scoped rows (cinehd-hindi): keep only matching leaves so the
    // row is Hindi-pure; absence stays honest absence.
    if (options.audio) {
      leaves = leaves.filter((leaf) => languageOf(leaf.title) === options.audio)
      if (!leaves.length) throw new ProviderFailure('empty')
    }

    const streamOp = bounded(signal, STREAM_TIMEOUT_MS)
    try {
      const settled = await Promise.all(leaves.slice(0, MAX_LEAVES).map(async (leaf) => {
        try {
          const lines = leaf.file.startsWith('~')
            ? (await postPlaylist(`${playOrigin}/playlist/${leaf.file.slice(1)}.txt`, streamOp.signal)).trim().split(/\s+/)
            : [leaf.file]
          return lines.filter(Boolean).map((url) => ({ url: url.trim(), title: leaf.title }))
        } catch {
          return []
        }
      }))
      const sources: ProviderSource[] = []
      for (const group of settled) {
        for (const { url, title } of group) {
          if (!url.startsWith('https://') || sources.length >= 12) continue
          const type = classifyType(url)
          if (!type) continue
          let expiresAt: string
          try {
            expiresAt = accessDeadline(url, now())
          } catch {
            continue
          }
          sources.push({
            key: `${id}:${languageOf(title)}:${sources.length}`,
            url,
            type,
            qualityHint: title.slice(0, 24) || 'Auto',
            expiresAt,
            language: languageOf(title),
            headers: { referer: `${origin}/` },
            subtitles: [],
          })
        }
      }
      if (!sources.length) throw new ProviderFailure('empty')
      // Prefer the requested audio first (English/Hindi servers), then
      // Original, then the rest — stable otherwise.
      const wanted = input.audioLanguage.toLowerCase()
      sources.sort((a, b) => {
        const score = (language: string) =>
          language.toLowerCase() === wanted ? 0 : language.toLowerCase() === 'original' ? 1 : 2
        return score(a.language) - score(b.language)
      })
      return sources
    } finally {
      streamOp.cleanup()
    }
  })
}
