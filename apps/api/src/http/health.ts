import type { FastifyInstance } from 'fastify'

export type HealthState = {
  catalogConfigured: boolean
  identityConfigured: boolean
}

const noLimit = { config: { rateLimit: false } }

/**
 * Liveness answers "is this process serving?" and never checks dependencies.
 * Readiness answers "can this process take traffic?" with a dependency
 * summary but no hard failures for optional parts — load balancers read the
 * `status` field, not just the code. `/health` stays as the historic liveness
 * alias. Per-dependency detail belongs on the future internal endpoint.
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
