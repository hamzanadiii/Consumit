import type { AnimeEpisode, AnimeTitleDetail, AnimeFranchise, AnimeAiringSchedule, AnimePage, AnimeSearchResult, AnimeBatch, AnimeSeason } from '@consumit/contracts'
import type { AnimeCatalog } from '../catalog/anilist/adapter.ts'
import type { KitsuCatalog } from '../catalog/kitsu/kitsu.ts'
import { AnimeError } from './errors.ts'
import { matchesAnimeTitle } from './tmdb-episode-art.ts'
import type { TmdbEpisodeArtResolver } from './tmdb-episode-art.ts'

export type AnimeService = {
  search(query: string, page?: number): Promise<AnimeSearchResult>
  title(anilistId: number): Promise<AnimeTitleDetail>
  /** Confident AniList match for a TMDB title (cross-link from title
   *  pages when an "Animation + Japan" TMDB entry is really anime).
   *  Null when nothing matches — never fuzzy. */
  matchTmdbTitle(title: string, originalTitle: string | null, year: number | null): Promise<number | null>
  trending(page?: number): Promise<AnimePage>
  seasonal(season: AnimeSeason, year: number, page?: number): Promise<AnimePage>
  franchise(anilistId: number): Promise<AnimeFranchise>
  airingSchedule(anilistId: number): Promise<AnimeAiringSchedule>
  batch(anilistIds: number[]): Promise<AnimeBatch>
  /** Canonical episode metadata (title, synopsis, still) via Kitsu,
   *  keyed by the AniList title's MAL id. Null art stays null — the UI
   *  falls back to streaming thumbnails, then the placeholder. */
  episode(anilistId: number, episode: number): Promise<AnimeEpisode>
}

export function createAnimeService(
  catalog: AnimeCatalog,
  deps: {
    episodeArt?: KitsuCatalog | undefined
    tmdbEpisodeArt?: TmdbEpisodeArtResolver | undefined
  } = {},
): AnimeService {
  return {
    async search(query, page = 1) {
      return catalog.search(query, page)
    },

    async matchTmdbTitle(title, originalTitle, year) {
      if (!title.trim()) return null
      const page = await catalog.search(title.slice(0, 100), 1, 10)
      for (const item of page.items) {
        if (matchesAnimeTitle(
          { title, originalTitle },
          year,
          { titles: { english: item.titles.english, romaji: item.titles.romaji, native: item.titles.native }, seasonYear: item.seasonYear },
        )) return item.anilistId
      }
      return null
    },

    async title(anilistId) {
      const detail = await catalog.title(anilistId)
      // Hero logo from TMDB when the title matches confidently; best-effort
      // and never fatal — the serif title stands in otherwise.
      if (deps.tmdbEpisodeArt) {
        try {
          const logo = await deps.tmdbEpisodeArt.titleLogo(
            anilistId,
            { english: detail.titles.english, romaji: detail.titles.romaji, native: detail.titles.native },
            detail.seasonYear,
          )
          if (logo?.logoUrl) return { ...detail, logoUrl: logo.logoUrl }
        } catch {
          // Fall through to the unadorned detail below.
        }
      }
      return { ...detail, logoUrl: null }
    },

    async trending(page = 1) {
      return catalog.trending(page)
    },

    async seasonal(season, year, page = 1) {
      return catalog.seasonal(season, year, page)
    },

    async franchise(anilistId) {
      return catalog.relations(anilistId)
    },

    async airingSchedule(anilistId) {
      return catalog.airingSchedule(anilistId)
    },

    async batch(anilistIds) {
      return catalog.batch(anilistIds)
    },

    async episode(anilistId, episode) {
      if (!deps.episodeArt && !deps.tmdbEpisodeArt) throw new AnimeError('ANILIST_UNAVAILABLE', 'Episode artwork is not configured on this server.')
      const detail = await catalog.title(anilistId)
      const duration = detail.episodeDuration && detail.episodeDuration > 0 ? detail.episodeDuration : null
      const usable = (art: { title: string | null; synopsis: string | null; stillUrl: string | null } | null): art is NonNullable<typeof art> =>
        art !== null && (art.title !== null || art.synopsis !== null || art.stillUrl !== null)
      const toEpisode = (art: { title: string | null; synopsis: string | null; stillUrl: string | null; airDate: string | null }): AnimeEpisode => ({
        anilistId,
        number: episode,
        title: art.title,
        description: art.synopsis,
        thumbnail: art.stillUrl,
        airDate: art.airDate && /^\d{4}-\d{2}-\d{2}$/.test(art.airDate) ? art.airDate : null,
        duration,
      })
      const toTmdbEpisode = (fallback: { title: string | null; overview: string | null; stillUrl: string | null; airDate: string | null }): AnimeEpisode => ({
        anilistId,
        number: episode,
        title: fallback.title,
        description: fallback.overview,
        thumbnail: fallback.stillUrl,
        airDate: fallback.airDate && /^\d{4}-\d{2}-\d{2}$/.test(fallback.airDate) ? fallback.airDate : null,
        duration,
      })
      // TMDB is the primary source: it carries stills where Kitsu most
      // often has titles alone. Kitsu stays as the canonical fallback.
      // A failing source stays a miss (honest 404), never a 503.
      let tmdb: { title: string | null; overview: string | null; stillUrl: string | null; airDate: string | null } | null = null
      if (deps.tmdbEpisodeArt) {
        try {
          const fallback = await deps.tmdbEpisodeArt.episodeByTitle(
            anilistId,
            { english: detail.titles.english, romaji: detail.titles.romaji, native: detail.titles.native },
            detail.seasonYear,
            episode,
          )
          if (fallback && (fallback.title !== null || fallback.overview !== null || fallback.stillUrl !== null)) {
            tmdb = fallback
          }
        } catch {
          // Fall through to the picks below.
        }
      }
      let kitsu: { title: string | null; synopsis: string | null; stillUrl: string | null; airDate: string | null } | null = null
      if (deps.episodeArt && detail.malId && (!tmdb || !tmdb.stillUrl)) {
        const art = await deps.episodeArt.episodeByMalId(detail.malId, episode)
        if (art && usable(art)) kitsu = art
      }
      // Prefer still-bearing art (the card's whole job), then any usable
      // entry, TMDB first.
      if (tmdb?.stillUrl) return toTmdbEpisode(tmdb)
      if (kitsu?.stillUrl) return toEpisode(kitsu)
      if (tmdb) return toTmdbEpisode(tmdb)
      if (kitsu) return toEpisode(kitsu)
      throw new AnimeError('ANIME_NOT_FOUND', 'No episode artwork is known for this episode.')
    },
  }
}
