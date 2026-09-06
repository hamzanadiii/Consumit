import type { FastifyInstance } from 'fastify'

export type HealthState = {
  catalogConfigured: boolean
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
  const ready = async () => (
    state.catalogConfigured
      ? { dependencies: { catalog: 'ok' as const }, status: 'ok' as const }
      : { dependencies: { catalog: 'unavailable' as const }, status: 'degraded' as const }
  )

  app.get('/health', noLimit, live)
  app.get('/health/live', noLimit, live)
  app.get('/health/ready', noLimit, ready)
}
