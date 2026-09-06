import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import Fastify from 'fastify'

import type { Catalog } from './catalog/catalog.ts'
import { registerCatalogRoutes } from './catalog/routes.ts'
import { unavailableCatalogAdapter } from './catalog/unavailable-catalog.ts'

const localWebOrigin = 'http://localhost:3000'

export function buildApp({ catalog = unavailableCatalogAdapter }: { catalog?: Catalog } = {}) {
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

  registerCatalogRoutes(app, catalog)

  return app
}
