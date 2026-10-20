import { Buffer } from 'node:buffer'
import { z } from 'zod'
import type { ProviderSource } from '../index.ts'
import type { AnimeTitleResolver } from './anixo.ts'
import type { AnimeTitleVariantsResolver } from './animeparadise.ts'
import { accessDeadline, adapter, ProviderFailure, userAgent, type ProviderHttp } from './http.ts'
import { assertHlsManifest } from '../manifest.ts'

const API = 'https://fireani.me'
const STEP_TIMEOUT_MS = 8000
const PROBE_TIMEOUT_MS = 8000
const CACHE_CAP = 200

// Port of the PROVE FireAnime recipe (verified 2026-10-16): a German meta
// search over Connect-RPC JSON. The injected title resolver supplies the
// search string; SearchAnimes hits are confirmed by GetAnime until one maps
// the AniList id. The absolute episode walks non-movie seasons (movie/OVA/
// special seasons skipped); an empty link list falls back to season 1 +
// absolute numbering. Only VOE hosters resolve: the embed page hops up to
// two window.location redirects onto a rotating mirror, whose packed
// application/json blob decodes (rot13/separators/base64/reverse/-3/base64)
// into a single HLS master on cloudwindow-route hosts that serve ACAO *.
// The master gets one bounded liveness probe before it becomes a source.
// Slug/anime lookups are module-capped caches. Sub/dub: dub falls back to
// sub; subtitles: none on VOE.
const searchSchema = z.object({ data: z.array(z.object({ slug: z.string().max(200) }).passthrough()).max(100).default([]) }).passthrough()
const animeSchema = z.object({
  anilist: z.union([z.string().max(16), z.number()]).nullish(),
  animeSeasons: z.array(z.object({
    season: z.string().max(32),
    animeEpisodes: z.array(z.unknown()).max(2000).default([]),
  }).passthrough()).max(100).default([]),
}).passthrough()
const episodeSchema = z.object({
  data: z.object({
    animeEpisodeLinks: z.array(z.object({
      link: z.string().max(4096),
      lang: z.string().max(32).optional(),
      name: z.string().max(64).optional(),
    }).passthrough()).max(32).default([]),
  }).passthrough().default({ animeEpisodeLinks: [] }),
}).passthrough()

const slugCache = new Map<string, string | null>()
const animeCache = new Map<string, z.infer<typeof animeSchema>>()

function cacheSet<K, V>(cache: Map<K, V>, key: K, value: V) {
  if (cache.size >= CACHE_CAP) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(key, value)
}

function bounded(parent: AbortSignal, ms: number, label: string) {
  const controller = new AbortController()
  if (parent.aborted) controller.abort(parent.reason)
  const onAbort = () => controller.abort(parent.reason)
  parent.addEventListener('abort', onAbort, { once: true })
  const timer = setTimeout(() => controller.abort(new DOMException(label, 'TimeoutError')), ms)
  return { signal: controller.signal, cleanup: () => { clearTimeout(timer); parent.removeEventListener('abort', onAbort) } }
}

const rpcHeaders = {
  'content-type': 'application/json',
  'user-agent': userAgent,
  accept: 'application/json',
  origin: API,
  referer: `${API}/`,
}

async function rpc(http: ProviderHttp, path: string, body: unknown, signal: AbortSignal): Promise<unknown | null> {
  const op = bounded(signal, STEP_TIMEOUT_MS, 'FireAnime RPC timed out')
  try {
    const response = await http(`${API}${path}`, rpcHeaders, op.signal, { method: 'POST', body: JSON.stringify(body) })
    if (response.status < 200 || response.status >= 300) return null
    try {
      return JSON.parse(response.text) as unknown
    } catch {
      return null
    }
  } catch {
    return null
  } finally {
    op.cleanup()
  }
}

