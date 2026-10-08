import { afterEach, describe, expect, it } from 'vitest'

import { buildApp } from '../app.ts'

const openApps: Awaited<ReturnType<typeof buildApp>>[] = []

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()))
})

describe('global error translation', () => {
  it.each([
    { payload: 'x'.repeat(1_048_577), type: 'application/json', status: 413 },
    { payload: 'unsupported', type: 'application/xml', status: 415 },
  ])('preserves a client error status of $status without exposing internals', async ({ payload, type, status }) => {
    const app = await buildApp()
    openApps.push(app)
    const response = await app.inject({ method: 'POST', url: '/v1/auth/login',
      headers: { origin: 'http://localhost:3000', 'content-type': type }, payload })
    expect(response.statusCode).toBe(status)
    expect(response.json()).toEqual({ error: expect.objectContaining({ code: 'BAD_REQUEST', retryable: false }) })
    expect(response.headers['cache-control']).toContain('no-store')
  })
  it('answers unknown routes with the stable envelope', async () => {
    const app = await buildApp()
    openApps.push(app)

    const response = await app.inject({ method: 'GET', url: '/v1/nope' })

    expect(response.statusCode).toBe(404)
    expect(response.json()).toEqual({
      error: { code: 'NOT_FOUND', message: 'Route not found.', requestId: expect.any(String), retryable: false },
    })
  })

  it('answers rate-limited requests with a retryable envelope', async () => {
    const app = await buildApp()
    openApps.push(app)

    let response = await app.inject({ method: 'GET', url: '/v1/me/library' })
    for (let attempt = 0; attempt < 100; attempt += 1) {
      response = await app.inject({ method: 'GET', url: '/v1/me/library' })
    }

    expect(response.statusCode).toBe(429)
    expect(response.json()).toEqual({
      error: { code: 'RATE_LIMITED', message: expect.any(String), requestId: expect.any(String), retryable: true },
    })
  })
})
