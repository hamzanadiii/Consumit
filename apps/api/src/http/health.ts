import type { FastifyInstance } from 'fastify'

export type HealthState = {
  catalogConfigured: boolean
  identityConfigured: boolean
}

const noLimit = { config: { rateLimit: false } }

/**
 * Liveness answers "is this process serving?" and never checks dependencies.
 * Readiness answers "can this process take traffic?" with a dependency
 * summary and HTTP 503 when a required capability lacks configuration.
 * `/health` stays as the historic liveness alias. Live dependency probes
 * belong on the future internal endpoint; these flags report configuration.
 */
export function registerHealthRoutes(app: FastifyInstance, state: HealthState) {
  const live = async () => ({ status: 'ok' as const })
  const ready = async (): Promise<{ dependencies: Record<string, 'ok' | 'unavailable'>; status: 'ok' | 'degraded' }> => {
    const dependencies = {
      catalog: state.catalogConfigured ? 'ok' as const : 'unavailable' as const,
      identity: state.identityConfigured ? 'ok' as const : 'unavailable' as const,
    }
    const healthy = Object.values(dependencies).every((value) => value === 'ok')
    if (!healthy) {
      app.log.warn({ dependencies }, 'readiness degraded')
    }
    return { dependencies, status: healthy ? 'ok' : 'degraded' }
  }

  app.get('/health', noLimit, live)
  app.get('/health/live', noLimit, live)
  app.get('/health/ready', noLimit, async (request, reply) => {
    const result = await ready()
    if (result.status === 'degraded') reply.code(503)
    return result
  })
}
