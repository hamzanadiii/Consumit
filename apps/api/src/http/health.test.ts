import { afterEach, describe, expect, it } from 'vitest'

import { buildApp } from '../app.ts'
import { createFakeCatalog } from '../catalog/fake-catalog.ts'

const openApps: Awaited<ReturnType<typeof buildApp>>[] = []

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()))
})

describe('health endpoints', () => {
  it('reports liveness without checking dependencies', async () => {
    const app = await buildApp()
    openApps.push(app)

    const response = await app.inject({ method: 'GET', url: '/health/live' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'ok' })
  })

  it('reports degraded readiness when catalog has no adapter', async () => {
    const app = await buildApp()
    openApps.push(app)

    const response = await app.inject({ method: 'GET', url: '/health/ready' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ dependencies: { catalog: 'unavailable' }, status: 'degraded' })
  })

  it('reports ready when catalog is configured', async () => {
    const app = await buildApp({ catalog: createFakeCatalog() })
    openApps.push(app)

    const response = await app.inject({ method: 'GET', url: '/health/ready' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ dependencies: { catalog: 'ok' }, status: 'ok' })
  })
})
