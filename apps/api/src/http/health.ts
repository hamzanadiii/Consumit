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
  const ready = async () => {
    const dependencies = {
      catalog: state.catalogConfigured ? 'ok' as const : 'unavailable' as const,
      identity: state.identityConfigured ? 'ok' as const : 'unavailable' as const,
    }
    return Object.values(dependencies).every((value) => value === 'ok')
      ? { dependencies, status: 'ok' as const }
      : { dependencies, status: 'degraded' as const }
  }

  app.get('/health', noLimit, live)
  app.get('/health/live', noLimit, live)
  app.get('/health/ready', noLimit, ready)
}
