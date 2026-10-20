import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, document, mediaType, ProviderFailure, userAgent, verifiedPlaybackSources, type ProviderHttp } from './http.ts'
import type { AnimeTitleResolver } from './anixo.ts'

// Port of the PROVE JustAnime recipe (providers/anime/justanime.ts, verified
// 2026-10-15): the origin-gated core.justanime.to JSON API resolving an
// AniList id to /watch/{alid}/episode/{ep}/{server} payloads whose sub and
// dub blocks carry per-source headers and subtitles. These rows are RELAY
// tier: upstream headers survive only as the four allowed lowercase names,
// and every HLS root is liveness-gated before selection, so the first server
// in PROVE's preferred order (re-ranked by the /servers activity map) whose
// roots actually answer wins. Verification date: 2026-10-16.

const SITE = 'https://justanime.to'
const CORE = 'https://core.justanime.to/api'

const API_HEADERS: Record<string, string> = {
  'user-agent': userAgent,
  accept: 'application/json',
  origin: SITE,
  referer: `${SITE}/`,
}

/** Prefer bare-direct multi-quality first (nami), then core HLS, then animegg. */
const SERVER_ORDER = ['nami', 'revo', 'calm', 'gigi', 'momo'] as const

const LANE_TIMEOUT_MS = 10000
const MAX_SOURCES = 16
const MAX_SOURCES_PER_SERVER = 2
const ALLOWED_HEADERS = new Set(['referer', 'origin', 'user-agent', 'accept'])

const sourceSchema = z.object({
  url: z.string().max(4096).optional(),
  file: z.string().max(4096).optional(),
  quality: z.string().max(64).optional(),
  isM3U8: z.boolean().optional(),
  headers: z.record(z.string().max(64), z.string().max(512)).optional(),
}).passthrough()
const subTrackSchema = z.object({
  url: z.string().max(4096).optional(),
  file: z.string().max(4096).optional(),
  label: z.string().max(128).optional(),
  lang: z.string().max(32).optional(),
  name: z.string().max(256).optional(),
  kind: z.string().max(32).optional(),
}).passthrough()
const blockSchema = z.object({
  sources: z.array(sourceSchema).max(32).optional(),
  subtitles: z.array(subTrackSchema).max(64).optional(),
  tracks: z.array(subTrackSchema).max(64).optional(),
}).passthrough()
const watchSchema = z.object({ sub: blockSchema.optional(), dub: blockSchema.optional() }).passthrough()
const serversSchema = z.object({ servers: z.record(z.string(), z.record(z.string(), z.unknown())).optional() }).passthrough()
const searchSchema = z.object({
  results: z.array(z.object({ id: z.unknown().optional(), title: z.unknown().optional() }).passthrough()).max(50).optional(),
}).passthrough()

function bounded(parent: AbortSignal, ms: number) {
  const controller = new AbortController()
  if (parent.aborted) controller.abort(parent.reason)
  const onAbort = () => controller.abort(parent.reason)
  parent.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(new DOMException('JustAnime request timed out', 'TimeoutError')), ms)
  return { signal: controller.signal, cleanup: () => { clearTimeout(timer); parent.removeEventListener('abort', onAbort) } }
}

type ApiResult = { ok: true; body: unknown } | { ok: false; malformed: boolean }

/** A 200 with an unparseable body is a broken upstream contract (malformed);
 *  HTTP failures and timeouts only miss the lane. */
async function getJson(http: ProviderHttp, url: string, signal: AbortSignal): Promise<ApiResult> {
  const op = bounded(signal, LANE_TIMEOUT_MS)
  try {
    const res = await document(http, url, op.signal, API_HEADERS)
    try {
      return { ok: true, body: JSON.parse(res.text) as unknown }
    } catch {
      return { ok: false, malformed: true }
    }
  } catch {
    return { ok: false, malformed: false }
  } finally {
    op.cleanup()
  }
}

/** Title slug similarity for search-result matching (0..1), from PROVE's BaseAnimeProvider. */
function titleScore(a: string, b: string): number {
  const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
  const x = norm(a)
  const y = norm(b)
  if (!x || !y) return 0
  if (x === y) return 1
  const xw = new Set(x.split(' '))
  const yw = new Set(y.split(' '))
  let inter = 0
  for (const word of xw) if (yw.has(word)) inter++
  return inter / Math.max(xw.size, yw.size)
}

function titleOf(value: unknown): string {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return String(record.english || record.romaji || '')
  }
  return ''
}

/** Keep only the four delivery-relevant header names, lowercased, and always
 *  carry a user-agent; upstream extras (traces, cookies) never ride a session. */
function upstreamHeaders(raw: Record<string, string> | undefined): Record<string, string> {
  const headers: Record<string, string> = { 'user-agent': userAgent }
  for (const [name, value] of Object.entries(raw ?? {})) {
    const key = name.toLowerCase()
    if (!ALLOWED_HEADERS.has(key) || /[\r\n]/.test(value)) continue
    headers[key] = value
  }
  return headers
}

function qualityOf(value: unknown): string {
  const quality = String(value ?? '').trim().slice(0, 24)
  return quality || 'Auto'
}

