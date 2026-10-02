import type { SubtitleHttp } from './http.ts'

// AniZip mapping bridge: canonical anime episodes (AniList ids) resolve to
// the TMDB / AniDB / TVDB identity that downstream providers query by.
// Keyless (https://api.ani.zip), bounded in-process cache. This is what lets
// the TMDB-keyed subtitle fleet (VDRK, Natsuki, RiveSubs, NxshaSubs) serve
// anime: TMDB lists anime as TV series, and ani.zip carries the TVDB
// season/episode numbers those providers query by.

const API = 'https://api.ani.zip'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
const TTL_MS = 6 * 3600 * 1000
const MAX_ENTRIES = 200
// Long-runners (1000+ episodes) push mappings past 1 MiB; the transport cap
// is caller-owned, so mappings carry their own budget.
const MAPPINGS_MAX_BYTES = 4_194_304

export type AnizipEpisodeMap = {
  tmdbId?: number | undefined
  imdbId?: string | undefined
  anidbEid?: number | undefined
  season: number
  episode: number
}

/** Pure: extract one canonical episode's mapping from a mappings payload
 *  (unit-testable; the fetch wrapper below only adds caching). */
export function anizipEpisode(mappings: unknown, episode: number): AnizipEpisodeMap | null {
  if (!mappings || typeof mappings !== 'object') return null
  const root = mappings as { mappings?: Record<string, unknown>; episodes?: Record<string, Record<string, unknown>> }
  const ids = root.mappings ?? {}
  const info = root.episodes?.[String(episode)] ?? {}
  const tmdbRaw = ids.themoviedb_id
  const tmdbId = typeof tmdbRaw === 'number' && Number.isFinite(tmdbRaw) ? tmdbRaw
    : typeof tmdbRaw === 'string' && /^\d+$/.test(tmdbRaw) ? Number(tmdbRaw) : undefined
  const imdbId = typeof ids.imdb_id === 'string' && ids.imdb_id ? ids.imdb_id : undefined
  const anidbEid = typeof info.anidbEid === 'number' && info.anidbEid > 0 ? info.anidbEid : undefined
  // TVDB season/episode (what TMDB-shaped providers query by); fall back to
  // season 1 plus the canonical number when the episode entry is missing.
  const season = Number(info.seasonNumber || 1)
  const ep = Number(info.episodeNumber || episode)
  if (tmdbId === undefined && anidbEid === undefined) return null
  return { ...(tmdbId !== undefined ? { tmdbId } : {}), ...(imdbId ? { imdbId } : {}), ...(anidbEid !== undefined ? { anidbEid } : {}), season, episode: ep }
}

export function createAnizipClient(http: SubtitleHttp) {
  const cache = new Map<number, { at: number; data: unknown }>()
  async function mappingsFor(anilistId: number, signal: AbortSignal): Promise<unknown | null> {
    const hit = cache.get(anilistId)
    if (hit && Date.now() - hit.at < TTL_MS) return hit.data
    let parsed: unknown
    try {
      const { text } = await http.get(`${API}/mappings?anilist_id=${encodeURIComponent(String(anilistId))}`, {
        'User-Agent': UA,
        Accept: 'application/json',
      }, signal, MAPPINGS_MAX_BYTES)
      parsed = JSON.parse(text)
    } catch {
      return null
    }
    if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value!)
    cache.set(anilistId, { at: Date.now(), data: parsed })
    return parsed
  }
  /** Mapped ids for one canonical anime episode. Null when unmapped. */
  async function episodeFor(anilistId: number, episode: number, signal: AbortSignal): Promise<AnizipEpisodeMap | null> {
    return anizipEpisode(await mappingsFor(anilistId, signal), episode)
  }
  return { mappingsFor, episodeFor }
}

export type AnizipClient = ReturnType<typeof createAnizipClient>

/** Subtitle-service hook: canonical anime episode to TMDB identity.
 *  Optional so fakes and older call sites keep today's behavior. */
export type AnimeMappingResolver = (
  anilistId: number,
  episode: number,
  signal: AbortSignal,
) => Promise<{ tmdbId?: number | undefined; season?: number | undefined } | null>
