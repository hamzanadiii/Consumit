import { playbackRefSchema, playbackSkipTimesResponseSchema } from '@consumit/contracts'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { ApiError } from '../http/errors.ts'
import type { SkipTimes } from './skip-times.ts'

const querySchema = z.object({ kind: z.enum(['movie', 'series', 'anime']), id: z.coerce.number().int().positive(), season: z.coerce.number().int().min(0).optional(), episode: z.coerce.number().int().positive().optional(), duration: z.coerce.number().finite().min(30).max(86400) })

export function registerSkipTimesRoutes(app: FastifyInstance, skipTimes: SkipTimes) {
  app.get('/v1/playback/skip-times', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request, reply) => {
    const query = querySchema.safeParse(request.query)
    if (!query.success) throw new ApiError('BAD_REQUEST', 'Use an exact title or episode and a valid duration.')
    const { duration, ...input } = query.data
    const ref = playbackRefSchema.safeParse(input)
    if (!ref.success) throw new ApiError('BAD_REQUEST', 'Use an exact title or episode.')
    const result = playbackSkipTimesResponseSchema.parse({ segments: await skipTimes.read(ref.data, duration) })
    return reply.header('cache-control', 'public, max-age=60').send(result)
  })
}
