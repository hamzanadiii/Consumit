import { z } from 'zod'
import type { ProviderInput, ProviderSource } from '../index.ts'
import { adapter, mediaType, ProviderFailure, sourceAccess, userAgent, type ProviderHttp } from './http.ts'

export type KisskhMetadata = { title: string; year: number }
export type KisskhMetadataResolver = (ref: ProviderInput['ref'], signal: AbortSignal) => Promise<KisskhMetadata>

const SITE = 'https://kisskh.do'
const API = `${SITE}/api`
const ENC = 'https://enc-dec.app/api'

const headers = {
  'user-agent': userAgent,
  accept: 'application/json, text/plain, */*',
  origin: SITE,
  referer: `${SITE}/`,
}

/** KissKH is a DramaList catalogue: movies arrive as a single episode. */
const MASTER_TIMEOUT_MS = 15000
const MIN_MATCH = 3

const searchItemSchema = z.object({
  id: z.number().nullish(),
  title: z.string().max(300).nullish(),
}).passthrough()
const detailSchema = z.object({
  episodes: z.array(z.object({
    id: z.number().nullish(),
    number: z.number().nullish(),
  }).passthrough()).max(4000).nullish(),
}).passthrough()
const tokenSchema = z.object({ result: z.string().max(4096).nullish() }).passthrough()
const episodeSchema = z.object({ Video: z.string().max(4096).nullish() }).passthrough()
const subItemSchema = z.object({
  src: z.string().max(4096).nullish(),
  label: z.string().max(128).nullish(),
  land: z.string().max(32).nullish(),
  lan: z.string().max(32).nullish(),
}).passthrough()

/** KissKH matches by title only, so identity comes from the server-owned
 *  metadata resolver, never caller-supplied text. Season packs arrive as
 *  "Title - Season N"; the recipe scores a part match highly. */
function cleanTitle(value: string): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\(\d{4}\)/g, '')
    .replace(/[^a-z0-9]/g, '')
}

function titleScore(query: string, candidate: string): number {
  const q = cleanTitle(query)
  const c = cleanTitle(candidate)
  if (!q || !c) return 0
  if (c === q) return 10
  const parts = String(candidate ?? '').split(/\s*-\s*/).map(cleanTitle)
  if (parts.some((part) => part === q)) return 8
  if (c.startsWith(q) || q.startsWith(c)) return 6
  if (c.includes(q) || q.includes(c)) return 3
  return 0
}

/** Port of the supplied KissKH recipe: a DramaList search scored by title,
 *  an episode lookup (movies are episode 1), a community kkey mint on
 *  enc-dec.app, then the Episode endpoint that names the master. The CDN
 *  rotates per title (cdnvideo11.shop masters, hls-prefixed .site segment
 *  hosts), so each HLS master is verified as a real CORS-open playlist
 *  before it becomes a source. Subtitle tracks ride a CORS-open CDN and
 *  survive as direct browser-loadable SRT. */
