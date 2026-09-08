import {
  catalogFeedSchema,
  catalogKindSchema,
  catalogPageSchema,
  catalogRefSchema,
  type CatalogPage,
} from '@consumit/contracts'
import type { FastifyInstance, FastifyReply } from 'fastify'
import { z } from 'zod'

import type { Catalog } from './catalog.ts'
import { CatalogError } from './errors.ts'
import { ApiError } from '../http/errors.ts'

const pageSchema = z.coerce.number().int().min(1).max(500).optional().default(1)
const queryKindSchema = z.enum(['all', ...catalogKindSchema.options]).optional().default('all')

const discoverQuerySchema = z.object({
  feed: catalogFeedSchema.optional().default('trending'),
  kind: queryKindSchema,
  page: pageSchema,
  genre: z.string().trim().min(1).max(60).optional(),
  year: z.coerce.number().int().min(1870).max(2200).optional(),
}).refine((query) => !(query.genre || query.year) || (query.kind !== 'all' && (query.feed === 'popular' || query.feed === 'top-rated')), {
  message: 'Genre and year filters require movies or series sorted by popular or top-rated.',
})

const searchQuerySchema = z.object({
  kind: queryKindSchema,
  page: pageSchema,
  q: z.string().trim().min(2).max(100),
})

const idParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
  kind: catalogKindSchema,
})

const seasonParamsSchema = z.object({
  id: z.coerce.number().int().positive(),
  season: z.coerce.number().int().positive(),
})

const batchQuerySchema = z.object({
  refs: z.string().trim().min(1),
})

function invalidQuery(message: string): never {
  throw new CatalogError('CATALOG_INVALID_QUERY', message)
}

function sendCatalogError(error: unknown): never {
  if (error instanceof CatalogError) throw error
  throw new CatalogError('CATALOG_UNAVAILABLE', 'The catalog is temporarily unavailable.', {
      cause: error,
      retryable: true,
      statusCode: 503,
    })
}

function cacheHeaders(reply: FastifyReply, stale: boolean) {
  reply.header('cache-control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=3600')
  reply.header('x-catalog-stale', stale ? '1' : '0')
}

export function registerCatalogRoutes(app: FastifyInstance, catalog: Catalog) {
  app.get('/v1/titles/discover', async (request, reply) => {
    const parsed = discoverQuerySchema.safeParse(request.query)
    if (!parsed.success) return invalidQuery('Use a valid kind, feed, and page between 1 and 500.')

    let result: CatalogPage
    try {
      result = await catalog.discover(parsed.data)
    } catch (error) {
      return sendCatalogError(error)
    }
    // Adapter output is untrusted: prove the response contract before
    // sending. A breach is a server bug, so it becomes a safe 500 through
    // the global handler — never a leak, never a misleading 503.
    const proven = catalogPageSchema.safeParse(result)
    if (!proven.success) {
      request.log.error({ err: proven.error }, 'catalog adapter broke the discover contract')
      throw new ApiError('INTERNAL', 'Internal server error.')
    }
    cacheHeaders(reply, proven.data.meta.stale)
    return proven.data
  })

  app.get('/v1/titles/search', async (request, reply) => {
    const parsed = searchQuerySchema.safeParse(request.query)
    if (!parsed.success) return invalidQuery('Search queries must contain 2 to 100 characters.')

    try {
      const result = await catalog.search({
        kind: parsed.data.kind,
        page: parsed.data.page,
        query: parsed.data.q,
      })
      cacheHeaders(reply, result.meta.stale)
      return result
    } catch (error) {
      return sendCatalogError(error)
    }
  })

  app.get('/v1/titles/batch', async (request, reply) => {
    const query = batchQuerySchema.safeParse(request.query)
    if (!query.success) return invalidQuery('Provide one or more catalog references.')

    const rawRefs = query.data.refs.split(',').map((value) => value.trim()).filter(Boolean)
    if (rawRefs.length > 24) return invalidQuery('A batch may contain at most 24 titles.')

    const refs = rawRefs.map((value) => {
      const [kind, id] = value.split(':')
      return catalogRefSchema.safeParse({ id: Number(id), kind })
    })
    if (refs.some((reference) => !reference.success)) {
      return invalidQuery('References must use movie:123 or series:123.')
    }

    const parsedRefs = refs.flatMap((reference) => reference.success ? [reference.data] : [])
    try {
      const result = await catalog.batch(parsedRefs)
      cacheHeaders(reply, result.meta.stale)
      return result
    } catch (error) {
      return sendCatalogError(error)
    }
  })

  app.get('/v1/titles/series/:id/seasons/:season', async (request, reply) => {
    const parsed = seasonParamsSchema.safeParse(request.params)
    if (!parsed.success) return invalidQuery('Series and season identifiers must be positive numbers.')

    try {
      const result = await catalog.season(parsed.data.id, parsed.data.season)
      cacheHeaders(reply, result.meta.stale)
      return result
    } catch (error) {
      return sendCatalogError(error)
    }
  })

  app.get('/v1/titles/:kind/:id', async (request, reply) => {
    const parsed = idParamsSchema.safeParse(request.params)
    if (!parsed.success) return invalidQuery('Use movie or series with a positive numeric identifier.')

    try {
      const result = await catalog.title(parsed.data.kind, parsed.data.id)
      cacheHeaders(reply, result.meta.stale)
      return result
    } catch (error) {
      return sendCatalogError(error)
    }
  })
}
