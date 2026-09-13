import { animeDetailResponseSchema, animePageSchema } from '@consumit/contracts'
import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'

import type { Anilist } from './anilist.ts'
import { AnilistError } from './errors.ts'
import { ApiError } from '../http/errors.ts'

const pageSchema = z.coerce.number().int().min(1).max(50).optional().default(1)
const searchQuerySchema = z.object({
  q: z.string().trim().min(2).max(100),
  page: pageSchema,
})
const idParamsSchema = z.object({ id: z.coerce.number().int().positive().max(1_000_000_000) })

function invalidQuery(message: string): never {
  throw new AnilistError('CATALOG_INVALID_QUERY', message, { statusCode: 400 })
}

function sendAnilistError(error: unknown): never {
  if (error instanceof AnilistError) throw error
  throw new AnilistError('CATALOG_UNAVAILABLE', 'The anime catalog is temporarily unavailable.', {
    cause: error, retryable: true, statusCode: 503,
  })
}

function cacheHeaders(reply: FastifyReply, stale: boolean) {
  reply.header('cache-control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600')
  reply.header('x-catalog-stale', stale ? '1' : '0')
}

export function registerAnilistRoutes(app: FastifyInstance, anilist: Anilist) {
  app.get('/v1/anime/search', async (request, reply) => {
    const parsed = searchQuerySchema.safeParse(request.query)
    if (!parsed.success) return invalidQuery('Search queries must contain 2 to 100 characters.')

    try {
      const result = await anilist.searchAnime({ query: parsed.data.q, page: parsed.data.page })
      const proven = animePageSchema.safeParse(result)
      if (!proven.success) {
        request.log.error({ err: proven.error }, 'anilist adapter broke the search contract')
        throw new ApiError('INTERNAL', 'Internal server error.')
      }
      cacheHeaders(reply, proven.data.meta.stale)
      return proven.data
    } catch (error) {
      return sendAnilistError(error)
    }
  })

  app.get('/v1/anime/:id', async (request, reply) => {
    const parsed = idParamsSchema.safeParse(request.params)
    if (!parsed.success) return invalidQuery('Anime identifiers must be positive numbers.')

    try {
      const result = await anilist.anime(parsed.data.id)
      const proven = animeDetailResponseSchema.safeParse({
        item: result.item,
        meta: { fetchedAt: result.meta.fetchedAt, source: 'anilist', stale: result.meta.stale },
      })
      if (!proven.success) {
        request.log.error({ err: proven.error }, 'anilist adapter broke the detail contract')
        throw new ApiError('INTERNAL', 'Internal server error.')
      }
      cacheHeaders(reply, proven.data.meta.stale)
      return proven.data
    } catch (error) {
      return sendAnilistError(error)
    }
  })
}
