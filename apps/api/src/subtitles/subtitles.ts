import { createCloudflareSubtitleService } from './cloudflare-service.ts'
import { playbackTrackSchema } from '@consumit/contracts'
import type { PlaybackStore } from '../playback/state.ts'
import type { TitleMetadataResolver } from '../playback/tmdb-metadata.ts'
import { servedStorageKey, toServedTracks, type SubtitleCatalog } from './catalog.ts'
import { createSubtitleDiscovery } from './discovery.ts'
import { resolveSubtitles, type ServedSubtitle } from './engine.ts'
import { MAX_OFFSET_MS, shiftVtt } from './sync.ts'
import { createStoreFileStore, type OriginalFile, type SubtitleFileStore } from './storage.ts'
import type { AnimeMappingResolver } from './anizip.ts'
import type { TmdbEpisodeCoordinates } from './tmdb-episode.ts'
import type { SubtitleSearchProvider } from './types.ts'
import type { SubtitleQuery } from './types.ts'
import { z } from 'zod'
import { isSubtitleProviderEligible, requiresExactEpisodeArchiveMatch } from './selection-policy.ts'

const SEARCH_CACHE_TTL_SECONDS = 3600
const SEARCH_CACHE_VERSION = 3

/** Optional identity enrichment must not prevent ID-keyed subtitle discovery. */
async function optionalLookup<T>(lookup: (signal: AbortSignal) => Promise<T>, signal: AbortSignal): Promise<T | null> {
  const controller = new AbortController()
  const bounded = AbortSignal.any([signal, controller.signal])
  let rejectAbort: (() => void) | undefined
  const timeout = setTimeout(() => controller.abort(), 2500)
  try {
    bounded.throwIfAborted()
    return await Promise.race([lookup(bounded), new Promise<never>((_, reject) => {
      rejectAbort = () => reject(new Error('Subtitle identity lookup stopped.'))
      bounded.addEventListener('abort', rejectAbort, { once: true })
      if (bounded.aborted) rejectAbort()
    })])
  } catch { return null }
  finally { clearTimeout(timeout); if (rejectAbort) bounded.removeEventListener('abort', rejectAbort) }
}

/** Cached track lists keep the serving provider name; the public response
 *  contract carries it inside the label instead. */
const cachedTracksSchema = z.object({
  subtitles: z.array(playbackTrackSchema.extend({ format: z.literal('vtt'), provider: z.string().min(1).max(64) })),
})

export type SubtitleRef = {
  kind: 'movie' | 'series' | 'anime'
  id: number
  season?: number | undefined
  episode?: number | undefined
}

export interface SubtitleService {
  /** Aggregated playable caption tracks for one title/episode, independent
   *  of the selected streaming provider. `langs` is the member's preferred
   *  language list (max 3, priority order); the engine tries these first
   *  from every provider and defaults to English when empty. */
  search(ref: SubtitleRef, signal: AbortSignal, langs?: readonly string[] | undefined): Promise<ServedSubtitle[]>
  /** Cached converted VTT text for a file key, or null on a miss.
   *  `offsetMs` shifts every cue server-side (member sync correction);
   *  shifted variants are cached under key+offset and never touch the
   *  source file. */
  file(key: string, offsetMs?: number | undefined): Promise<string | null>
  /** Original source bytes (srt/vtt/ass) for a file key, kept for future
   *  styled rendering. Null on backends without original storage. */
  original(key: string): Promise<OriginalFile | null>
  discovery?: ReturnType<typeof createSubtitleDiscovery>
}

/** Lenient query parsing: keep well-formed codes in order (max 3), drop
 *  the rest. Garbage never fails the search; it just narrows nothing. */
export function cleanQueryLangs(value: string | undefined): string[] {
  if (!value) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of value.split(',')) {
    const code = part.trim().toLowerCase()
    if (!/^[a-z]{2,3}$/.test(code) || seen.has(code)) continue
    seen.add(code)
    out.push(code)
    if (out.length >= 3) break
  }
  return out
}

