import { z } from 'zod'
import { createAnilistRateLimiter, type AnilistRateLimiter } from './rate-limit.ts'
import { createAnilistCache, cacheTTLs, type AnilistCache } from './cache.ts'

export type AnilistClient = {
  query<T>(query: string, variables?: Record<string, unknown>, cacheKey?: string, ttlCategory?: string): Promise<T>
  cache: AnilistCache
}

const GRAPHQL_ENDPOINT = 'https://graphql.anilist.co'
const USER_AGENT = 'Consumit/1.0 (anime metadata adapter)'

const errorResponseSchema = z.object({
  message: z.string(),
  status: z.int(),
  locations: z.array(z.object({ line: z.int(), column: z.int() })).optional(),
})

export class AnilistClientError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message)
    this.name = 'AnilistClientError'
  }
}

export function createAnilistClient(options: {
  rateLimiter?: AnilistRateLimiter
  cache?: AnilistCache
} = {}): AnilistClient {
  const limiter = options.rateLimiter ?? createAnilistRateLimiter(90)
  const cache = options.cache ?? createAnilistCache()

  const execute = async <T>(query: string, variables?: Record<string, unknown>): Promise<T> => {
    await limiter.acquire()

    let response: Response
    try {
      response = await fetch(GRAPHQL_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'User-Agent': USER_AGENT,
        },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(10_000),
      })
    } catch {
      throw new AnilistClientError('AniList could not be reached.', 503, true)
    }

    if (response.status === 429) {
      const retryAfter = Number(response.headers.get('Retry-After') ?? 60)
      throw new AnilistClientError(`Rate limited, retry after ${retryAfter}s`, 429, true)
    }

    if (!response.ok) {
      throw new AnilistClientError(`AniList HTTP ${response.status}`, response.status, response.status >= 500)
    }

    let body: { data?: T; errors?: unknown[] }
    try {
      body = await response.json() as { data?: T; errors?: unknown[] }
    } catch {
      throw new AnilistClientError('AniList returned an invalid response.', 502, true)
    }

    if (body.errors?.length) {
      const first = errorResponseSchema.safeParse(body.errors[0])
      throw new AnilistClientError(first.success ? first.data.message : 'AniList rejected the request.', 400, false)
    }

    if (!body.data) {
      throw new AnilistClientError('Empty response from AniList', 502, true)
    }

    return body.data
  }

  return {
    async query<T>(query: string, variables?: Record<string, unknown>, cacheKey?: string, ttlCategory?: string): Promise<T> {
      let cached: { data: T; stale: boolean } | null = null
      if (cacheKey) {
        cached = cache.get<T>(cacheKey)
        if (cached && !cached.stale) return cached.data
      }

      let data: T
      try {
        data = await execute<T>(query, variables)
      } catch (error) {
        if (cached?.stale) return cached.data
        throw error
      }

      if (cacheKey && ttlCategory) {
        const ttl = cacheTTLs[ttlCategory] ?? cacheTTLs.details
        if (ttl) cache.set(cacheKey, data, ttl)
      }

      return data
    },
    cache,
  }
}
