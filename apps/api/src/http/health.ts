import type { FastifyInstance } from 'fastify'

export type HealthState = {
  catalogConfigured: boolean
  identityConfigured: boolean
  probes?: Record<string, () => Promise<unknown>>
}

const noLimit = { config: { rateLimit: false } }

/**
 * Liveness answers "is this process serving?" and never checks dependencies.
 * Readiness answers "can this process take traffic?" with a dependency
 * summary and HTTP 503 when required configuration or a local dependency
 * is unavailable. `/health` stays as the historic liveness alias. Probes
 * are bounded, single-flight, and cached briefly to avoid health-check load.
 */
export function registerHealthRoutes(app: FastifyInstance, state: HealthState) {
  const live = async () => ({ status: 'ok' as const })
  type Readiness = { dependencies: Record<string, 'ok' | 'unavailable'>; status: 'ok' | 'degraded' }
  const check = async (): Promise<Readiness> => {
    const dependencies: Readiness['dependencies'] = {
      catalog: state.catalogConfigured ? 'ok' as const : 'unavailable' as const,
      identity: state.identityConfigured ? 'ok' as const : 'unavailable' as const,
    }
    await Promise.all(Object.entries(state.probes ?? {}).map(async ([name, probe]) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        const result = await Promise.race([
          Promise.resolve().then(probe),
          new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Readiness deadline exceeded')), 2000) }),
        ])
        dependencies[name] = result === false ? 'unavailable' : 'ok'
      } catch { dependencies[name] = 'unavailable' }
      finally { clearTimeout(timer) }
    }))
    const healthy = Object.values(dependencies).every((value) => value === 'ok')
    if (!healthy) {
      app.log.warn({ dependencies }, 'readiness degraded')
    }
    return { dependencies, status: healthy ? 'ok' : 'degraded' }
  }
  let pending: Promise<Readiness> | undefined
  let cached: Readiness | undefined
  let expiresAt = 0
  const ready = () => {
    if (pending) return pending
    if (cached && Date.now() < expiresAt) return Promise.resolve(cached)
    pending = check().then((result) => { cached = result; expiresAt = Date.now() + 1000; return result })
      .finally(() => { pending = undefined })
    return pending
  }

  app.get('/health', noLimit, live)
  app.get('/health/live', noLimit, live)
  app.get('/health/ready', noLimit, async (request, reply) => {
    const result = await ready()
    if (result.status === 'degraded') reply.code(503)
    return result
  })
}
