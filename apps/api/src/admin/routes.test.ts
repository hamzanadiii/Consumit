import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import { createStaticProvider } from '@consumit/provider-sdk'

import { buildApp } from '../app.ts'
import { loadEnv } from '../config/env.ts'
import { createFakeIdentity } from '../identity/fake-identity.ts'
import { registerAdminRoutes } from './routes.ts'

async function loginAs(identity: ReturnType<typeof createFakeIdentity>, app: Awaited<ReturnType<typeof buildApp>>, email: string, role: 'admin' | 'member') {
  const username = email.split('@')[0]!
  await identity.register({ email, password: 'password12345', username })
  const delivery = identity.notifier.deliveries.findLast((d) => d.kind === 'verification' && 'code' in d && d.email === email)
  if (!delivery || !('code' in delivery)) throw new Error(`No verification code for ${email}`)
  const result = await identity.verifyEmail({ code: delivery.code, email })
  if (role === 'admin') {
    await identity.repository.setRole(result.member.id, 'ADMIN')
  }
  return result.sessionToken
}

describe('admin routes', () => {
  const apps: Array<Awaited<ReturnType<typeof buildApp>>> = []
  afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())))

  it('rejects unauthenticated admin requests', async () => {
    const identity = createFakeIdentity()
    const app = await buildApp({ identity, env: loadEnv({ NODE_ENV: 'test' }) })
    apps.push(app)
    const res = await app.inject({ method: 'GET', url: '/v1/admin/providers' })
    expect(res.statusCode).toBe(401)
  })

  it('rejects non-admin users', async () => {
    const identity = createFakeIdentity()
    const app = await buildApp({ identity })
    apps.push(app)
    const token = await loginAs(identity, app, 'member@example.com', 'member')
    const res = await app.inject({ method: 'GET', url: '/v1/admin/providers', cookies: { consumit_session: token } })
    expect(res.statusCode).toBe(403)
  })

  it('lists providers with config', async () => {
    const identity = createFakeIdentity()
    const app = await buildApp({ identity })
    apps.push(app)
    const token = await loginAs(identity, app, 'admin-providers@example.com', 'admin')
    const res = await app.inject({ method: 'GET', url: '/v1/admin/providers', cookies: { consumit_session: token } })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { providers: Array<{ id: string; enabled: boolean; regions: string[] }> }
    expect(Array.isArray(body.providers)).toBe(true)
  })

  it('lists members with role', async () => {
    const identity = createFakeIdentity()
    const app = await buildApp({ identity, repository: identity.repository })
    apps.push(app)
    const adminToken = await loginAs(identity, app, 'admin-members@example.com', 'admin')
    await loginAs(identity, app, 'user-members@example.com', 'member')
    const res = await app.inject({ method: 'GET', url: '/v1/admin/members', cookies: { consumit_session: adminToken } })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { members: Array<{ id: string; role: string }>; total: number }
    expect(body.total).toBeGreaterThanOrEqual(2)
    const roles = body.members.map((m) => m.role)
    expect(roles).toContain('admin')
    expect(roles).toContain('member')
  })

  it('promotes and demotes members', async () => {
    const identity = createFakeIdentity()
    const app = await buildApp({ identity, repository: identity.repository })
    apps.push(app)
    const adminToken = await loginAs(identity, app, 'admin-role@example.com', 'admin')
    const userResult = await loginAs(identity, app, 'user-role@example.com', 'member')
    const userSession = await identity.getSession(userResult)
    expect(userSession).not.toBeNull()
    const userId = userSession!.id

    const promote = await app.inject({
      method: 'POST', url: `/v1/admin/members/${userId}/role`,
      payload: { role: 'admin' },
      cookies: { consumit_session: adminToken },
      headers: { origin: 'http://localhost:3000' },
    })
    expect(promote.statusCode).toBe(200)
    expect(promote.json()).toEqual({ id: userId, role: 'admin' })

    const demote = await app.inject({
      method: 'POST', url: `/v1/admin/members/${userId}/role`,
      payload: { role: 'member' },
      cookies: { consumit_session: adminToken },
      headers: { origin: 'http://localhost:3000' },
    })
    expect(demote.statusCode).toBe(200)
    expect(demote.json()).toEqual({ id: userId, role: 'member' })
  })

  it('applies provider proxy toggle in memory when disk persist fails', async () => {
    const identity = createFakeIdentity()
    const dir = await mkdtemp(join(tmpdir(), 'consumit-providers-'))
    const configPath = join(dir, 'providers.json')
    await writeFile(configPath, JSON.stringify([
      { id: 'vixsrc', adapter: 'vixsrc', regions: ['US'], mediaHosts: ['vixsrc.to'], upstreamGroup: 'vixsrc' },
    ]))
    // Read-only config mount: every persist attempt throws, like EROFS in dev.
    const failingStore = {
      getOverride: async () => undefined,
      getAll: async () => ({}),
      setOverride: async () => { throw new Error('EROFS: read-only file system') },
      removeOverride: async () => { throw new Error('EROFS: read-only file system') },
    }
    const env = loadEnv({ ...process.env, PLAYBACK_ENABLED: 'true', PLAYBACK_MEDIA_CONFIG: configPath })
    const app = await buildApp({ identity, env, providerConfigStore: failingStore })
    apps.push(app)
    const token = await loginAs(identity, app, 'admin-toggle@example.com', 'admin')

    const before = await app.inject({ method: 'GET', url: '/v1/admin/providers', cookies: { consumit_session: token } })
    expect(before.statusCode).toBe(200)
    expect(before.json().providers.find((p: { id: string }) => p.id === 'vixsrc').proxy).toBe(true)

    const invalid = await app.inject({
      method: 'PATCH', url: '/v1/admin/providers/vixsrc/config',
      payload: { proxy: 'false' },
      cookies: { consumit_session: token },
      headers: { origin: 'http://localhost:3000' },
    })
    expect(invalid.statusCode).toBe(400)

    const patch = await app.inject({
      method: 'PATCH', url: '/v1/admin/providers/vixsrc/config',
      payload: { proxy: false },
      cookies: { consumit_session: token },
      headers: { origin: 'http://localhost:3000' },
    })
    expect(patch.statusCode).toBe(200)

    const after = await app.inject({ method: 'GET', url: '/v1/admin/providers', cookies: { consumit_session: token } })
    expect(after.json().providers.find((p: { id: string }) => p.id === 'vixsrc').proxy).toBe(false)
  })

  it('merges probe truth into provider health per kind', async () => {
    const identity = createFakeIdentity()
    const env = loadEnv({ NODE_ENV: 'test' })
    const app = Fastify()
    await app.register(cookie)
    registerAdminRoutes(app, {
      env,
      identity,
      providers: [
        { adapter: createStaticProvider('primary', []), enabled: true, approvedRegions: ['US'], mediaHosts: [], upstreamGroup: 'primary', concurrency: 2, requestsPerMinute: 30, proxy: true, mediaKinds: ['movie', 'series'] },
        { adapter: createStaticProvider('toon', []), enabled: true, approvedRegions: ['US'], mediaHosts: [], upstreamGroup: 'toon', concurrency: 2, requestsPerMinute: 30, proxy: true, mediaKinds: ['anime'] },
      ],
      probeStatus: () => ({ primary: { ok: true, ms: 120, at: Date.now() } }),
    })
    const token = await loginAs(identity, undefined as never, 'admin-probe@example.com', 'admin')
    const res = await app.inject({ method: 'GET', url: '/v1/admin/providers/health', cookies: { consumit_session: token } })
    expect(res.statusCode).toBe(200)
    const body = res.json() as Record<string, Array<{ id: string; enabled: boolean; probe: { ok: boolean; ms: number } | null }>>
    expect(body.movie).toMatchObject([{ id: 'primary', enabled: true, probe: { ok: true, ms: 120 } }])
    expect(body.movie!.some((entry) => entry.id === 'toon')).toBe(false)
    expect(body.anime).toMatchObject([{ id: 'toon', enabled: true, probe: null }])
    await app.close()
  })

  it('returns health status', async () => {
    const identity = createFakeIdentity()
    const app = await buildApp({ identity, env: loadEnv({ NODE_ENV: 'test' }) })
    apps.push(app)
    const token = await loginAs(identity, app, 'admin-health@example.com', 'admin')
    const res = await app.inject({ method: 'GET', url: '/v1/admin/health', cookies: { consumit_session: token } })
    expect(res.statusCode).toBe(200)
    const body = res.json() as { api: string; store: string }
    expect(body.api).toBe('ok')
    expect(body.store).toBe('ok')
  })
})
