import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import { accessDeadline, adapter, document, mediaType, ProviderFailure, userAgent, verifiedPlaybackSources, type ProviderHttp } from './http.ts'
import type { AnimeTitleResolver } from './anixo.ts'

// Port of the PROVE NekoWatch recipe (providers/anime/nekowatch.ts, verified
// 2026-10-15): an origin-gated AniList API (origin + x-requested-with) whose
// per-key episode and watch routes address provider slugs through SE, and
// whose streams often ride https://nekowatch.xyz/proxy/hls?url= wrappers.
// These rows are RELAY tier, so every wrapper is unwrapped to the bare
// upstream here and wrapper-only upstreams are dropped by the liveness gate
// instead of shipped as ?url= targets Consumit's validation rejects. Provider
// keys fail over in PROVE order, two lanes probed at a time; the first lane
// with verified roots wins. Verification date: 2026-10-16.

const SITE = 'https://nekowatch.xyz'

const API_HEADERS: Record<string, string> = {
  'user-agent': userAgent,
  accept: 'application/json',
  'x-requested-with': 'NekoWatch',
  origin: SITE,
  referer: `${SITE}/`,
}

/** provider key -> Se label slug (label lowercased, non-alnum -> -). */
const SE: Record<string, string> = {
  origin: 'origin',
  reanime: 'konbanwa',
  miruro: 'komorebi',
  anipm: 'yozora',
  animegg: 'arigato',
  anikoto: 'konichiwa',
  animedunya: 'kudasai',
  mkissa: 'neko',
  animenosub: 'yoru',
  aniwaves: 'nami',
  anizone: 'sora',
  senshi: 'tsuki',
  kaa: 'ramen',
  animeonsen: 'animeonsen',
}

const PROVIDER_ORDER = ['aniwaves', 'reanime', 'animegg', 'animenosub', 'kaa', 'miruro', 'mkissa'] as const

const LANE_TIMEOUT_MS = 10000
const MAX_SOURCES = 4
const DIRECT_HOSTS = /echovideo|roburnt10|negativestatus/i

const episodeSchema = z.object({ number: z.unknown().optional(), sourceNumber: z.unknown().optional() }).passthrough()
const episodesNodeSchema = z.object({
  episodes: z.object({ sub: z.array(episodeSchema).optional(), dub: z.array(episodeSchema).optional() }).passthrough().optional(),
}).passthrough()
const episodesSchema = z.record(z.string(), episodesNodeSchema)
const streamSchema = z.object({
  kind: z.string().max(16).optional(),
  url: z.string().max(4096).optional(),
  quality: z.string().max(64).optional(),
}).passthrough()
const watchSchema = z.object({
  streams: z.array(streamSchema).max(64).optional(),
  subtitles: z.array(z.unknown()).max(64).optional(),
}).passthrough()
const searchSchema = z.object({
  items: z.array(z.object({ id: z.unknown().optional(), title: z.unknown().optional() }).passthrough()).max(50).optional(),
}).passthrough()

function bounded(parent: AbortSignal, ms: number) {
  const controller = new AbortController()
  if (parent.aborted) controller.abort(parent.reason)
  const onAbort = () => controller.abort(parent.reason)
  parent.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(new DOMException('NekoWatch request timed out', 'TimeoutError')), ms)
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

/** Unwrap /proxy/hls?url= wrappers (and nested ones) to the bare upstream.
 *  A wrapper that cannot be unwrapped never becomes a source: Consumit
 *  rejects ?url=-wrapped targets on every row. */
function unwrapProxy(raw: string): { url: string; viaProxy: boolean } | null {
  let current = raw
  let viaProxy = false
  for (let hop = 0; hop < 3; hop++) {
    let parsed: URL
    try {
      parsed = new URL(current, SITE)
    } catch {
      return null
    }
    if (parsed.protocol !== 'https:') return null
    if (parsed.pathname !== '/proxy/hls') return { url: parsed.toString(), viaProxy }
    const upstream = parsed.searchParams.get('url')
    if (!upstream) return null
    current = upstream
    viaProxy = true
  }
  return null
}