export type AnimeTitleLookup = (anilistId: number) => Promise<{ title: string }>

export function createSubtitleService(deps: {
  providers: readonly SubtitleSearchProvider[]
  edge?: { origin: string; secret: string } | undefined
  /** Canonical TMDB title/year/imdb identity for movies and series. Without
   *  it, title-keyed providers skip and only tmdbId-keyed ones answer. */
  metadata?: TitleMetadataResolver | undefined
  animeTitle: AnimeTitleLookup
  /** AniZip identity bridge (TMDB/IMDb ids, AniDB episode, and TVDB
   *  coordinates). Absent keeps title/AniList-only anime queries. */
  animeMapping?: AnimeMappingResolver | undefined
  /** TMDB's season numbering for a canonical anime episode. AniZip's season
   *  coordinates are TVDB numbering and must not be passed to TMDB providers. */
  animeTmdbEpisode?: ((tmdbId: number, absoluteEpisode: number, signal: AbortSignal) => Promise<TmdbEpisodeCoordinates | null>) | undefined
  store: PlaybackStore
  origin: string
  /** File backend for converted VTT + originals. Defaults to the
   *  search-cache store (converted VTT only, current behavior). */
  files?: SubtitleFileStore | undefined
  /** Durable Neon metadata catalog. Read on search-cache miss, written
   *  after fresh discoveries. Absent keeps today's cache-only behavior. */
  catalog?: SubtitleCatalog | undefined
  requirements?: Readonly<Record<string, string>> | undefined
}): SubtitleService {
  deps = { ...deps, providers: deps.providers.filter(provider => isSubtitleProviderEligible(provider.id)) }
  const files = deps.files ?? createStoreFileStore(deps.store)
  /** Best-effort TMDB identity for a canonical anime episode. Bounded so a
   *  slow mapping never holds discovery; misses just narrow the provider set
   *  to title/AniList-keyed sources. */
  async function animeMap(anilistId: number, episode: number, signal: AbortSignal): Promise<{ tmdbId?: number | undefined; imdbId?: string | undefined; anidbEid?: number | undefined; season?: number | undefined; episode?: number | undefined }> {
    if (!deps.animeMapping) return {}
    try {
      const mapped = await optionalLookup(bounded => deps.animeMapping!(anilistId, episode, bounded), signal)
      if (!mapped) return {}
      return {
        ...(mapped.tmdbId !== undefined ? { tmdbId: mapped.tmdbId } : {}),
        ...(mapped.imdbId ? { imdbId: mapped.imdbId } : {}),
        ...(mapped.anidbEid !== undefined ? { anidbEid: mapped.anidbEid } : {}),
        ...(mapped.season !== undefined ? { season: mapped.season } : {}),
        ...(mapped.episode !== undefined ? { episode: mapped.episode } : {}),
      }
    } catch {
      return {}
    }
  }
  async function usableTracks(tracks: readonly ServedSubtitle[]): Promise<ServedSubtitle[]> {
    const checked = await Promise.all(tracks.map(async (track) => {
      if (!isSubtitleProviderEligible(track.provider)) return null
      const key = servedStorageKey(track.url)
      return !key || await files.getVtt(key) ? track : null
    }))
    return checked.filter((track): track is ServedSubtitle => track !== null)
  }
  async function queryFor(ref: SubtitleRef, signal: AbortSignal, preferredLanguages: readonly string[] = []): Promise<SubtitleQuery> {
    const langs = cleanQueryLangs(preferredLanguages.join(','))
    const season = ref.season ?? 1
    const episode = ref.episode ?? 1
    if (ref.kind === 'anime') {
      const [detail, mapped] = await Promise.all([
        optionalLookup(() => deps.animeTitle(ref.id), signal),
        animeMap(ref.id, episode, signal),
      ])
      const tmdbCoordinates = mapped.tmdbId && deps.animeTmdbEpisode
        ? await optionalLookup(bounded => deps.animeTmdbEpisode!(mapped.tmdbId!, episode, bounded), signal)
        : null
      // Never pass AniZip's TVDB season/episode pair to TMDB-keyed sources.
      // Use TMDB's exact coordinates when available, with the canonical
      // one-season form as a bounded fallback. Anime-native providers read
      // absoluteEpisode directly.
      const season = tmdbCoordinates?.season ?? (mapped.tmdbId ? 1 : mapped.season ?? 1)
      const providerEpisode = tmdbCoordinates?.episode ?? (mapped.tmdbId ? episode : mapped.episode ?? episode)
      return {
        type: 'anime', ...(detail?.title ? { title: detail.title } : {}),
        ...(mapped.tmdbId ? { tmdbId: mapped.tmdbId } : {}), ...(mapped.imdbId ? { imdbId: mapped.imdbId } : {}),
        ...(mapped.anidbEid ? { anidbEid: mapped.anidbEid } : {}),
        season, episode: providerEpisode, absoluteEpisode: episode, anilistId: ref.id,
        ...(langs.length ? { langs } : {}),
      }
    }
    let title: string | undefined
    let year: number | undefined
    let imdbId: string | undefined
    try {
      const meta = deps.metadata ? await optionalLookup(bounded => deps.metadata!({ kind: ref.kind, id: ref.id }, bounded), signal) : null
      title = meta?.title; year = meta?.year; imdbId = meta?.imdbId
    } catch { /* ID-keyed providers can still answer. */ }
    return {
      type: ref.kind === 'movie' ? 'movie' : 'tv', tmdbId: ref.id,
      ...(imdbId ? { imdbId } : {}), ...(title ? { title } : {}), ...(year ? { year } : {}),
      season, episode,
      ...(langs.length ? { langs } : {}),
    }
  }
  if (deps.edge) return createCloudflareSubtitleService({ ...deps.edge, query: queryFor })
  const discovery = createSubtitleDiscovery({
    providers: deps.providers, store: deps.store, files, origin: deps.origin, catalog: deps.catalog,
    query: (ref, signal, preferredLanguages) => queryFor(ref, signal, preferredLanguages), requirements: deps.requirements,
  })
  return {
    discovery,
    async search(ref: SubtitleRef, signal: AbortSignal, langs?: readonly string[] | undefined): Promise<ServedSubtitle[]> {
      const season = ref.season ?? 1
      const episode = ref.episode ?? 1
      const wanted = cleanQueryLangs(langs?.join(',')).slice(0, 3)
      // Repeat views resolve instantly: the converted files behind these
      // URLs live 7 days, so an hour-old track list is always playable.
      const cacheKey = `subsearch:v${SEARCH_CACHE_VERSION}:${ref.kind}:${ref.id}:${season}:${episode}:${wanted.join('+') || 'en'}`
      try {
        const cached = await deps.store.get(cacheKey)
        if (cached) {
          const parsed = cachedTracksSchema.safeParse(JSON.parse(cached))
          if (parsed.success) {
            const usable = await usableTracks(parsed.data.subtitles)
            if (usable.length) return usable
          }
        }
      } catch {
        // Cache failure never blocks a fresh search.
      }
      const queryLangs = wanted.length ? wanted : undefined
      // Durable catalog before live fan-out: same content-keyed tracks
      // without hammering subtitle upstreams for every hourly expiry.
      if (deps.catalog) {
        try {
          const rows = (await deps.catalog.find(ref, [])).filter(row => !requiresExactEpisodeArchiveMatch(row.provider))
          if (rows.length) {
            const cataloged = await usableTracks(toServedTracks(rows, deps.origin))
            if (!cataloged.length) throw new Error('Catalog files expired.')
            try {
              await deps.store.set(cacheKey, JSON.stringify({ subtitles: cataloged }), SEARCH_CACHE_TTL_SECONDS)
            } catch {
              // Cache failure never fails the search.
            }
            return cataloged
          }
        } catch {
          // Catalog failure falls through to live discovery.
        }
      }
      let tracks: ServedSubtitle[]
      if (ref.kind === 'anime') {
        const query = await queryFor(ref, signal, queryLangs)
        tracks = await resolveSubtitles(
          query,
          deps.providers.filter(provider => !provider.discoveryOnly),
          files,
          deps.origin,
          signal,
        )
      } else {
        let title: string | undefined
        let year: number | undefined
        let imdbId: string | undefined
        try {
          const meta = await deps.metadata?.({ kind: ref.kind, id: ref.id }, signal)
          title = meta?.title
          year = meta?.year
          imdbId = meta?.imdbId
        } catch {
          // Identity failure only narrows the provider set (title/imdb-keyed
          // providers skip); tmdbId-keyed providers still answer.
        }
        tracks = await resolveSubtitles(
          {
            type: ref.kind === 'movie' ? 'movie' : 'tv',
            tmdbId: ref.id,
            ...(imdbId ? { imdbId } : {}),
            ...(title ? { title } : {}),
            ...(year ? { year } : {}),
            season,
            episode,
            ...(queryLangs ? { langs: queryLangs } : {}),
          },
          deps.providers.filter(provider => !provider.discoveryOnly),
          files,
          deps.origin,
          signal,
        )
      }
      try {
        await deps.store.set(cacheKey, JSON.stringify({ subtitles: tracks }), SEARCH_CACHE_TTL_SECONDS)
      } catch {
        // Cache failure never fails the search.
      }
      // Write-through to the durable catalog: served (first-party) tracks
      // only; direct upstream tracks stay provider-owned. Best-effort.
      if (deps.catalog) {
        try {
          const inputs = (
            await Promise.all(
              tracks.map(async (track) => {
                if (requiresExactEpisodeArchiveMatch(track.provider)) return null
                const storageKey = servedStorageKey(track.url)
                if (!storageKey) return null
                const vtt = await files.getVtt(storageKey)
                if (!vtt) return null
                const original = await files.getOriginal(storageKey)
                return {
                  language: track.language,
                  label: track.label,
                  format: 'vtt' as const,
                  provider: track.provider,
                  storageKey,
                  ...(original ? { originalExt: original.ext } : {}),
                  vtt,
                  ...(track.hi ? { hi: true } : {}),
                  ...(typeof track.rating === 'number' ? { rating: track.rating } : {}),
                  ...(track.release ? { releaseTag: track.release } : {}),
                }
              }),
            )
          ).filter((input): input is NonNullable<typeof input> => input !== null)
          await deps.catalog.save(ref, inputs)
        } catch {
          // Catalog failure never fails the search.
        }
      }
      return tracks
    },
    async file(key: string, offsetMs?: number | undefined): Promise<string | null> {
      const base = await files.getVtt(key)
      if (!base) return null
      if (!offsetMs) return base
      if (!Number.isInteger(offsetMs) || Math.abs(offsetMs) > MAX_OFFSET_MS) return null
      const cacheKey = `subvtt:shift:${key}:${offsetMs}`
      try {
        const cached = await deps.store.get(cacheKey)
        if (cached) {
          const parsed = JSON.parse(cached) as { vtt?: unknown }
          if (typeof parsed.vtt === 'string' && parsed.vtt.startsWith('WEBVTT')) return parsed.vtt
        }
      } catch {
        // Cache failure falls through to a fresh shift.
      }
      const shifted = shiftVtt(base, offsetMs)
      if (!shifted) return null
      try {
        await deps.store.set(cacheKey, JSON.stringify({ vtt: shifted }), 7 * 24 * 3600)
      } catch {
        // Cache failure never fails the serve.
      }
      return shifted
    },
    async original(key: string): Promise<OriginalFile | null> {
      return files.getOriginal(key)
    },
  }
}
