import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import Fastify from 'fastify'

const localWebOrigin = 'http://localhost:3000'

export function buildApp() {
  const app = Fastify({
    logger: process.env.NODE_ENV !== 'test',
  })

  void app.register(helmet)
  void app.register(cors, {
    origin: process.env.WEB_ORIGIN ?? localWebOrigin,
  })
  void app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  })

  app.get(
    '/health',
    {
      config: {
        rateLimit: false,
      },
    },
    async () => ({ status: 'ok' as const }),
  )

  return app
}
