import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  animeAiringScheduleSchema,
  animeBatchSchema,
  animeEpisodeSchema,
  animeFranchiseSchema,
  animeMatchSchema,
  animePageSchema,
  animeSearchResultSchema,
  animeTitleDetailSchema,
} from '@consumit/contracts'
import type { ZodType } from 'zod'

import { ApiError } from '../http/errors.ts'
import type { AnimeService } from './anime-service.ts'
import { AnimeError } from './errors.ts'

type AnimeRoutesDeps = {
  anime: AnimeService
}

const pageSchema = z.coerce.number().int().min(1).max(500).optional().default(1)
const idParamsSchema = z.object({ anilistId: z.coerce.number().int().positive() })
const episodeParamsSchema = z.object({
  anilistId: z.coerce.number().int().positive(),
  episode: z.coerce.number().int().min(1).max(10000),
})
const searchQuerySchema = z.object({
  q: z.string().trim().min(2).max(100),
  page: pageSchema,
})
const seasonalParamsSchema = z.object({
  season: z.enum(['WINTER', 'SPRING', 'SUMMER', 'FALL']),
  year: z.coerce.number().int().min(1917).max(2200),
})
const seasonalQuerySchema = z.object({ page: pageSchema })
const batchQuerySchema = z.object({ ids: z.string().trim().min(1).max(600) })

function invalidQuery(message: string): never {
  throw new ApiError('BAD_REQUEST', message)
}

function sendAnimeError(error: unknown): never {
  if (error instanceof AnimeError || error instanceof ApiError) throw error
  throw new AnimeError('ANILIST_UNAVAILABLE', 'Anime metadata is temporarily unavailable.', {
    cause: error,
    retryable: true,
  })
}

function proveResponse<T>(schema: ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new ApiError('INTERNAL', 'The anime catalog returned an invalid response.')
  return parsed.data
}

export function registerAnimeRoutes(app: FastifyInstance, deps: AnimeRoutesDeps) {
  const { anime } = deps

  app.get('/v1/anime/search', async (request, reply) => {
    const parsed = searchQuerySchema.safeParse(request.query)
    if (!parsed.success) return invalidQuery('Use a search query between 2 and 100 characters and a page between 1 and 500.')
    try {
      return reply.send(proveResponse(animeSearchResultSchema, await anime.search(parsed.data.q, parsed.data.page)))
    } catch (error) {
      return sendAnimeError(error)
    }
  })

  app.get('/v1/anime/trending', async (request, reply) => {
    const parsed = z.object({ page: pageSchema }).safeParse(request.query)
    if (!parsed.success) return invalidQuery('Use a page between 1 and 500.')
    try {
      return reply.send(proveResponse(animePageSchema, await anime.trending(parsed.data.page)))
    } catch (error) {
      return sendAnimeError(error)
    }
  })

  app.get('/v1/anime/seasonal/:season/:year', async (request, reply) => {
    const params = seasonalParamsSchema.safeParse(request.params)
    const query = seasonalQuerySchema.safeParse(request.query)
    if (!params.success || !query.success) return invalidQuery('Use a valid season, year, and page between 1 and 500.')
    try {
      return reply.send(proveResponse(animePageSchema, await anime.seasonal(params.data.season, params.data.year, query.data.page)))
    } catch (error) {
      return sendAnimeError(error)
    }
  })

  app.get('/v1/anime/:anilistId', async (request, reply) => {
    const params = idParamsSchema.safeParse(request.params)
    if (!params.success) return invalidQuery('Use a positive whole AniList ID.')
    try {
      return reply.send(proveResponse(animeTitleDetailSchema, await anime.title(params.data.anilistId)))
    } catch (error) {
      return sendAnimeError(error)
    }
  })

  app.get('/v1/anime/:anilistId/episodes/:episode', async (request, reply) => {
    const params = episodeParamsSchema.safeParse(request.params)
    if (!params.success) return invalidQuery('Use a positive whole AniList ID and an episode between 1 and 10000.')
    try {
      return reply.send(proveResponse(animeEpisodeSchema, await anime.episode(params.data.anilistId, params.data.episode)))
    } catch (error) {
      return sendAnimeError(error)
    }
  })

  app.get('/v1/anime/match', async (request, reply) => {
    const parsed = z.object({
      title: z.string().trim().min(1).max(200),
      originalTitle: z.string().trim().min(1).max(200).optional(),
      year: z.coerce.number().int().min(1917).max(2200).optional(),
    }).safeParse(request.query)
    if (!parsed.success) return invalidQuery('Provide a title with an optional original title and year.')
    try {
      const anilistId = await anime.matchTmdbTitle(parsed.data.title, parsed.data.originalTitle ?? null, parsed.data.year ?? null)
      if (!anilistId) throw new AnimeError('ANIME_NOT_FOUND', 'No anime entry matches this title.')
      return reply.send(proveResponse(animeMatchSchema, { anilistId }))
    } catch (error) {
      return sendAnimeError(error)
    }
  })

  app.get('/v1/anime/:anilistId/relations', async (request, reply) => {
    const params = idParamsSchema.safeParse(request.params)
    if (!params.success) return invalidQuery('Use a positive whole AniList ID.')
    try {
      return reply.send(proveResponse(animeFranchiseSchema, await anime.franchise(params.data.anilistId)))
    } catch (error) {
      return sendAnimeError(error)
    }
  })

  app.get('/v1/anime/:anilistId/airing', async (request, reply) => {
    const params = idParamsSchema.safeParse(request.params)
    if (!params.success) return invalidQuery('Use a positive whole AniList ID.')
    try {
      return reply.send(proveResponse(animeAiringScheduleSchema, await anime.airingSchedule(params.data.anilistId)))
    } catch (error) {
      return sendAnimeError(error)
    }
  })

  app.get('/v1/anime/batch', async (request, reply) => {
    const parsed = batchQuerySchema.safeParse(request.query)
    if (!parsed.success) return invalidQuery('Provide up to 50 positive whole AniList IDs.')
    const parsedIds = parsed.data.ids.split(',').map(Number)
    if (!parsedIds.length || parsedIds.some((value) => !Number.isSafeInteger(value) || value <= 0)) return invalidQuery('Provide up to 50 positive whole AniList IDs.')
    const anilistIds = [...new Set(parsedIds)]
    if (anilistIds.length > 50) return invalidQuery('Provide up to 50 positive whole AniList IDs.')
    try {
      return reply.send(proveResponse(animeBatchSchema, await anime.batch(anilistIds)))
    } catch (error) {
      return sendAnimeError(error)
    }
  })
}
