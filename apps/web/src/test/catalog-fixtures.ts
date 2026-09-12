import type { CatalogMovieDetail, CatalogSeriesDetail, CatalogTitleSummary } from '@consumit/contracts'

export const movieSummary: CatalogTitleSummary = {
  backdropUrl: 'https://image.tmdb.org/t/p/w1280/dune.jpg',
  genreNames: ['Science Fiction', 'Adventure'],
  id: 693134,
  kind: 'movie',
  logoUrl: null,
  originalTitle: 'Dune: Part Two',
  overview: 'Paul unites with Chani and the Fremen.',
  popularity: 100,
  posterUrl: 'https://image.tmdb.org/t/p/w500/dune.jpg',
  releaseDate: '2024-02-27',
  title: 'Dune: Part Two',
  tmdbRating: 8.2,
  tmdbVoteCount: 7_500,
  year: 2024,
}

export const seriesSummary: CatalogTitleSummary = {
  ...movieSummary,
  id: 95396,
  kind: 'series',
  originalTitle: 'Severance',
  releaseDate: '2022-02-17',
  title: 'Severance',
  year: 2022,
}

export const movieDetail: CatalogMovieDetail = {
  ...movieSummary,
  kind: 'movie',
  cast: [],
  certification: 'PG-13',
  countries: ['United States of America'],
  creators: [],
  homepageUrl: null,
  languages: ['English'],
  recommendations: [movieSummary],
  runtimeMinutes: 166,
  status: 'Released',
  tagline: null,
}

export const seriesDetail: CatalogSeriesDetail = {
  ...seriesSummary,
  kind: 'series',
  cast: [],
  certification: null,
  contentRating: 'TV-MA',
  countries: ['US'],
  creators: [],
  episodeRuntimeMinutes: 50,
  homepageUrl: null,
  languages: ['English'],
  recommendations: [seriesSummary],
  seasons: [{ airDate: '2022-02-17', episodeCount: 9, name: 'Season 1', number: 1, posterUrl: null }, { airDate: '2025-01-17', episodeCount: 10, name: 'Season 2', number: 2, posterUrl: null }],
  status: 'Returning Series',
  tagline: null,
}
