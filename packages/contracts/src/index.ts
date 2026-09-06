import { z } from 'zod'

export const catalogKindSchema = z.enum(['movie', 'series'])
export type CatalogKind = z.infer<typeof catalogKindSchema>

export const catalogFeedSchema = z.enum([
  'trending',
  'popular',
  'top-rated',
  'now-playing',
  'on-air',
])
export type CatalogFeed = z.infer<typeof catalogFeedSchema>

export const catalogRefSchema = z.object({
  id: z.int().positive(),
  kind: catalogKindSchema,
})
export type CatalogRef = z.infer<typeof catalogRefSchema>

export const catalogResponseMetaSchema = z.object({
  fetchedAt: z.iso.datetime(),
  language: z.string().min(2),
  region: z.string().length(2),
  source: z.literal('tmdb'),
  stale: z.boolean(),
})
export type CatalogResponseMeta = z.infer<typeof catalogResponseMetaSchema>

export const catalogTitleSummarySchema = catalogRefSchema.extend({
  backdropUrl: z.url().nullable(),
  genreNames: z.array(z.string()),
  originalTitle: z.string().min(1),
  overview: z.string(),
  popularity: z.number().nonnegative(),
  posterUrl: z.url().nullable(),
  releaseDate: z.string().nullable(),
  title: z.string().min(1),
  tmdbRating: z.number().min(0).max(10).nullable(),
  tmdbVoteCount: z.int().nonnegative(),
  year: z.int().min(1870).max(2200).nullable(),
})
export type CatalogTitleSummary = z.infer<typeof catalogTitleSummarySchema>

export const catalogPersonSchema = z.object({
  character: z.string().nullable(),
  id: z.int().positive(),
  name: z.string().min(1),
  profileUrl: z.url().nullable(),
  role: z.string().nullable(),
})
export type CatalogPerson = z.infer<typeof catalogPersonSchema>

export const catalogSeasonSummarySchema = z.object({
  airDate: z.string().nullable(),
  episodeCount: z.int().nonnegative(),
  name: z.string().min(1),
  number: z.int().positive(),
  posterUrl: z.url().nullable(),
})
export type CatalogSeasonSummary = z.infer<typeof catalogSeasonSummarySchema>

const catalogDetailBaseSchema = catalogTitleSummarySchema.extend({
  cast: z.array(catalogPersonSchema),
  certification: z.string().nullable(),
  countries: z.array(z.string()),
  creators: z.array(catalogPersonSchema),
  homepageUrl: z.url().nullable(),
  languages: z.array(z.string()),
  recommendations: z.array(catalogTitleSummarySchema),
  status: z.string().nullable(),
  tagline: z.string().nullable(),
})

export const catalogMovieDetailSchema = catalogDetailBaseSchema.extend({
  kind: z.literal('movie'),
  runtimeMinutes: z.int().positive().nullable(),
})
export type CatalogMovieDetail = z.infer<typeof catalogMovieDetailSchema>

export const catalogSeriesDetailSchema = catalogDetailBaseSchema.extend({
  contentRating: z.string().nullable(),
  episodeRuntimeMinutes: z.int().positive().nullable(),
  kind: z.literal('series'),
  seasons: z.array(catalogSeasonSummarySchema),
})
export type CatalogSeriesDetail = z.infer<typeof catalogSeriesDetailSchema>

export const catalogTitleDetailSchema = z.discriminatedUnion('kind', [
  catalogMovieDetailSchema,
  catalogSeriesDetailSchema,
])
export type CatalogTitleDetail = z.infer<typeof catalogTitleDetailSchema>

export const catalogEpisodeSchema = z.object({
  airDate: z.string().nullable(),
  episodeNumber: z.int().positive(),
  id: z.int().positive(),
  overview: z.string(),
  runtimeMinutes: z.int().positive().nullable(),
  seasonNumber: z.int().positive(),
  stillUrl: z.url().nullable(),
  title: z.string().min(1),
})
export type CatalogEpisode = z.infer<typeof catalogEpisodeSchema>

export const catalogSeasonSchema = z.object({
  episodes: z.array(catalogEpisodeSchema),
  name: z.string().min(1),
  overview: z.string(),
  posterUrl: z.url().nullable(),
  seasonNumber: z.int().positive(),
  seriesId: z.int().positive(),
})
export type CatalogSeason = z.infer<typeof catalogSeasonSchema>

export const catalogPageSchema = z.object({
  items: z.array(catalogTitleSummarySchema),
  meta: catalogResponseMetaSchema,
  page: z.int().positive(),
  totalPages: z.int().nonnegative(),
  totalResults: z.int().nonnegative(),
})
export type CatalogPage = z.infer<typeof catalogPageSchema>

export const catalogBatchSchema = z.object({
  items: z.array(catalogTitleSummarySchema),
  meta: catalogResponseMetaSchema,
  missing: z.array(catalogRefSchema),
})
export type CatalogBatch = z.infer<typeof catalogBatchSchema>

export const catalogTitleResponseSchema = z.object({
  item: catalogTitleDetailSchema,
  meta: catalogResponseMetaSchema,
})
export type CatalogTitleResponse = z.infer<typeof catalogTitleResponseSchema>

export const catalogSeasonResponseSchema = z.object({
  item: catalogSeasonSchema,
  meta: catalogResponseMetaSchema,
})
export type CatalogSeasonResponse = z.infer<typeof catalogSeasonResponseSchema>

export const catalogErrorCodeSchema = z.enum([
  'CATALOG_INVALID_QUERY',
  'CATALOG_NOT_CONFIGURED',
  'CATALOG_NOT_FOUND',
  'CATALOG_UNAVAILABLE',
])
export type CatalogErrorCode = z.infer<typeof catalogErrorCodeSchema>

export const catalogErrorResponseSchema = z.object({
  error: z.object({
    code: catalogErrorCodeSchema,
    message: z.string().min(1),
    retryable: z.boolean(),
  }),
})
export type CatalogErrorResponse = z.infer<typeof catalogErrorResponseSchema>

export function titleHref(title: CatalogRef) {
  return title.kind === 'movie' ? `/title/${title.id}` : `/series/${title.id}`
}

export function watchHref(title: CatalogRef, episode?: { episode: number; season: number }) {
  if (title.kind === 'movie') return `/watch/movie/${title.id}`

  return `/watch/series/${title.id}?season=${episode?.season ?? 1}&episode=${episode?.episode ?? 1}`
}
