import { afterEach, describe, expect, it } from 'vitest'
import { buildApp } from '../app.ts'

const apps: Awaited<ReturnType<typeof buildApp>>[] = []
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())) })

describe('anonymous Web Vitals intake', () => {
  it('accepts a bounded batch for aggregate metrics', async () => {
    const app = await buildApp()
    apps.push(app)
    const response = await app.inject({
      method: 'POST', url: '/v1/telemetry/web-vitals',
      payload: { events: [
        { metric: 'LCP', page: 'title', value: 1800 },
        { metric: 'CLS', page: 'home', value: 0.08 },
      ] },
    })
    expect(response.statusCode).toBe(202)
    expect(response.json()).toEqual({ accepted: 2 })
    expect(response.headers['cache-control']).toBe('no-store')
  })

  it('rejects unexpected fields without storing an event', async () => {
    const app = await buildApp()
    apps.push(app)
    const response = await app.inject({
      method: 'POST', url: '/v1/telemetry/web-vitals',
      payload: { events: [{ metric: 'LCP', page: 'title', value: 800, url: '/person/private-profile' }] },
    })
    expect(response.statusCode).toBe(400)
  })
})
