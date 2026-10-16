import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { registerReleaseRoutes } from './routes.ts'
import { registerErrorHandlers } from '../http/errors.ts'
import { loadEnv } from '../config/env.ts'
import { createFakeIdentity } from '../identity/fake-identity.ts'
import type { ReleaseService } from './service.ts'

const apps: ReturnType<typeof Fastify>[] = []
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())) })
async function setup() {
  const app = Fastify(); apps.push(app); await app.register(cookie); registerErrorHandlers(app)
  const identity = createFakeIdentity(), env = loadEnv({ NODE_ENV: 'test', APP_ORIGIN: 'https://consumit.example' })
  env.releases = { enabled: true, workerSecret: 'w'.repeat(32) }
  const service = { shelf: vi.fn(async () => ({ items: [], trackedCount: 0, partial: false })), preferences: vi.fn(async () => ({ newEpisodes: false })),
    setPreferences: vi.fn(async (_id: string, enabled: boolean) => ({ newEpisodes: enabled })), claimCheck: vi.fn(async () => null),
    authorizeJob: vi.fn(async () => false), markRead: vi.fn(async () => {}), notifications: vi.fn(async () => ({ items: [], unreadCount: 0, nextCursor: null })) }
  registerReleaseRoutes(app, { env, identity, service: service as unknown as ReleaseService })
  await identity.register({ email: 'routes@example.com', password: 'test-password-long-enough', username: 'routes' })
  const delivery = identity.notifier.deliveries[0]!
  if (!('code' in delivery)) throw new Error('Expected verification')
  const session = await identity.verifyEmail({ email: 'routes@example.com', code: delivery.code })
  return { app, service, owner: session.member.id, cookies: { consumit_session: session.sessionToken } }
}
describe('private notification interfaces', () => {
  it('requires a session on every member read and passes the authenticated owner only', async () => {
    const { app, cookies, service, owner } = await setup()
    for (const url of ['/v1/me/releases', '/v1/me/notifications', '/v1/me/notification-preferences']) expect((await app.inject({ url })).statusCode).toBe(401)
    const response = await app.inject({ url: '/v1/me/releases?memberId=someone-else', cookies })
    expect(response.statusCode).toBe(200); expect(response.headers['cache-control']).toBe('private, no-store')
    expect(service.shelf).toHaveBeenCalledExactlyOnceWith(owner)
  })
  it('enforces mutation origin and strict preference/read contracts', async () => {
    const { app, cookies, service } = await setup()
    const url = '/v1/me/notification-preferences'
    expect((await app.inject({ method: 'PATCH', url, cookies, payload: { newEpisodes: true } })).statusCode).toBe(403)
    expect((await app.inject({ method: 'PATCH', url, cookies, headers: { origin: 'https://evil.example' }, payload: { newEpisodes: true } })).statusCode).toBe(403)
    expect((await app.inject({ method: 'PATCH', url, cookies, headers: { origin: 'https://consumit.example' }, payload: { newEpisodes: true, memberId: 'other' } })).statusCode).toBe(400)
    expect(service.setPreferences).not.toHaveBeenCalled()
    expect((await app.inject({ method: 'PATCH', url, cookies, headers: { origin: 'https://consumit.example' }, payload: { newEpisodes: true } })).json()).toEqual({ newEpisodes: true })
  })
  it('ordinary member cookies cannot claim checks or submit evidence; probe authorization is job-scoped', async () => {
    const { app, cookies, service } = await setup()
    for (const path of ['claim', 'source', 'result']) expect((await app.inject({ method: 'POST', url: `/v1/internal/releases/${path}`, cookies, payload: {} })).statusCode).toBe(403)
    expect(service.claimCheck).not.toHaveBeenCalled()
    expect((await app.inject({ method: 'POST', url: '/v1/internal/releases/claim', headers: { authorization: `Bearer ${'w'.repeat(32)}` }, payload: {} })).json()).toEqual({ job: null })
    expect((await app.inject({ method: 'POST', url: '/v1/internal/releases/authorize', payload: { id: crypto.randomUUID(), leaseToken: crypto.randomUUID() } })).statusCode).toBe(403)
  })
})
