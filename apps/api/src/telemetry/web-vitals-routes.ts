import { metrics } from '@opentelemetry/api'
import type { FastifyInstance } from 'fastify'
import { webVitalBatchSchema } from '@consumit/contracts'
import { ApiError } from '../http/errors.ts'

const meter = metrics.getMeter('consumit.web-vitals')
const timing = meter.createHistogram('web.vitals.timing', {
  description: 'Anonymous browser Web Vitals and navigation timings, in milliseconds.',
  unit: 'ms',
})
const cls = meter.createHistogram('web.vitals.cls', {
  description: 'Anonymous browser Cumulative Layout Shift scores.',
  unit: '1',
})

export function registerWebVitalsRoutes(app: FastifyInstance) {
  app.post('/v1/telemetry/web-vitals', {
    bodyLimit: 4096,
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const parsed = webVitalBatchSchema.safeParse(request.body)
    if (!parsed.success) throw new ApiError('BAD_REQUEST', 'Performance measurements were invalid.')

    for (const event of parsed.data.events) {
      const attributes = { metric: event.metric, page: event.page }
      if (event.metric === 'CLS') cls.record(event.value, attributes)
      else timing.record(event.value, attributes)
    }
    return reply.header('cache-control', 'no-store').code(202).send({ accepted: parsed.data.events.length })
  })
}
