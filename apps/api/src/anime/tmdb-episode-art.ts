import type { Catalog } from '../catalog/catalog.ts'
import { StaleCache, type CachePolicy } from '../catalog/stale-cache.ts'

/** TMDB fallback for anime episode art Kitsu misses. Matching is
 *  deliberately strict — a wrong thumbnail is worse than the honest
 *  placeholder, so fuzzy near-misses stay misses:
 *  normalized title equality (english/romaji/native vs TMDB name or
 *  original name) plus a season-year within one.
 *
 *  Seasons are walked cumulatively: canonical episode N maps into the
 *  TMDB season holding the Nth episode of the absolute run (specials
 *  excluded), which survives split-cours season partitions. */

export type TmdbEpisodeArt = {
  tmdbId: number
  season: number
  episode: number
  title: string | null
  overview: string | null
  stillUrl: string | null
  airDate: string | null
}

export type AnimeTitles = {
  english: string | null
  romaji: string | null
  native: string | null
}

const mappingPolicy = { freshForMs: 7 * 86_400_000, staleForMs: 30 * 86_400_000 } satisfies CachePolicy

export function normalizeAnimeTitle(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function yearOf(date: string | null): number | null {
  if (!date) return null
  const year = Number(date.slice(0, 4))
  return Number.isInteger(year) && year >= 1917 && year <= 2200 ? year : null
}

/** Confident reverse match (TMDB title -> AniList entry): normalized title
 *  equality against the AniList english/romaji/native names plus a year
 *  within one when both sides carry one. Powers the "also available as
 *  anime" cross-link on TMDB title pages. */
export function matchesAnimeTitle(
  tmdb: { title: string; originalTitle: string | null },
  tmdbYear: number | null,
  candidate: { titles: AnimeTitles; seasonYear: number | null },
): boolean {
  const wanted = [tmdb.title, tmdb.originalTitle]
    .filter((title): title is string => !!title)
    .map(normalizeAnimeTitle)
    .filter(Boolean)
  if (!wanted.length) return false
  const names = [candidate.titles.english, candidate.titles.romaji, candidate.titles.native]
    .filter((title): title is string => !!title)
    .map(normalizeAnimeTitle)
    .filter(Boolean)
  if (!names.some((name) => wanted.includes(name))) return false
  if (tmdbYear === null || candidate.seasonYear === null) return true
  return Math.abs(candidate.seasonYear - tmdbYear) <= 1
}

/** Confident match only: normalized title equality against either TMDB
 *  name field plus a season year within one. */
export function matchesTmdbTitle(
  titles: AnimeTitles,
  year: number | null,
  candidate: { name: string; originalName: string; firstAirDate: string | null },
): boolean {
  const variants = [titles.english, titles.romaji, titles.native]
    .filter((title): title is string => !!title)
    .map(normalizeAnimeTitle)
    .filter(Boolean)
  if (!variants.length) return false
  const names = [normalizeAnimeTitle(candidate.name), normalizeAnimeTitle(candidate.originalName)]
  if (!variants.some((variant) => names.includes(variant))) return false
  if (year === null) return true
  const candidateYear = yearOf(candidate.firstAirDate)
  return candidateYear !== null && Math.abs(candidateYear - year) <= 1
}

export type TmdbEpisodeArtResolver = {
  episodeByTitle(anilistId: number, titles: AnimeTitles, year: number | null, episode: number): Promise<TmdbEpisodeArt | null>
  /** Canonical TMDB artwork for an anime title (series or film): hero
   *  logo plus the matched TMDB identity. Null when nothing matches. */
  titleLogo(anilistId: number, titles: AnimeTitles, year: number | null): Promise<{ tmdbId: number; kind: 'movie' | 'series'; logoUrl: string | null } | null>
}

export function createTmdbEpisodeArt(catalog: Catalog, cache = new StaleCache()): TmdbEpisodeArtResolver {
  /** AniList id -> TMDB title identity (series first, then film). Cached
   *  long; mismatches never store. */
  async function tmdbTitle(anilistId: number, titles: AnimeTitles, year: number | null): Promise<{ id: number; kind: 'movie' | 'series' } | null> {
    const cached = await cache.get<{ id: number; kind: 'movie' | 'series' } | null>(`tmdb:anime:${anilistId}`, mappingPolicy, async () => {
      for (const kind of ['series', 'movie'] as const) {
        for (const query of [titles.english, titles.romaji].filter((title): title is string => !!title?.trim())) {
          const page = await catalog.search({ kind, page: 1, query: query.slice(0, 100) })
          const hit = page.items.find((item) =>
            matchesTmdbTitle(titles, year, { name: item.title, originalName: item.originalTitle, firstAirDate: item.releaseDate }),
          )
          if (hit) return { id: hit.id, kind }
        }
      }
      return null
    })
    // Tolerate pre-upgrade cache shapes (bare numeric ids).
    const value = cached.value as { id: number; kind: 'movie' | 'series' } | number | null
    return typeof value === 'number' ? { id: value, kind: 'series' as const } : value
  }

  return {
    async episodeByTitle(anilistId: number, titles: AnimeTitles, year: number | null, episode: number): Promise<TmdbEpisodeArt | null> {
      if (!Number.isInteger(anilistId) || anilistId <= 0 || !Number.isInteger(episode) || episode <= 0) return null
      const match = await tmdbTitle(anilistId, titles, year)
      if (!match || match.kind !== 'series') return null
      const id = match.id
      let detail: Awaited<ReturnType<Catalog['title']>>
      try {
        detail = await catalog.title('series', id)
      } catch {
        return null
      }
      if (detail.item.kind !== 'series') return null
      // Walk seasons cumulatively to the absolute episode (specials excluded
      // upstream by the TMDB adapter's season filter).
      let remaining = episode
      let seasonNumber: number | null = null
      for (const season of [...detail.item.seasons].sort((a, b) => a.number - b.number)) {
        if (season.episodeCount <= 0) continue
        if (remaining > season.episodeCount) {
          remaining -= season.episodeCount
          continue
        }
        seasonNumber = season.number
        break
      }
      if (seasonNumber === null) return null
      let season: Awaited<ReturnType<Catalog['season']>>
      try {
        season = await catalog.season(id, seasonNumber)
      } catch {
        return null
      }
      const found = season.item.episodes.find((entry) => entry.episodeNumber === remaining)
      if (!found) return null
      return {
        tmdbId: id,
        season: seasonNumber,
        episode: remaining,
        title: found.title || null,
        overview: found.overview || null,
        stillUrl: found.stillUrl,
        airDate: found.airDate,
      }
    },

    async titleLogo(anilistId: number, titles: AnimeTitles, year: number | null) {
      if (!Number.isInteger(anilistId) || anilistId <= 0) return null
      const match = await tmdbTitle(anilistId, titles, year)
      if (!match) return null
      try {
        const detail = await catalog.title(match.kind, match.id)
        const logoUrl = detail.item.kind === match.kind ? detail.item.logoUrl : null
        return { tmdbId: match.id, kind: match.kind, logoUrl }
      } catch {
        return null
      }
    },
  }
}
