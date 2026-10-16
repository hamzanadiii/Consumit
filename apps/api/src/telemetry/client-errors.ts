import { metrics } from '@opentelemetry/api'
import type { FastifyInstance } from 'fastify'
import { ApiError } from '../http/errors.ts'
import { clientErrorBatchSchema } from '@consumit/contracts'
export function registerClientErrors(app: FastifyInstance) {
  const counter = metrics.getMeter('consumit.browser').createCounter('browser.errors')
  app.post('/v1/telemetry/client-errors', { bodyLimit: 4096, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (request, reply) => {
    const parsed = clientErrorBatchSchema.safeParse(request.body)
    if (!parsed.success) throw new ApiError('BAD_REQUEST', 'Use anonymous bounded error categories.')
    for (const event of parsed.data.events) counter.add(1, event)
    return reply.header('cache-control', 'private, no-store').code(202).send({ accepted: parsed.data.events.length })
  })
}
