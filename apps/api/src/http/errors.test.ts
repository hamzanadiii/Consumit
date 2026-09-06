import { afterEach, describe, expect, it } from 'vitest'

import { buildApp } from '../app.ts'

const openApps: Awaited<ReturnType<typeof buildApp>>[] = []

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()))
})

describe('global error translation', () => {
  it('answers unknown routes with the stable envelope', async () => {
    const app = await buildApp()
    openApps.push(app)

    const response = await app.inject({ method: 'GET', url: '/v1/nope' })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'Route not found.', retryable: false },
    })
  })

  it('answers rate-limited requests with a retryable envelope', async () => {
    const app = await buildApp()
    openApps.push(app)

    let response = await app.inject({ method: 'GET', url: '/v1/titles/discover?kind=all' })
    for (let attempt = 0; attempt < 100; attempt += 1) {
      response = await app.inject({ method: 'GET', url: '/v1/titles/discover?kind=all' })
    }

    expect(response.statusCode).toBe(429)
    expect(response.json()).toEqual({
      error: { code: 'RATE_LIMITED', message: expect.any(String), retryable: true },
    })
  })
})
