import type { PlaybackRef } from '@consumit/contracts'
import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, mediaType, ProviderFailure, userAgent, type ProviderHttp } from './http.ts'
import { discoverRelaySource } from './relay-discovery.ts'

const apiOrigin = 'https://lmscript.xyz'
const headers = { 'user-agent': userAgent, accept: 'application/json', referer: `${apiOrigin}/` }
const qualityOrder = ['auto', '1080p', '1080', '720p', '720', '480p', '480', '360p', '360'] as const

const movieSchema = z.object({
  id_movie: z.union([z.string().min(1).max(128), z.number().int().positive()]).optional(),
  title: z.string().max(300).optional(),
  year: z.union([z.string().max(8), z.number().int()]).nullish(),
}).passthrough()

const searchSchema = z.object({ items: z.array(movieSchema).max(100).optional() }).passthrough()
const viewSchema = z.object({
  streams: z.record(z.string(), z.string().max(4096)).optional(),
  // The live API returns hundreds of subtitle entries; only the first 20 are
  // offered to playback, but parse a bounded response instead of rejecting it.
  subtitles: z.array(z.object({
    url: z.string().max(4096).optional(),
    language: z.string().max(64).optional(),
    label: z.string().max(128).optional(),
  }).passthrough()).max(1000).optional(),
}).passthrough()

export type LookmovieMetadata = { title: string; year: number }
export type LookmovieMetadataResolver = (ref: PlaybackRef, signal: AbortSignal) => Promise<LookmovieMetadata>

function normalizeTitle(value: string) {
  return value.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function sameYear(candidate: z.infer<typeof movieSchema>, year: number) {
  const value = String(candidate.year ?? '').trim()
  return !value || value === String(year)
}

function matchingMovie(items: z.infer<typeof movieSchema>[], title: string, year: number) {
  const wanted = normalizeTitle(title)
  const candidates = items.filter((item) => {
    const candidateTitle = normalizeTitle(item.title ?? '')
    return candidateTitle && sameYear(item, year)
      && (candidateTitle === wanted || candidateTitle.includes(wanted) || wanted.includes(candidateTitle))
      && item.id_movie !== undefined
  })
  candidates.sort((a, b) => {
    const aTitle = normalizeTitle(a.title ?? '')
    const bTitle = normalizeTitle(b.title ?? '')
    const aScore = Number(aTitle === wanted) * 10 - aTitle.length
    const bScore = Number(bTitle === wanted) * 10 - bTitle.length
    return bScore - aScore
  })
  return candidates[0]
}

async function requestJson<T>(http: ProviderHttp, url: string, signal: AbortSignal, schema: z.ZodType<T>) {
  const response = await http(url, headers, signal)
  if (response.status === 404) throw new ProviderFailure('empty')
  if (response.status < 200 || response.status >= 300) throw new ProviderFailure('unavailable')
  return schema.parse(JSON.parse(response.text))
}

// lmscript stalls individual reads for minutes at a time (observed live:
// hung TLS handshakes while other queries answer instantly). One stalled
// read must not burn the whole 15s attempt budget, or a retryable query
// never gets tried. Each catalog read gets its own bound; a timeout behaves
// like any other retryable upstream failure.
const READ_TIMEOUT_MS = 6000

function boundedRead(parent: AbortSignal) {
  const controller = new AbortController()
  if (parent.aborted) controller.abort(parent.reason)
  const onAbort = () => controller.abort(parent.reason)
  parent.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(new DOMException('LookMovie read timed out', 'TimeoutError')), READ_TIMEOUT_MS)
  return { signal: controller.signal, cleanup: () => { clearTimeout(timer); parent.removeEventListener('abort', onAbort) } }
}