async function getAnime(http: ProviderHttp, slug: string, signal: AbortSignal): Promise<z.infer<typeof animeSchema> | null> {
  const cached = animeCache.get(slug)
  if (cached) return cached
  const response = await rpc(http, '/api.v1.anime.AnimeService/GetAnime', { slug }, signal)
  // Connect-RPC wraps this endpoint's payload in `data`; validating the
  // envelope itself silently applied Zod defaults (no AniList id/seasons),
  // making every search hit look like the wrong anime.
  const raw = response && typeof response === 'object' && !Array.isArray(response)
    && 'data' in response && response.data && typeof response.data === 'object'
    ? response.data
    : response
  const parsed = animeSchema.safeParse(raw)
  if (!parsed.success) return null
  cacheSet(animeCache, slug, parsed.data)
  return parsed.data
}

async function resolveSlug(http: ProviderHttp, anilistId: number, titles: readonly string[], signal: AbortSignal): Promise<string | null> {
  const cacheKey = String(anilistId)
  if (slugCache.has(cacheKey)) return slugCache.get(cacheKey) ?? null
  for (const title of titles.slice(0, 4)) {
    const searched = searchSchema.safeParse(await rpc(http, '/api.v1.AnimeSearchService/SearchAnimes', { q: title, page: 1, limit: 8 }, signal))
    if (!searched.success) continue
    for (const hit of searched.data.data) {
      const full = await getAnime(http, hit.slug, signal)
      if (full && String(full.anilist ?? '') === cacheKey) {
        cacheSet(slugCache, cacheKey, hit.slug)
        return hit.slug
      }
    }
  }
  cacheSet(slugCache, cacheKey, null)
  return null
}

function isMovieSeason(name: string): boolean {
  return /filme|movie|film|special|ova|ona|gespecial/i.test(name)
}

/** AniList absolute episode → local (season, episode) via non-movie season walk. */
function mapEpisode(anime: z.infer<typeof animeSchema>, ep: number): { season: string; episode: string } {
  let offset = 0
  for (const season of anime.animeSeasons) {
    const id = String(season.season ?? '')
    if (!id || isMovieSeason(id)) continue
    const count = season.animeEpisodes.length
    if (count > 0 && ep <= offset + count) return { season: id, episode: String(ep - offset) }
    offset += count
  }
  return { season: '1', episode: String(ep) }
}

function rot13(value: string): string {
  return value.replace(/[a-zA-Z]/g, (c) => {
    const base = c <= 'Z' ? 65 : 97
    return String.fromCharCode(((c.charCodeAt(0) - base + 13) % 26) + base)
  })
}

/** Packed VOE blob → JSON {source, fallback}: exact PROVE decode chain. */
function decodeVoeBlob(blob: string): string | null {
  try {
    let s = rot13(blob.trim())
    for (const sep of ['@$', '^^', '~@', '%?', '*~', '!!', '#&']) s = s.split(sep).join('_')
    s = s.split('_').join('')
    const reversed = Buffer.from(s, 'base64').toString('binary').split('').reverse().join('')
    let shifted = ''
    for (let i = 0; i < reversed.length; i++) shifted += String.fromCharCode(reversed.charCodeAt(i) - 3)
    const parsed = JSON.parse(Buffer.from(shifted, 'base64').toString('binary')) as { source?: string; fallback?: string | string[] }
    const master = String(parsed.source || (Array.isArray(parsed.fallback) ? parsed.fallback[0] : parsed.fallback) || '')
    return master.includes('.m3u8') ? master : null
  } catch {
    return null
  }
}

/** VOE embed → (up to two) JS-redirect hops → packed blob → HLS master. */
async function resolveVoe(http: ProviderHttp, embedUrl: string, signal: AbortSignal): Promise<string | null> {
  let url = embedUrl
  for (let hop = 0; hop < 2; hop++) {
    const op = bounded(signal, PROBE_TIMEOUT_MS, 'FireAnime VOE hop timed out')
    let html: string
    try {
      const response = await http(url, { 'user-agent': userAgent, accept: 'text/html' }, op.signal)
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers?.get('location')
        if (!location) return null
        url = new URL(location, url).toString()
        continue
      }
      if (response.status < 200 || response.status >= 300) return null
      html = response.text
    } catch {
      return null
    } finally {
      op.cleanup()
    }
    const blob = html.match(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/)?.[1]
    if (blob) {
      const master = decodeVoeBlob(blob)
      if (master) return master
    }
    const redirect = html.match(/window\.location\.href\s*=\s*'([^']+)'/)
    if (redirect?.[1]) {
      url = new URL(redirect[1], url).toString()
      continue
    }
    return null
  }
  return null
}

