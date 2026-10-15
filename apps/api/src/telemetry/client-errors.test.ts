import { describe, expect, it } from 'vitest'
import { buildApp } from '../app'
import { loadEnv } from '../config/env'
describe('anonymous client error reporting', () => {
  it('accepts only bounded categories and rejects source URLs, messages, and member identifiers', async () => {
    const app = await buildApp({ env: loadEnv({ NODE_ENV: 'test' }) })
    try {
      const event = { page: 'watch', kind: 'error', name: 'TypeError' }
      const response = await app.inject({ method: 'POST', url: '/v1/telemetry/client-errors', payload: { events: [event] } })
      expect(response.statusCode).toBe(202)
      for (const extra of [{ message: 'secret' }, { url: 'https://media.example/?token=secret' }, { memberId: 'owner' }]) expect((await app.inject({ method: 'POST', url: '/v1/telemetry/client-errors', payload: { events: [{ ...event, ...extra }] } })).statusCode).toBe(400)
      expect((await app.inject({ method: 'POST', url: '/v1/telemetry/client-errors', payload: { events: Array.from({ length: 11 }, () => event) } })).statusCode).toBe(400)
    } finally { await app.close() }
  })
})