export function createKisskhProvider(http: ProviderHttp, metadata: KisskhMetadataResolver, now = Date.now) {
  return adapter('kisskh', async (input, signal) => {
    const { ref } = input
    if (ref.kind !== 'movie' && ref.kind !== 'series') throw new ProviderFailure('empty')
    const meta = await metadata(ref, signal)
    const title = meta.title.trim()
    if (!title) throw new ProviderFailure('empty')

    const hit = await searchTitle(http, title, signal)
    if (!hit) throw new ProviderFailure('empty')
    const episodes = await listEpisodes(http, hit.id, signal)
    const episodeNumber = ref.kind === 'series' ? ref.episode : 1
    const episode = episodes.find((item) => Math.floor(Number(item.number)) === episodeNumber)
    if (!episode) throw new ProviderFailure('empty')

    const vidToken = await mintToken(http, episode.id, 'vid', signal)
    if (!vidToken) throw new ProviderFailure('unavailable')
    const stream = await resolveEpisode(http, episode.id, vidToken, signal)
    if (!stream || !/^https:\/\//i.test(stream) || stream.length > 4096) throw new ProviderFailure('empty')

    const type = mediaType(stream, stream.includes('.m3u8') ? 'hls' : undefined)
    if (type !== 'hls' && type !== 'native') throw new ProviderFailure('empty')
    // The CDN rotates hosts per title; confirm the master is a live
    // CORS-open playlist so a gated or dead lane never becomes a session.
    if (type === 'hls' && !(await isOpenMaster(http, stream, signal))) throw new ProviderFailure('empty')

    const subtitles = await listSubtitles(http, episode.id, signal)
    const access = sourceAccess(stream, now())
    const sources: ProviderSource[] = [{
      key: `kisskh:${hit.id}:${episode.id}`,
      url: stream,
      type,
      headers: {},
      expiresAt: access.expiresAt,
      ...(access.expiryEstimated ? { expiryEstimated: true } : {}),
      language: 'original',
      qualityHint: 'Auto',
      subtitles,
    }]
    return sources
  })
}

async function searchTitle(http: ProviderHttp, title: string, signal: AbortSignal): Promise<{ id: number; title: string } | null> {
  let response
  try {
    response = await http(`${API}/DramaList/Search?q=${encodeURIComponent(title)}`, headers, signal)
  } catch {
    return null
  }
  if (response.status < 200 || response.status >= 300) return null
  let body: unknown
  try {
    body = JSON.parse(response.text) as unknown
  } catch {
    return null
  }
  if (!Array.isArray(body)) return null
  let best: { id: number; title: string } | null = null
  let bestScore = 0
  for (const raw of body.slice(0, 100)) {
    const parsed = searchItemSchema.safeParse(raw)
    if (!parsed.success || parsed.data.id === undefined || parsed.data.id === null) continue
    const candidate = String(parsed.data.title ?? '')
    const score = titleScore(title, candidate)
    if (score > bestScore) {
      bestScore = score
      best = { id: parsed.data.id, title: candidate }
    }
  }
  return best && bestScore >= MIN_MATCH ? best : null
}

async function listEpisodes(http: ProviderHttp, dramaId: number, signal: AbortSignal): Promise<Array<{ id: number; number: number }>> {
  let response
  try {
    response = await http(`${API}/DramaList/Drama/${dramaId}`, headers, signal)
  } catch {
    return []
  }
  if (response.status < 200 || response.status >= 300) return []
  let body: unknown
  try {
    body = JSON.parse(response.text) as unknown
  } catch {
    return []
  }
  const parsed = detailSchema.safeParse(body)
  if (!parsed.success) return []
  const out: Array<{ id: number; number: number }> = []
  for (const raw of parsed.data.episodes ?? []) {
    if (raw.id === undefined || raw.id === null || raw.number === undefined || raw.number === null) continue
    out.push({ id: raw.id, number: raw.number })
  }
  return out
}

/** The community kkey mint is a separate host from the catalogue; it hands
 *  back a short-lived token the Episode and Sub endpoints both require. */
async function mintToken(http: ProviderHttp, episodeId: number, kind: 'vid' | 'sub', signal: AbortSignal): Promise<string | null> {
  let response
  try {
    response = await http(`${ENC}/enc-kisskh?text=${episodeId}&type=${kind}`, { 'user-agent': userAgent, accept: 'application/json' }, signal)
  } catch {
    return null
  }
  if (response.status < 200 || response.status >= 300) return null
  let body: unknown
  try {
    body = JSON.parse(response.text) as unknown
  } catch {
    return null
  }
  const parsed = tokenSchema.safeParse(body)
  if (!parsed.success) return null
  const token = String(parsed.data.result ?? '').trim()
  return token || null
}

async function resolveEpisode(http: ProviderHttp, episodeId: number, token: string, signal: AbortSignal): Promise<string | null> {
  let response
  try {
    response = await http(`${API}/DramaList/Episode/${episodeId}.png?err=false&ts=&time=&kkey=${encodeURIComponent(token)}`, headers, signal)
  } catch {
    return null
  }
  if (response.status < 200 || response.status >= 300) return null
  let body: unknown
  try {
    body = JSON.parse(response.text) as unknown
  } catch {
    return null
  }
  const parsed = episodeSchema.safeParse(body)
  if (!parsed.success) return null
  const stream = String(parsed.data.Video ?? '').trim()
  return stream || null
}

async function listSubtitles(http: ProviderHttp, episodeId: number, signal: AbortSignal): Promise<ProviderSource['subtitles']> {
  const token = await mintToken(http, episodeId, 'sub', signal)
  if (!token) return []
  let response
  try {
    response = await http(`${API}/Sub/${episodeId}?kkey=${encodeURIComponent(token)}`, headers, signal)
  } catch {
    return []
  }
  if (response.status < 200 || response.status >= 300) return []
  let body: unknown
  try {
    body = JSON.parse(response.text) as unknown
  } catch {
    return []
  }
  if (!Array.isArray(body)) return []
  const tracks: Array<{ url: string; label: string; language: string; format: 'srt' | 'vtt' }> = []
  const seen = new Set<string>()
  for (const raw of body.slice(0, 64)) {
    const parsed = subItemSchema.safeParse(raw)
    if (!parsed.success) continue
    const url = String(parsed.data.src ?? '').trim()
    if (!/^https:\/\//i.test(url) || url.length > 4096 || seen.has(url)) continue
    seen.add(url)
    const label = String(parsed.data.label ?? parsed.data.land ?? 'Subtitle').trim().slice(0, 128) || 'Subtitle'
    const language = String(parsed.data.land ?? parsed.data.lan ?? 'unknown').trim().slice(0, 32) || 'unknown'
    tracks.push({ url, label, language, format: /\.vtt($|\?)/i.test(url) ? 'vtt' : 'srt' })
    if (tracks.length >= 32) break
  }
  return tracks.map((track, index) => ({
    id: `kisskh:${episodeId}:${index}`,
    label: track.label,
    language: track.language,
    url: track.url,
    format: track.format,
  }))
}

/** Direct delivery needs a real playlist the browser can read cross-origin;
 *  a gated or dead CDN answers with an error page or no CORS header. */
async function isOpenMaster(http: ProviderHttp, master: string, signal: AbortSignal): Promise<boolean> {
  const scoped = new AbortController()
  const onAbort = () => scoped.abort(signal.reason)
  if (signal.aborted) return false
  signal.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => scoped.abort(new DOMException('KissKH master timed out', 'TimeoutError')), MASTER_TIMEOUT_MS)
  try {
    const response = await http(master, { 'user-agent': userAgent }, scoped.signal, { readPrefixBytes: 64 * 1024 })
    if (response.status < 200 || response.status >= 300) return false
    if (response.headers?.get('access-control-allow-origin') !== '*') return false
    return response.text.trimStart().startsWith('#EXTM3U')
  } catch {
    return false
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', onAbort)
  }
}