async function isLiveMaster(http: ProviderHttp, url: string, signal: AbortSignal): Promise<boolean> {
  const op = bounded(signal, PROBE_TIMEOUT_MS, 'FireAnime master probe timed out')
  try {
    const response = await http(url, { 'user-agent': userAgent }, op.signal, { readPrefixBytes: 64 * 1024 })
    if (response.status < 200 || response.status >= 300) return false
    assertHlsManifest(response.text)
    return true
  } catch {
    return false
  } finally {
    op.cleanup()
  }
}

export function createFireanimeProvider(http: ProviderHttp, resolveTitle: AnimeTitleResolver, now = Date.now, resolveTitleVariants?: AnimeTitleVariantsResolver) {
  return Object.assign(adapter('fireanime', async (input, signal) => {
    const { ref } = input
    if (ref.kind !== 'anime' || !ref.episode) throw new ProviderFailure('empty')
    let title: string
    try {
      title = (await resolveTitle(ref.id, signal)).trim()
    } catch {
      throw new ProviderFailure('empty')
    }
    if (!title) throw new ProviderFailure('empty')

    let aliases: readonly string[] = []
    try { aliases = resolveTitleVariants ? await resolveTitleVariants(ref.id, signal) : [] } catch { /* canonical title remains usable */ }
    const slug = await resolveSlug(http, ref.id, [...new Set([title, ...aliases].map(value => value.trim()).filter(Boolean))], signal)
    if (!slug) throw new ProviderFailure('empty')
    const anime = await getAnime(http, slug, signal)
    if (!anime) throw new ProviderFailure('empty')
    const mapped = mapEpisode(anime, ref.episode)

    const parseLinks = (raw: unknown) => {
      const parsed = episodeSchema.safeParse(raw)
      return parsed.success ? parsed.data.data.animeEpisodeLinks : []
    }
    let links = parseLinks(await rpc(http, '/api.v1.anime.AnimeService/GetEpisode', { slug, season: mapped.season, episode: mapped.episode }, signal))
    if (!links.length) {
      // Some catalogs number inside season 1 only; retry raw absolute.
      if (mapped.season !== '1' || mapped.episode !== String(ref.episode)) {
        links = parseLinks(await rpc(http, '/api.v1.anime.AnimeService/GetEpisode', { slug, season: '1', episode: String(ref.episode) }, signal))
      }
      if (!links.length) throw new ProviderFailure('empty')
    }

    const voe = links.filter((link) => /voe/i.test(String(link.name ?? '')))
    const pick = (wanted: 'sub' | 'dub') => voe.find((link) => {
      const lang = String(link.lang ?? '').toLowerCase()
      return wanted === 'dub' ? lang.endsWith('-dub') : lang.endsWith('-sub')
    }) ?? null

    const wanted: 'sub' | 'dub' = input.audioLanguage === 'en' ? 'dub' : 'sub'
    let chosen = pick(wanted)
    let dubbed = wanted === 'dub'
    if (!chosen && wanted === 'dub') {
      chosen = pick('sub')
      if (chosen) dubbed = false
    }
    if (!chosen) chosen = voe[0] ?? null
    if (!chosen) throw new ProviderFailure('empty')
    if (/-dub$/i.test(String(chosen.lang ?? ''))) dubbed = true

    const master = await resolveVoe(http, chosen.link, signal)
    if (!master || !master.startsWith('https://') || master.length > 4096) throw new ProviderFailure('empty')
    if (!(await isLiveMaster(http, master, signal))) throw new ProviderFailure('empty')

    let expiresAt: string
    try {
      expiresAt = accessDeadline(master, now())
    } catch {
      throw new ProviderFailure('empty')
    }
    const source: ProviderSource = {
      key: `fireanime:${dubbed ? 'dub' : 'sub'}:${ref.episode}`,
      url: master,
      type: 'hls',
      headers: {},
      expiresAt,
      language: dubbed ? 'en' : 'original',
      qualityHint: 'Auto',
      subtitles: [],
    }
    return [source]
  }), { audioLanguages: ['ja', 'en'] })
}
