import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import { afterEach, describe, expect, it } from 'vitest'
import { loadEnv } from '../config/env.ts'
import { registerErrorHandlers } from '../http/errors.ts'
import { createFakeIdentity } from '../identity/fake-identity.ts'
import { registerTasteRoutes } from './routes.ts'

const apps: ReturnType<typeof Fastify>[] = []
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())) })
async function setup() {
  const app = Fastify(), identity = createFakeIdentity()
  apps.push(app)
  await app.register(cookie)
  registerErrorHandlers(app)
  registerTasteRoutes(app, { identity, env: loadEnv({ NODE_ENV: 'test', APP_ORIGIN: 'http://localhost:3000' }) })
  return { app, identity }
}
async function session(identity: ReturnType<typeof createFakeIdentity>, role: 'member' | 'admin') {
  const email = `${role}@example.test`
  await identity.register({ email, username: role, password: 'test-password-12345' })
  const delivery = identity.notifier.deliveries.findLast(item => item.kind === 'verification')!
  if (!('code' in delivery)) throw new Error('Missing verification code')
  const result = await identity.verifyEmail({ email, code: delivery.code })
  if (role === 'admin') await identity.repository.setRole(result.member.id, 'ADMIN')
  return { consumit_session: result.sessionToken }
}

describe('taste HTTP boundaries', () => {
  it('requires a member for every private read and publication action', async () => {
    const { app } = await setup()
    const requests = [
      { method: 'GET' as const, url: '/v1/taste/drafts/private-key' },
      { method: 'GET' as const, url: '/v1/taste/notifications' },
      { method: 'GET' as const, url: '/v1/taste/recommendations' },
      { method: 'POST' as const, url: '/v1/taste/recommendations', payload: {} },
      { method: 'PUT' as const, url: '/v1/taste/recommendations/recommendation-id/response', payload: {} },
      { method: 'GET' as const, url: '/v1/taste/subscriptions/list/list-id' },
      { method: 'PUT' as const, url: '/v1/taste/presentation', payload: {} },
      { method: 'POST' as const, url: '/v1/taste/reviews', payload: {} },
      { method: 'POST' as const, url: '/v1/taste/discussion/review/review-id', payload: {} },
      { method: 'POST' as const, url: '/v1/taste/reports', payload: {} },
    ]
    for (const request of requests) {
      const response = await app.inject({ ...request, headers: { origin: 'http://localhost:3000' } })
      expect(response.statusCode, request.url).toBe(401)
      expect(response.headers['cache-control']).toBe('private, no-store')
    }
  })
  it('rejects cross-site writes before publication data is read', async () => {
    const { app, identity } = await setup()
    const cookies = await session(identity, 'member')
    const response = await app.inject({ method: 'PUT', url: '/v1/taste/editions', cookies, headers: { origin: 'https://another-site.example' }, payload: {} })
    expect(response.statusCode).toBe(403)
  })
  it('requires a stable idempotency key before accepting a report write', async () => {
    const { app, identity } = await setup()
    const cookies = await session(identity, 'member')
    const response = await app.inject({
      method: 'POST',
      url: '/v1/taste/reports',
      cookies,
      headers: { origin: 'http://localhost:3000' },
      payload: { kind: 'review', id: 'review-one', reason: 'Please review this content.' },
    })
    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('BAD_REQUEST')
  })
  it('requires an admin for moderation reads and decisions', async () => {
    const { app, identity } = await setup()
    const cookies = await session(identity, 'member')
    expect((await app.inject({ url: '/v1/taste/moderation' })).statusCode).toBe(401)
    expect((await app.inject({ url: '/v1/taste/moderation', cookies })).statusCode).toBe(403)
    expect((await app.inject({ method: 'POST', url: '/v1/taste/moderation/report-id', cookies, headers: { origin: 'http://localhost:3000' }, payload: { action: 'remove', note: 'Reviewed content.' } })).statusCode).toBe(403)
  })
  it('reports unavailable publishing storage honestly after admin authorization', async () => {
    const { app, identity } = await setup()
    const response = await app.inject({ url: '/v1/taste/moderation', cookies: await session(identity, 'admin') })
    expect(response.statusCode).toBe(503)
    expect(response.json().error.message).toContain('temporarily unavailable')
  })
})