export function createLookmovieProvider(http: ProviderHttp, metadata: LookmovieMetadataResolver, now = Date.now, scope: { id?: string; relayHostDiscovery?: boolean } = {}) {
  return adapter(scope.id ?? 'lookmovie', async ({ ref }, signal) => {
    if (ref.kind !== 'movie') throw new ProviderFailure('empty')
    const identity = await metadata(ref, signal)
    const title = identity.title.trim()
    if (!title || !Number.isInteger(identity.year)) throw new ProviderFailure('empty')

    // PROVE progressive-shortening recipe: lmscript full-title search often
    // returns empty (e.g. "Avengers Infinity War" -> 0 hits while "Avengers"
    // has it), so fall back through progressively shorter word-prefix
    // queries. The exact full title is always tried first; at most four
    // catalog reads run before the match is declared a miss.
    const words = normalizeTitle(title).split(' ').filter(Boolean)
    const queries: string[] = [title]
    for (let n = words.length - 1; n >= 1; n--) {
      const shortened = words.slice(0, n).join(' ')
      if (shortened.length > 2 && !queries.includes(shortened)) queries.push(shortened)
    }

    let match: ReturnType<typeof matchingMovie> | undefined
    let lastError: unknown
    for (const query of queries.slice(0, 4)) {
      const read = boundedRead(signal)
      let search: z.infer<typeof searchSchema>
      try {
        search = await requestJson(http,
          `${apiOrigin}/v1/movies?filters[q]=${encodeURIComponent(query)}`, read.signal, searchSchema)
      } catch (error) {
        read.cleanup()
        if (error instanceof ProviderFailure) { lastError = error; continue }
        if (error instanceof DOMException && (error.name === 'TimeoutError' || error.name === 'AbortError') && !signal.aborted) {
          lastError = new ProviderFailure('unavailable')
          continue
        }
        throw error
      }
      read.cleanup()
      const found = matchingMovie(search.items ?? [], title, identity.year)
      if (found?.id_movie) { match = found; break }
    }
    if (!match?.id_movie) {
      // A down catalog stays retryable; a genuine miss answers empty.
      if (lastError instanceof ProviderFailure && lastError.code !== 'empty') throw lastError
      throw new ProviderFailure('empty')
    }

    const viewRead = boundedRead(signal)
    let view: z.infer<typeof viewSchema>
    try {
      view = await requestJson(http,
        `${apiOrigin}/v1/movies/view?expand=streams,subtitles&id=${encodeURIComponent(String(match.id_movie))}`,
        viewRead.signal, viewSchema)
    } finally {
      viewRead.cleanup()
    }

    const subtitles: ProviderSource['subtitles'] = []
    const seenSubtitles = new Set<string>()
    for (const subtitle of view.subtitles ?? []) {
      const rawUrl = subtitle.url?.trim()
      if (!rawUrl || subtitles.length >= 20) continue
      let url: URL
      try { url = new URL(rawUrl, `${apiOrigin}/`) } catch { continue }
      if (url.protocol !== 'https:' || url.username || url.password || seenSubtitles.has(url.href)) continue
      seenSubtitles.add(url.href)
      const label = (subtitle.language ?? subtitle.label ?? 'Unknown').trim().slice(0, 64) || 'Unknown'
      const path = url.pathname.toLowerCase()
      const format = path.endsWith('.srt') ? 'srt' : path.endsWith('.ass') ? 'ass' : 'vtt'
      subtitles.push({
        id: `lookmovie-sub-${subtitles.length}`,
        label,
        language: label.slice(0, 32),
        url: url.href,
        format,
      })
    }

    const sources: ProviderSource[] = []
    const seenSources = new Set<string>()
    for (const [index, quality] of qualityOrder.entries()) {
      const rawUrl = view.streams?.[quality]?.trim()
      if (!rawUrl) continue
      let url: URL
      try { url = new URL(rawUrl) } catch { continue }
      if (url.protocol !== 'https:' || url.username || url.password || seenSources.has(url.href)) continue
      let expiresAt: string
      try { expiresAt = accessDeadline(url.href, now()) } catch { continue }
      seenSources.add(url.href)
      const height = Number.parseInt(/^(\d{3,4})p?$/.exec(quality)?.[1] ?? '0', 10)
      sources.push({
        key: `lookmovie:${height ? `${height}p` : 'auto'}:${index}`,
        url: url.href,
        type: mediaType(url.href) ?? 'hls',
        qualityHint: height ? `${height}p` : 'Auto',
        qualityGroup: 'lookmovie',
        expiresAt,
        language: 'original',
        headers: {},
        subtitles,
        ...(height ? { height } : {}),
      })
      if (sources.length >= 16) break
    }
    if (!sources.length) throw new ProviderFailure('empty')
    if (!scope.relayHostDiscovery) return sources
    const verified: ProviderSource[] = []
    for (const source of sources) {
      signal.throwIfAborted()
      try { verified.push(await discoverRelaySource(source, http, 'lookmovie-v1', signal)) }
      catch { if (signal.aborted) signal.throwIfAborted() }
    }
    if (!verified.length) throw new ProviderFailure('unavailable')
    return verified
  })
}
