import { z } from 'zod'
import type { ProviderInput, ProviderSource } from '../index.ts'
import { accessDeadline, adapter, document, mediaType, ProviderFailure, userAgent, type ProviderHttp } from './http.ts'

export type PurstreamMetadata = { title: string; year: number }
export type PurstreamMetadataResolver = (ref: ProviderInput['ref'], signal: AbortSignal) => Promise<PurstreamMetadata>

const API = 'https://api.purstream.ad/api/v1'
const SITE = 'https://purstream.ad'

const headers = {
  'user-agent': userAgent,
  accept: 'application/json, text/plain, */*',
  referer: `${SITE}/`,
  origin: SITE,
  'x-requested-with': 'XMLHttpRequest',
}

// Direct browser-playable HTTPS media only: no proxy/relay wrappers, no embed pages.
const RELAY_RE = /workers\.dev|mp4-proxy|messagebroker|proxy\?(url|data)=|%3A%2F%2F.*url%3D/i
const EMBED_RE = /\/embed\//i

const MAX_SOURCES = 12

const itemSchema = z.object({
  id: z.union([z.string().max(64), z.number()]).nullish(),
  type: z.string().max(32).nullish(),
  title: z.string().max(300).nullish(),
  release_date: z.string().max(32).nullish(),
  first_air_date: z.string().max(32).nullish(),
}).passthrough()
const searchSchema = z.object({
  data: z.object({ items: z.object({ movies: z.object({ items: z.array(itemSchema).max(100).nullish() }).passthrough().nullish() }).passthrough() }).passthrough(),
}).passthrough()
const sourceSchema = z.object({
  stream_url: z.string().max(4096).nullish(),
  url: z.string().max(4096).nullish(),
}).passthrough()
const streamSchema = z.object({
  type: z.string().max(32).nullish(),
  data: z.object({ items: z.object({ sources: z.array(sourceSchema).max(64).nullish() }).passthrough() }).passthrough(),
}).passthrough()

function norm(value: string): string {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** Upstream labels series as show or tv and movies as film or movie depending on the index. */
const SERIES_TYPES = new Set(['series', 'show', 'tv'])
const MOVIE_TYPES = new Set(['movie', 'film'])

function isDirectCandidate(rawUrl: string): boolean {
  if (!/^https:\/\//i.test(rawUrl)) return false
  if (RELAY_RE.test(rawUrl)) return false
  if (EMBED_RE.test(rawUrl)) return false
  try {
    const parsed = new URL(rawUrl)
    if (parsed.protocol !== 'https:') return false
    if (parsed.username || parsed.password) return false
  } catch {
    return false
  }
  return true
}

/** Port of the supplied Purstream recipe: title search with normalized
 *  match plus type/year preference, then per-title stream endpoints. Only
 *  direct browser-playable HTTPS media survives selection; the free
 *  media host is CORS-open so the player hits the CDN directly. Title
 *  identity comes from the server-owned metadata resolver, never from
 *  caller-supplied text. */
export function createPurstreamProvider(http: ProviderHttp, metadata: PurstreamMetadataResolver, now = Date.now) {
  return adapter('purstream', async (input, signal) => {
    const { ref } = input
    const kind = ref.kind === 'movie' ? 'movie' : 'series'
    if (ref.kind !== 'movie' && ref.kind !== 'series') throw new ProviderFailure('empty')
    const meta = await metadata(ref, signal)
    const title = meta.title.trim()
    if (!title) throw new ProviderFailure('empty')
    const hit = await searchTitle(http, title, kind, meta.year, signal)
    if (!hit) throw new ProviderFailure('empty')
    const url = kind === 'series'
      ? `${API}/stream/${encodeURIComponent(hit.id)}/episode?season=${ref.season}&episode=${ref.episode}`
      : `${API}/stream/${encodeURIComponent(hit.id)}`
    const response = await document(http, url, signal, headers)
    let body: unknown
    try {
      body = JSON.parse(response.text) as unknown
    } catch {
      throw new ProviderFailure('malformed')
    }
    const parsed = streamSchema.safeParse(body)
    if (!parsed.success) throw new ProviderFailure('malformed')
    if (parsed.data.type && parsed.data.type !== 'success') throw new ProviderFailure('empty')
    const sources: ProviderSource[] = []
    const seen = new Set<string>()
    for (const item of parsed.data.data.items.sources ?? []) {
      const streamUrl = String(item.stream_url ?? item.url ?? '').trim()
      if (!streamUrl || streamUrl.length > 4096 || seen.has(streamUrl) || !isDirectCandidate(streamUrl)) continue
      const type = mediaType(streamUrl, 'hls')
      if (type !== 'hls') continue
      seen.add(streamUrl)
      let expiresAt: string
      try {
        expiresAt = accessDeadline(streamUrl, now())
      } catch {
        continue
      }
      sources.push({
        key: `purstream:${hit.id}:${sources.length}`,
        url: streamUrl,
        type,
        headers: {},
        expiresAt,
        language: 'original',
        qualityHint: 'Auto',
        subtitles: [],
      })
      if (sources.length >= MAX_SOURCES) break
    }
    if (!sources.length) throw new ProviderFailure('empty')
    return sources
  })
}

async function searchTitle(http: ProviderHttp, title: string, kind: 'movie' | 'series', year: number, signal: AbortSignal): Promise<{ id: string; title: string } | null> {
  let response
  try {
    response = await document(http, `${API}/search-bar/search/${encodeURIComponent(title)}`, signal, headers)
  } catch {
    return null
  }
  let body: unknown
  try {
    body = JSON.parse(response.text) as unknown
  } catch {
    return null
  }
  const parsed = searchSchema.safeParse(body)
  if (!parsed.success) return null
  const wanted = norm(title)
  const wantYear = String(year).slice(0, 4)
  let best: { id: string; title: string } | null = null
  let bestScore = 0
  for (const item of parsed.data.data.items.movies?.items ?? []) {
    if (item.id === undefined || item.id === null) continue
    const type = String(item.type ?? '').toLowerCase()
    if (!(kind === 'series' ? SERIES_TYPES : MOVIE_TYPES).has(type)) continue
    const candidate = norm(item.title ?? '')
    if (!candidate || !wanted) continue
    let score = 0
    if (candidate === wanted) score = 6
    else if (candidate.includes(wanted) || wanted.includes(candidate)) score = 4
    else {
      const words = new Set(candidate.split(' '))
      const overlap = wanted.split(' ').filter((word) => words.has(word)).length
      if (overlap && overlap >= Math.max(1, Math.ceil(wanted.split(' ').length * 0.6))) score = 2
    }
    if (!score) continue
    const released = String(item.release_date ?? item.first_air_date ?? '')
    if (wantYear && released.startsWith(wantYear)) score += 3
    if (score > bestScore) {
      bestScore = score
      best = { id: String(item.id), title: String(item.title ?? '') }
    }
  }
  return best
}
