import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import Fastify from 'fastify'

import type { Catalog } from './catalog/catalog.ts'
import { registerCatalogRoutes } from './catalog/routes.ts'
import { unavailableCatalogAdapter } from './catalog/unavailable-catalog.ts'
import { loadEnv, type ApiEnv } from './config/env.ts'
import { rateLimitExceeded, registerErrorHandlers } from './http/errors.ts'
import { registerHealthRoutes } from './http/health.ts'
import { generateRequestId, loggerOptions, registerRequestContext } from './http/request-context.ts'

export async function buildApp({ catalog = unavailableCatalogAdapter, env = loadEnv() }: { catalog?: Catalog; env?: ApiEnv } = {}) {
  const app = Fastify({
    // 1 MB JSON ceiling: normal endpoints never need more; uploads get
    // dedicated routes with explicit limits when they arrive.
    bodyLimit: 1_048_576,
    genReqId: generateRequestId,
    logger: env.nodeEnv !== 'test' ? loggerOptions() : false,
    // Single-instance default: never trust X-Forwarded-* from the open
    // internet. Behind Cloudflare/LB, set explicit trusted ranges instead.
    trustProxy: false,
  })

  // Plugin registration is awaited: fire-and-forget register() leaves hooks
  // such as the global rate limiter detached from subsequently defined routes.
  await app.register(helmet)
  await app.register(cors, {
    origin: [env.webOrigin, ...env.additionalOrigins],
  })
  await app.register(rateLimit, {
    errorResponseBuilder: () => rateLimitExceeded(),
    max: 100,
    timeWindow: '1 minute',
  })

  registerErrorHandlers(app)
  registerRequestContext(app)
  registerHealthRoutes(app, { catalogConfigured: catalog !== unavailableCatalogAdapter })

  registerCatalogRoutes(app, catalog)

  return app
}