function streamHeaders(url: string, hls: boolean, viaProxy: boolean): Record<string, string> {
  let host = ''
  try {
    host = new URL(url).hostname
  } catch {
    return { 'user-agent': userAgent }
  }
  if (hls && DIRECT_HOSTS.test(host)) return { 'user-agent': userAgent }
  if (/animegg\.org/i.test(host)) return { 'user-agent': userAgent, referer: 'https://www.animegg.org/' }
  if (viaProxy) return { 'user-agent': userAgent, referer: `${SITE}/` }
  return { 'user-agent': userAgent }
}

function qualityOf(value: unknown): string {
  const quality = String(value ?? '').trim().slice(0, 24)
  return quality || 'Auto'
}

function mapSubtitles(raw: unknown): ProviderSource['subtitles'] {
  if (!Array.isArray(raw)) return []
  const out: ProviderSource['subtitles'] = []
  const seen = new Set<string>()
  for (const item of raw.slice(0, 64)) {
    if (out.length >= 32) break
    if (!item || typeof item !== 'object') continue
    const track = item as Record<string, unknown>
    const resolved = unwrapProxy(String(track.url ?? ''))
    if (!resolved) continue
    const url = resolved.url
    if (seen.has(url)) continue
    seen.add(url)
    const label = String(track.label || track.lang || 'English').slice(0, 64) || 'English'
    const format = /\.ass(?:$|[?#])/i.test(url) || String(track.url ?? '').includes('.ass') ? 'ass' as const : 'vtt' as const
    out.push({
      id: `nekowatch-sub-${out.length}`,
      label,
      language: String(track.lang || label).toLowerCase().slice(0, 32) || 'und',
      url,
      format,
    })
  }
  return out
}

function pickEpisodes(node: z.infer<typeof episodesNodeSchema> | undefined, track: 'sub' | 'dub'): z.infer<typeof episodeSchema>[] {
  const episodes = node?.episodes
  if (!episodes) return []
  const wanted = episodes[track]
  if (Array.isArray(wanted)) return wanted
  // PROVE falls back to the sub list when the requested audio list is absent.
  return Array.isArray(episodes.sub) ? episodes.sub : []
}

function findEpisode(list: z.infer<typeof episodeSchema>[], episode: number) {
  return list.find((item) => Number(item.number) === episode)
    ?? list.find((item) => Number(item.sourceNumber) === episode)
}

function episodeMarker(value: unknown, fallback: number): string {
  if (value === null || value === undefined) return String(fallback)
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? String(parsed) : String(fallback)
}

export function createNekowatchProvider(http: ProviderHttp, resolveTitle: AnimeTitleResolver, now = Date.now) {
  return Object.assign(adapter('nekowatch', async (input, signal) => {
    const { ref } = input
    if (ref.kind !== 'anime' || !ref.episode) throw new ProviderFailure('empty')
    const dub = input.audioLanguage === 'en'
    const track: 'sub' | 'dub' = dub ? 'dub' : 'sub'
    const episode = ref.episode
    const alid = await resolveAniListId()
    let malformed = false
    const allServerCandidates: ProviderSource[] = []

    async function resolveAniListId(): Promise<number> {
      if (Number.isInteger(ref.id) && ref.id > 0) return ref.id
      let title = ''
      try {
        title = (await resolveTitle(ref.id, signal)).trim()
      } catch {
        throw new ProviderFailure('empty')
      }
      if (!title) throw new ProviderFailure('empty')
      const search = await getJson(http, `${SITE}/api/anime/search?q=${encodeURIComponent(title)}`, signal)
      if (!search.ok) throw new ProviderFailure(search.malformed ? 'malformed' : 'empty')
      const parsed = searchSchema.safeParse(search.body)
      if (!parsed.success) throw new ProviderFailure('malformed')
      const items = parsed.data.items ?? []
      let best = items[0]
      if (!best) throw new ProviderFailure('empty')
      for (const item of items.slice(1)) {
        if (titleScore(String(item.title ?? ''), title) > titleScore(String(best.title ?? ''), title)) best = item
      }
      const id = Number(best.id)
      if (!Number.isInteger(id) || id <= 0) throw new ProviderFailure('empty')
      return id
    }

    async function lane(key: string): Promise<ProviderSource[]> {
      const slug = SE[key]
      if (!slug) return []
      try {
        const episodesRes = await getJson(http, `${SITE}/api/anime/episodes/${key}/${alid}?map=false`, signal)
        if (!episodesRes.ok) {
          if (episodesRes.malformed) malformed = true
          return []
        }
        const node = episodesSchema.safeParse(episodesRes.body)
        if (!node.success) {
          malformed = true
          return []
        }
        const target = findEpisode(pickEpisodes(node.data[key], track), episode)
        if (!target) return []
        const marker = episodeMarker(target.number, episode)
        const watchRes = await getJson(http, `${SITE}/api/anime/watch/${slug}/${alid}/${track}/${slug}-${marker}`, signal)
        if (!watchRes.ok) {
          if (watchRes.malformed) malformed = true
          return []
        }
        const watch = watchSchema.safeParse(watchRes.body)
        if (!watch.success) {
          malformed = true
          return []
        }
        const candidates = buildCandidates(key, watch.data.streams ?? [])
        if (!candidates.length) return []
        const subtitles = mapSubtitles(watch.data.subtitles)
        return candidates.map((source) => ({ ...source, subtitles }))
      } catch {
        return []
      }
    }

    function buildCandidates(key: string, streams: z.infer<typeof streamSchema>[]): ProviderSource[] {
      const out: ProviderSource[] = []
      const seen = new Set<string>()
      for (const stream of streams) {
        if (out.length >= MAX_SOURCES) break
        const kind = String(stream.kind ?? '')
        if (kind === 'embed') continue
        const raw = String(stream.url ?? '')
        if (!raw) continue
        const resolved = unwrapProxy(raw)
        if (!resolved) continue
        const { url, viaProxy } = resolved
        if (!viaProxy && kind !== 'hls' && kind !== 'file') continue
        if (seen.has(url)) continue
        seen.add(url)
        const hls = kind === 'hls' || /\.m3u8(?:$|\?)/i.test(url) || url.includes('t.m3u8')
        let expiresAt: string
        try {
          expiresAt = accessDeadline(url, now())
        } catch {
          continue
        }
        out.push({
          key: `nekowatch:${key}:${track}:${episode}:${out.length}`, serverName: key.slice(0, 80),
          url,
          type: mediaType(url, hls ? 'hls' : 'mp4') ?? 'hls',
          headers: streamHeaders(url, hls, viaProxy),
          expiresAt,
          language: dub ? 'en' : 'original',
          qualityHint: qualityOf(stream.quality),
          subtitles: [],
        })
      }
      return out
    }

    // Probe two lanes at a time, keeping one validated choice per upstream server.
    // This lets Watch offer each server separately instead of hiding every
    // later server behind the first candidate with a reachable playlist.
    for (let start = 0; start < PROVIDER_ORDER.length; start += 2) {
      const results = await Promise.all(PROVIDER_ORDER.slice(start, start + 2).map((key) => lane(key)))
      for (const laneCandidates of results) {
        if (laneCandidates.length && allServerCandidates.length < PROVIDER_ORDER.length) {
          allServerCandidates.push(laneCandidates[0]!)
        }
      }
    }
    const verified = await verifiedPlaybackSources(http, allServerCandidates, signal)
    if (verified.length) return verified
    if (malformed) throw new ProviderFailure('malformed')
    throw new ProviderFailure('empty')
  }), { audioLanguages: ['ja', 'en'] })
}
