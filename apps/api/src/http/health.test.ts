import { afterEach, describe, expect, it, vi } from 'vitest'
import Fastify from 'fastify'
import { registerHealthRoutes } from './health.ts'

import { buildApp } from '../app.ts'
import { loadEnv } from '../config/env.ts'
import { createFakeCatalog } from '../catalog/fake-catalog.ts'
import { createFakeIdentity } from '../identity/fake-identity.ts'
import { unavailableIdentity } from '../identity/unavailable-identity.ts'

const openApps: Awaited<ReturnType<typeof buildApp>>[] = []
const env = loadEnv({ NODE_ENV: 'test' })

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()))
})

describe('health endpoints', () => {
  it('degrades when a local dependency fails without leaking its error', async () => {
    const app = Fastify()
    openApps.push(app)
    registerHealthRoutes(app, { catalogConfigured: true, identityConfigured: true, probes: { database: async () => { throw new Error('secret database URL') }, rateLimits: async () => 'PONG' } })
    const response = await app.inject('/health/ready')
    expect(response.statusCode).toBe(503)
    expect(response.json().dependencies).toEqual({ catalog: 'ok', identity: 'ok', database: 'unavailable', rateLimits: 'ok' })
    expect(response.body).not.toContain('secret')
    expect((await app.inject('/health/live')).statusCode).toBe(200)
  })
  it('shares pending probes across concurrent health checks and caches the result', async () => {
    const app = Fastify()
    openApps.push(app)
    let finish!: () => void
    const probe = vi.fn(() => new Promise<void>((resolve) => { finish = resolve }))
    registerHealthRoutes(app, { catalogConfigured: true, identityConfigured: true, probes: { database: probe } })
    const first = app.inject('/health/ready')
    const second = app.inject('/health/ready')
    const results = Promise.all([first, second])
    await vi.waitFor(() => expect(probe).toHaveBeenCalledOnce())
    finish()
    expect((await results).map((response) => response.statusCode)).toEqual([200, 200])
    expect((await app.inject('/health/ready')).statusCode).toBe(200)
    expect(probe).toHaveBeenCalledOnce()
  })
  it('bounds a stalled dependency probe instead of hanging readiness', async () => {
    const app = Fastify()
    openApps.push(app)
    registerHealthRoutes(app, { catalogConfigured: true, identityConfigured: true, probes: { database: () => new Promise(() => {}) } })
    const response = await app.inject('/health/ready')
    expect(response.statusCode).toBe(503)
    expect(response.json().dependencies.database).toBe('unavailable')
  })
  it('reports liveness without checking dependencies', async () => {
    const app = await buildApp({ env })
    openApps.push(app)

    const response = await app.inject({ method: 'GET', url: '/health/live' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'ok' })
  })

  it('reports degraded readiness when catalog has no adapter', async () => {
    const app = await buildApp({ env, identity: unavailableIdentity })
    openApps.push(app)

    const response = await app.inject({ method: 'GET', url: '/health/ready' })

    expect(response.statusCode).toBe(503)
    expect(response.json()).toEqual({ dependencies: { catalog: 'unavailable', identity: 'unavailable' }, status: 'degraded' })
  })

  it('reports ready when catalog is configured', async () => {
    const app = await buildApp({ env, catalog: createFakeCatalog(), identity: createFakeIdentity() })
    openApps.push(app)

    const response = await app.inject({ method: 'GET', url: '/health/ready' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ dependencies: { catalog: 'ok', identity: 'ok' }, status: 'ok' })
  })
})
