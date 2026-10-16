import type { AnimeTitleSummary, CatalogTitleSummary } from '@consumit/contracts'

/**
 * AniList summaries in the catalog display shape so batch consumers
 * (library, profile, lists) resolve anime refs beside movies and series.
 * TMDB-only fields AniList cannot answer stay honestly null; AniList has no
 * release date, so `releaseDate` never gets invented from the season year.
 */
export function animeToCatalogSummary(anime: AnimeTitleSummary): CatalogTitleSummary {
  return {
    backdropUrl: anime.bannerImage,
    genreNames: anime.genres,
    id: anime.anilistId,
    kind: 'anime',
    logoUrl: null,
    originalTitle: anime.titles.native ?? anime.titles.romaji ?? anime.titles.english ?? anime.titles.preferred,
    overview: anime.description,
    popularity: anime.popularity,
    posterUrl: anime.coverImage.url,
    releaseDate: null,
    title: anime.titles.preferred,
    tmdbRating: anime.averageScore === null ? null : anime.averageScore / 10,
    tmdbVoteCount: anime.popularity,
    year: anime.seasonYear,
  }
}