function mapSubtitles(block: z.infer<typeof blockSchema>): ProviderSource['subtitles'] {
  const out: ProviderSource['subtitles'] = []
  const seen = new Set<string>()
  for (const track of block.subtitles ?? block.tracks ?? []) {
    if (out.length >= 32) break
    if (track.kind === 'thumbnails') continue
    const url = String(track.url ?? track.file ?? '')
    if (!/^https:\/\//.test(url) || seen.has(url)) continue
    seen.add(url)
    const label = String(track.label || track.lang || 'English').slice(0, 64) || 'English'
    const format = /\.ass(?:$|[?#])/i.test(url) || String(track.name ?? '').includes('ass') ? 'ass' as const : 'vtt' as const
    out.push({
      id: `justanime-sub-${out.length}`,
      label,
      language: String(track.lang || label).toLowerCase().slice(0, 32) || 'und',
      url,
      format,
    })
  }
  return out
}

export function createJustanimeProvider(http: ProviderHttp, resolveTitle: AnimeTitleResolver, now = Date.now) {
  return Object.assign(adapter('justanime', async (input, signal) => {
    const { ref } = input
    if (ref.kind !== 'anime' || !ref.episode) throw new ProviderFailure('empty')
    const dub = input.audioLanguage === 'en'
    const track: 'sub' | 'dub' = dub ? 'dub' : 'sub'
    const episode = ref.episode
    const alid = await resolveAniListId()
    let malformed = false

    async function resolveAniListId(): Promise<number> {
      if (Number.isInteger(ref.id) && ref.id > 0) return ref.id
      let title = ''
      try {
        title = (await resolveTitle(ref.id, signal)).trim()
      } catch {
        throw new ProviderFailure('empty')
      }
      if (!title) throw new ProviderFailure('empty')
      const search = await getJson(http, `${CORE}/search?q=${encodeURIComponent(title)}`, signal)
      if (!search.ok) throw new ProviderFailure(search.malformed ? 'malformed' : 'empty')
      const parsed = searchSchema.safeParse(search.body)
      if (!parsed.success) throw new ProviderFailure('malformed')
      const results = parsed.data.results ?? []
      let best = results[0]
      if (!best) throw new ProviderFailure('empty')
      for (const item of results.slice(1)) {
        if (titleScore(titleOf(item.title), title) > titleScore(titleOf(best.title), title)) best = item
      }
      const id = Number(best.id)
      if (!Number.isInteger(id) || id <= 0) throw new ProviderFailure('empty')
      return id
    }

    let order: string[] = [...SERVER_ORDER]
    const serversRes = await getJson(http, `${CORE}/watch/${alid}/episode/${episode}/servers`, signal)
    if (serversRes.ok) {
      const parsed = serversSchema.safeParse(serversRes.body)
      if (!parsed.success) malformed = true
      else {
        const map = parsed.data.servers ?? {}
        const active = Object.keys(map).filter((name) => {
          const value = map[name]
          if (!value) return false
          return Boolean(value[track] || value.sub || value.dub)
        })
        if (active.length) {
          order = [
            ...SERVER_ORDER.filter((name) => active.includes(name)),
            ...active.filter((name) => !(SERVER_ORDER as readonly string[]).includes(name)),
          ]
        }
      }
    } else if (serversRes.malformed) malformed = true

    const candidates: ProviderSource[] = []
    const seen = new Set<string>()
    for (const server of order) {
      signal.throwIfAborted()
      const res = await getJson(http, `${CORE}/watch/${alid}/episode/${episode}/${server}`, signal)
      if (!res.ok) {
        if (res.malformed) malformed = true
        continue
      }
      const payload = watchSchema.safeParse(res.body)
      if (!payload.success) {
        malformed = true
        continue
      }
      // Requested audio block first; PROVE falls over to the other block.
      const block = payload.data[track] ?? payload.data[track === 'sub' ? 'dub' : 'sub']
      const list = block?.sources ?? []
      if (!block || !list.length) continue
      const subtitles = mapSubtitles(block)
      let serverSources = 0
      for (const src of list) {
        if (candidates.length >= MAX_SOURCES || serverSources >= MAX_SOURCES_PER_SERVER) break
        const url = String(src.url ?? src.file ?? '')
        if (!/^https:\/\//.test(url) || seen.has(url)) continue
        seen.add(url)
        const hls = Boolean(src.isM3U8) || /\.m3u8(?:$|\?)/i.test(url)
        let expiresAt: string
        try {
          expiresAt = accessDeadline(url, now())
        } catch {
          continue
        }
        candidates.push({
          key: `justanime:${server}:${track}:${episode}:${serverSources}`, serverName: server.slice(0, 80),
          url,
          type: mediaType(url, hls ? 'hls' : 'mp4') ?? 'hls',
          headers: upstreamHeaders(src.headers),
          expiresAt,
          language: dub ? 'en' : 'original',
          qualityHint: qualityOf(src.quality),
          subtitles,
        })
        serverSources++
      }
    }
    const verified = await verifiedPlaybackSources(http, candidates, signal)
    if (verified.length) return verified
    if (malformed) throw new ProviderFailure('malformed')
    throw new ProviderFailure('empty')
  }), { audioLanguages: ['ja', 'en'] })
}
