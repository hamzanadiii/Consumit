import { subtitlesResponseSchema } from '@consumit/contracts'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { ApiError } from '../http/errors.ts'
import { SubtitleError } from './errors.ts'
import { cleanQueryLangs, type SubtitleService } from './subtitles.ts'

const querySchema = z.object({
  kind: z.enum(['movie', 'series', 'anime']),
  id: z.coerce.number().int().positive(),
  season: z.coerce.number().int().min(1).max(100).optional().default(1),
  episode: z.coerce.number().int().min(1).max(10000).optional().default(1),
  /** Member's preferred subtitle languages, comma-separated, max 3 in
   *  priority order. Malformed codes are dropped, never rejected. */
  langs: z.string().trim().max(64).optional(),
})

const fileParamsSchema = z.object({ key: z.string().min(1).max(64) })

function invalidQuery(message: string): never {
  throw new ApiError('BAD_REQUEST', message)
}

function sendSubtitleError(error: unknown): never {
  if (error instanceof SubtitleError || error instanceof ApiError) throw error
  throw new SubtitleError('SUBTITLES_UNAVAILABLE', 'Subtitles are temporarily unavailable. Try again.', {
    cause: error,
    retryable: true,
  })
}

export function registerSubtitleRoutes(app: FastifyInstance, deps: { subtitles: SubtitleService }) {
  // Aggregated captions for one title/episode across every subtitle
  // provider plus the member's streaming-provider tracks downstream — the
  // menu never depends on which streaming provider is selected.
  app.get('/v1/subtitles', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
    const parsed = querySchema.safeParse(request.query)
    if (!parsed.success) return invalidQuery('Use a title kind, a positive numeric id, and a valid season/episode.')
    try {
      const controller = new AbortController()
      // Under the 15s server request bound so failures stay clean 503s.
      const timer = setTimeout(() => controller.abort(), 14_000)
      try {
        const subtitles = await deps.subtitles.search(
          { kind: parsed.data.kind, id: parsed.data.id, season: parsed.data.season, episode: parsed.data.episode },
          controller.signal,
          cleanQueryLangs(parsed.data.langs),
        )
        reply.header('cache-control', 'public, max-age=300, s-maxage=900')
        return subtitlesResponseSchema.parse({ subtitles })
      } finally {
        clearTimeout(timer)
      }
    } catch (error) {
      return sendSubtitleError(error)
    }
  })

  // First-party converted VTT bytes. Same-origin, immutable, long-lived:
  // the player treats these exactly like any cached media-adjacent file.
  app.get('/v1/subtitles/file/:key', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    const parsed = fileParamsSchema.safeParse(request.params)
    if (!parsed.success || !/^[0-9a-f]{16}$/.test(parsed.data.key)) return invalidQuery('Use a valid subtitle file key.')
    const vtt = await deps.subtitles.file(parsed.data.key)
    if (!vtt) throw new SubtitleError('SUBTITLES_NOT_FOUND', 'This subtitle file expired. Search subtitles again.')
    reply.header('content-type', 'text/vtt; charset=utf-8')
    reply.header('cache-control', 'public, max-age=604800, immutable')
    return vtt
  })
}
