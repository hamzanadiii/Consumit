import type { AnimeEpisode, AnimeTitleDetail, AnimeFranchise, AnimeAiringSchedule, AnimePage, AnimeSearchResult, AnimeBatch, AnimeSeason } from '@consumit/contracts'
import type { AnimeCatalog } from '../catalog/anilist/adapter.ts'
import type { KitsuCatalog } from '../catalog/kitsu/kitsu.ts'
import { AnimeError } from './errors.ts'
import { matchesAnimeTitle } from './tmdb-episode-art.ts'
import type { TmdbEpisodeArtResolver } from './tmdb-episode-art.ts'
import type { CanonicalEpisodeArt, CanonicalEpisodeMetadata } from './anizip-episode-art.ts'

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
  /** Canonical episode metadata by AniList id, with strict TMDB and
   *  MAL-keyed Kitsu fallbacks. Null art stays null for the UI fallback. */
  episode(anilistId: number, episode: number): Promise<AnimeEpisode>
}

export function createAnimeService(
  catalog: AnimeCatalog,
  deps: {
    episodeArt?: KitsuCatalog | undefined
    tmdbEpisodeArt?: TmdbEpisodeArtResolver | undefined
    canonicalEpisodeArt?: CanonicalEpisodeArt | undefined
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
          // AniList splits seasons into titles while TMDB often keeps one
          // series. Follow canonical prequels for logo artwork only; episode
          // mapping stays on its strict, independent matching path.
          if (['TV', 'TV_SHORT', 'ONA'].includes(detail.format)) {
            const visited = new Set([anilistId])
            let current = anilistId
            for (let depth = 0; depth < 4; depth++) {
              const franchise = await catalog.relations(current)
              const previous = franchise.relations.find(relation => relation.type === 'PREQUEL' && !visited.has(relation.anime.anilistId))?.anime
              if (!previous) break
              current = previous.anilistId
              visited.add(current)
              if (!['TV', 'TV_SHORT', 'ONA'].includes(previous.format)) continue
              const inherited = await deps.tmdbEpisodeArt.titleLogo(current, previous.titles, previous.seasonYear)
              if (inherited?.logoUrl) return { ...detail, logoUrl: inherited.logoUrl }
            }
          }
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
      if (!deps.episodeArt && !deps.tmdbEpisodeArt && !deps.canonicalEpisodeArt) throw new AnimeError('ANILIST_UNAVAILABLE', 'Episode artwork is not configured on this server.')
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
      let canonical: CanonicalEpisodeMetadata | null = null
      if (deps.canonicalEpisodeArt) {
        try {
          canonical = await deps.canonicalEpisodeArt.episodeByAnilistId(anilistId, episode)
        } catch {
          // Independent metadata fallbacks remain available during outages.
        }
      }
      if (canonical?.stillUrl && canonical.title) return toEpisode(canonical)
      // TMDB and Kitsu fill missing fields; they never determine canonical
      // anime identity from a parent logo or an unverified season guess.
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
      if (deps.episodeArt && detail.malId && ((!canonical?.stillUrl && !tmdb?.stillUrl) || (!canonical?.title && !tmdb?.title))) {
        try {
          const art = await deps.episodeArt.episodeByMalId(detail.malId, episode)
          if (art && usable(art)) kitsu = art
        } catch {
          // A failed fallback must not discard already-known episode fields.
        }
      }
      if (canonical && usable(canonical)) return toEpisode({
        title: canonical.title || tmdb?.title || kitsu?.title || null,
        synopsis: canonical.synopsis || tmdb?.overview || kitsu?.synopsis || null,
        stillUrl: canonical.stillUrl || tmdb?.stillUrl || kitsu?.stillUrl || null,
        airDate: canonical.airDate || tmdb?.airDate || kitsu?.airDate || null,
      })
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
