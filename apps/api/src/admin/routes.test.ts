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
import { createProviderConfigStore } from './provider-config.ts'
import { createMemoryPlaybackStore } from '../playback/state.ts'
import { registerErrorHandlers } from '../http/errors.ts'

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

  it('restricts subtitle diagnostics to admins and omits title-specific data', async () => {
    const identity = createFakeIdentity()
    const app = await buildApp({ identity })
    apps.push(app)
    const member = await loginAs(identity, app, 'subtitle-member@example.com', 'member')
    const admin = await loginAs(identity, app, 'subtitle-admin@example.com', 'admin')
    expect((await app.inject({ method: 'GET', url: '/v1/admin/subtitles' })).statusCode).toBe(401)
    expect((await app.inject({ method: 'GET', url: '/v1/admin/subtitles', cookies: { consumit_session: member } })).statusCode).toBe(403)
    const response = await app.inject({ method: 'GET', url: '/v1/admin/subtitles', cookies: { consumit_session: admin } })
    expect(response.statusCode).toBe(200)
    const result = response.json() as { providers: Array<{ id: string; configured: boolean; last: unknown }> }
    expect(result.providers.length).toBeGreaterThanOrEqual(13)
    expect(new Set(result.providers.map(provider => provider.id)).size).toBe(result.providers.length)
    expect(result.providers.every((provider) => typeof provider.configured === 'boolean' && provider.last === null)).toBe(true)
    expect(response.body).not.toContain('subtitle-member@example.com')
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

  it('rejects provider changes when persistence fails and keeps the live config', async () => {
    const identity = createFakeIdentity()
    const dir = await mkdtemp(join(tmpdir(), 'consumit-providers-'))
    const configPath = join(dir, 'providers.json')
    await writeFile(configPath, JSON.stringify([
      { id: 'vixsrc', adapter: 'vixsrc', regions: ['US'], mediaHosts: ['vixsrc.to'], upstreamGroup: 'vixsrc' },
      { id: 'disabled-source', adapter: 'static', enabled: false, regions: ['US'], mediaHosts: ['media.example'], entries: [], upstreamGroup: 'disabled-source' },
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
    expect(before.json().providers.find((p: { id: string }) => p.id === 'vixsrc').enabled).toBe(true)
    expect(before.json().providers.find((p: { id: string }) => p.id === 'disabled-source').enabled).toBe(false)
    expect(before.json().readiness).toEqual({ configuredRows: 2, enabledRows: 1, removedRows: 0 })

    const invalid = await app.inject({
      method: 'PATCH', url: '/v1/admin/providers/vixsrc/config',
      payload: { proxy: 'false' },
      cookies: { consumit_session: token },
      headers: { origin: 'http://localhost:3000' },
    })
    expect(invalid.statusCode).toBe(400)

    const patch = await app.inject({
      method: 'PATCH', url: '/v1/admin/providers/vixsrc/config',
      payload: { enabled: false },
      cookies: { consumit_session: token },
      headers: { origin: 'http://localhost:3000' },
    })
    expect(patch.statusCode).toBe(500)

    const after = await app.inject({ method: 'GET', url: '/v1/admin/providers', cookies: { consumit_session: token } })
    expect(after.json().providers.find((p: { id: string }) => p.id === 'vixsrc').enabled).toBe(true)
  })

  it('enables and resets a disabled provider through Admin without a restart', async () => {
    const identity = createFakeIdentity()
    const dir = await mkdtemp(join(tmpdir(), 'consumit-provider-control-'))
    const configPath = join(dir, 'providers.json')
    await writeFile(configPath, JSON.stringify([
      { id: 'fixture', adapter: 'static', enabled: false, regions: ['US'], mediaHosts: ['media.example'], entries: [], upstreamGroup: 'fixture' },
    ]))
    const env = loadEnv({ ...process.env, PLAYBACK_ENABLED: 'true', PLAYBACK_MEDIA_CONFIG: configPath })
    const app = await buildApp({ identity, env, providerConfigStore: createProviderConfigStore(join(dir, 'overrides.json')) })
    apps.push(app)
    const token = await loginAs(identity, app, 'admin-control@example.com', 'admin')
    const request = { cookies: { consumit_session: token }, headers: { origin: 'http://localhost:3000' } }

    const before = await app.inject({ method: 'GET', url: '/v1/admin/providers', cookies: request.cookies })
    expect(before.json().readiness).toEqual({ configuredRows: 1, enabledRows: 0, removedRows: 0 })
    expect(before.json().providers[0].enabled).toBe(false)

    const enabled = await app.inject({ method: 'PATCH', url: '/v1/admin/providers/fixture/config', payload: { enabled: true }, ...request })
    expect(enabled.statusCode).toBe(200)
    const afterEnable = await app.inject({ method: 'GET', url: '/v1/admin/providers', cookies: request.cookies })
    expect(afterEnable.json().readiness).toEqual({ configuredRows: 1, enabledRows: 1, removedRows: 0 })
    expect(afterEnable.json().providers[0].enabled).toBe(true)
    expect(afterEnable.json().providers[0].role).toBe('video')
    expect(afterEnable.json().providers[0]).toMatchObject({ deliveryMode: 'direct', proxyApproved: false })
    const delivery = await app.inject({ method: 'PATCH', url: '/v1/admin/providers/fixture/config', payload: { deliveryMode: 'relay' }, ...request })
    expect(delivery.statusCode).toBe(200)
    expect((await app.inject({ method: 'GET', url: '/v1/admin/providers', cookies: request.cookies })).json().providers[0]).toMatchObject({ deliveryMode: 'relay', proxyApproved: false })
    expect((await app.inject({ method: 'GET', url: '/v1/admin/providers/config', cookies: request.cookies })).json().overrides.fixture).toMatchObject({ deliveryMode: 'relay' })
    expect((await app.inject({ method: 'PATCH', url: '/v1/admin/providers/fixture/config', payload: { deliveryMode: 'both' }, ...request })).statusCode).toBe(400)
    const role = await app.inject({ method: 'PATCH', url: '/v1/admin/providers/fixture/config', payload: { role: 'audio' }, ...request })
    expect(role.statusCode).toBe(200)
    const afterRole = (await app.inject({ method: 'GET', url: '/v1/admin/providers', cookies: request.cookies })).json()
    expect(afterRole.providers[0]).toMatchObject({ role: 'audio', audioCapabilities: { separateAudio: 'unverified', health: 'untested' } })
    expect((await app.inject({ method: 'GET', url: '/v1/admin/providers/order/movie', cookies: request.cookies })).json().providerIds).toEqual([])
    expect((await app.inject({ method: 'PATCH', url: '/v1/admin/providers/fixture/config', payload: { role: 'verified' }, ...request })).statusCode).toBe(400)
    expect((await app.inject({ method: 'PATCH', url: '/v1/admin/providers/fixture/config', payload: { audioCapabilities: { separateAudio: 'verified' } }, ...request })).statusCode).toBe(400)

    const reset = await app.inject({ method: 'DELETE', url: '/v1/admin/providers/fixture/config', ...request })
    expect(reset.statusCode).toBe(204)
    const afterReset = await app.inject({ method: 'GET', url: '/v1/admin/providers', cookies: request.cookies })
    expect(afterReset.json().readiness).toEqual({ configuredRows: 1, enabledRows: 0, removedRows: 0 })
    expect(afterReset.json().providers[0].enabled).toBe(false)
    expect(afterReset.json().providers[0].role).toBe('video')
    expect(afterReset.json().providers[0].deliveryMode).toBe('direct')
  })

  it('deletes a configured provider durably and restores it disabled', async () => {
    const identity = createFakeIdentity()
    const dir = await mkdtemp(join(tmpdir(), 'consumit-provider-removal-'))
    const configPath = join(dir, 'providers.json')
    await writeFile(configPath, JSON.stringify([
      { id: 'fixture', adapter: 'static', enabled: true, regions: ['US'], mediaHosts: ['media.example'], entries: [], upstreamGroup: 'fixture' },
    ]))
    const env = loadEnv({ ...process.env, PLAYBACK_ENABLED: 'true', PLAYBACK_MEDIA_CONFIG: configPath })
    const config = createProviderConfigStore(join(dir, 'overrides.json'))
    const app = await buildApp({ identity, env, providerConfigStore: config })
    apps.push(app)
    const admin = await loginAs(identity, app, 'admin-remove@example.com', 'admin')
    const member = await loginAs(identity, app, 'member-remove@example.com', 'member')
    const mutation = { headers: { origin: 'http://localhost:3000' } }
    expect((await app.inject({ method: 'DELETE', url: '/v1/admin/providers/fixture', cookies: { consumit_session: member }, ...mutation })).statusCode).toBe(403)
    expect((await app.inject({ method: 'DELETE', url: '/v1/admin/providers/fixture', cookies: { consumit_session: admin }, ...mutation })).statusCode).toBe(200)
    expect(await config.getOverride('fixture')).toMatchObject({ removed: true, enabled: false })
    const afterDelete = (await app.inject({ method: 'GET', url: '/v1/admin/providers', cookies: { consumit_session: admin } })).json()
    expect(afterDelete.readiness).toEqual({ configuredRows: 0, enabledRows: 0, removedRows: 1 })
    expect(afterDelete.providers[0]).toMatchObject({ id: 'fixture', removed: true, enabled: false })
    expect((await app.inject({ method: 'GET', url: '/v1/admin/providers/order/movie', cookies: { consumit_session: admin } })).json().providerIds).toEqual([])
    expect((await app.inject({ method: 'PATCH', url: '/v1/admin/providers/fixture/config', cookies: { consumit_session: admin }, payload: { enabled: true }, ...mutation })).statusCode).toBe(400)
    expect((await app.inject({ method: 'DELETE', url: '/v1/admin/providers/fixture/config', cookies: { consumit_session: admin }, ...mutation })).statusCode).toBe(204)
    expect(await config.getOverride('fixture')).toMatchObject({ removed: true })
    expect((await app.inject({ method: 'POST', url: '/v1/admin/providers/fixture/restore', cookies: { consumit_session: admin }, ...mutation })).statusCode).toBe(200)
    const restored = (await app.inject({ method: 'GET', url: '/v1/admin/providers', cookies: { consumit_session: admin } })).json()
    expect(restored.providers[0]).toMatchObject({ removed: false, enabled: false })
    expect(restored.readiness).toEqual({ configuredRows: 1, enabledRows: 0, removedRows: 0 })
    expect((await app.inject({ method: 'GET', url: '/v1/admin/providers/order/movie', cookies: { consumit_session: admin } })).json().providerIds).toEqual(['fixture'])
  })

  it('rejects obsolete settings and keeps region edits within configured scope', async () => {
    const identity = createFakeIdentity()
    const dir = await mkdtemp(join(tmpdir(), 'consumit-provider-region-'))
    const configPath = join(dir, 'providers.json')
    await writeFile(configPath, JSON.stringify([{ id: 'fixture', adapter: 'static', enabled: true, regions: ['US', 'IT'], mediaHosts: ['media.example'], entries: [], upstreamGroup: 'fixture' }]))
    const app = await buildApp({ identity, env: loadEnv({ ...process.env, PLAYBACK_ENABLED: 'true', PLAYBACK_MEDIA_CONFIG: configPath }), providerConfigStore: createProviderConfigStore(join(dir, 'overrides.json')) })
    apps.push(app)
    const token = await loginAs(identity, app, 'admin-region@example.com', 'admin')
    const mutation = { cookies: { consumit_session: token }, headers: { origin: 'http://localhost:3000' } }
    expect((await app.inject({ method: 'PATCH', url: '/v1/admin/providers/fixture/config', payload: { regions: ['GB'] }, ...mutation })).statusCode).toBe(400)
    const saved = await app.inject({ method: 'PATCH', url: '/v1/admin/providers/fixture/config', payload: { regions: ['IT'], concurrency: 1 }, ...mutation })
    expect(saved.statusCode).toBe(200)
    const provider = (await app.inject({ method: 'GET', url: '/v1/admin/providers', cookies: mutation.cookies })).json().providers[0]
    expect(provider).toMatchObject({ regions: ['IT'], configuredRegions: ['US', 'IT'], concurrency: 1 })
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
        { adapter: createStaticProvider('primary', []), enabled: true, approvedRegions: ['US', 'IT'], mediaHosts: [], upstreamGroup: 'primary', concurrency: 2, requestsPerMinute: 30,  mediaKinds: ['movie', 'series'] },
        { adapter: createStaticProvider('toon', []), enabled: true, approvedRegions: ['US'], mediaHosts: [], upstreamGroup: 'toon', concurrency: 2, requestsPerMinute: 30,  mediaKinds: ['anime'] },
      ],
      probeStatus: () => ({ 'primary:movie:US': { ok: true, ms: 120, at: Date.now() } }),
    })
    const token = await loginAs(identity, undefined as never, 'admin-probe@example.com', 'admin')
    const res = await app.inject({ method: 'GET', url: '/v1/admin/providers/health', cookies: { consumit_session: token } })
    expect(res.statusCode).toBe(200)
    const body = res.json() as Record<string, Array<{ id: string; enabled: boolean; probe: { ok: boolean; ms: number } | null }>>
    expect(body.movie).toMatchObject([{ id: 'primary', region: 'US', enabled: true, probe: { ok: true, ms: 120 } }, { id: 'primary', region: 'IT', enabled: true, probe: null }])
    expect(body.movie!.some((entry) => entry.id === 'toon')).toBe(false)
    expect(body.anime).toMatchObject([{ id: 'toon', enabled: true, probe: null }])
    await app.close()
  })

  it('validates complete kind orders and rejects stale admin edits', async () => {
    const identity = createFakeIdentity()
    const env = loadEnv({ NODE_ENV: 'test' })
    const app = Fastify()
    await app.register(cookie)
    registerErrorHandlers(app)
    const providers = ['first', 'second'].map((id) => ({ adapter: createStaticProvider(id, []), enabled: true, approvedRegions: ['US'], mediaHosts: [], upstreamGroup: id, concurrency: 1, requestsPerMinute: 30,  mediaKinds: ['movie'] as const }))
    let revision = 0
    let overrides: Record<string, { order?: Partial<Record<'movie' | 'series' | 'anime', number>> }> = {}
    registerAdminRoutes(app, { env, identity, providers, providerConfig: {
      getAll: async () => overrides, getOverride: async (id) => overrides[id],
      setOverride: async () => undefined, removeOverride: async () => undefined,
      getRevision: async () => revision,
      setOrder: async (kind, ids, expected) => {
        if (expected !== revision) return false
        overrides = Object.fromEntries(ids.map((id, index) => [id, { order: { [kind]: index } }]))
        revision++
        return true
      },
    } })
    const token = await loginAs(identity, undefined as never, 'admin-order@example.com', 'admin')
    const cookies = { consumit_session: token }
    const headers = { origin: 'http://localhost:3000' }
    expect((await app.inject({ method: 'GET', url: '/v1/admin/providers/order/movie', cookies })).json()).toMatchObject({ providerIds: ['first', 'second'], revision: 0 })
    expect((await app.inject({ method: 'PUT', url: '/v1/admin/providers/order/movie', cookies, headers, payload: { providerIds: ['first', 'first'], revision: 0 } })).statusCode).toBe(400)
    expect((await app.inject({ method: 'PUT', url: '/v1/admin/providers/order/movie', cookies, headers, payload: { providerIds: ['second', 'first'], revision: 0 } })).statusCode).toBe(200)
    expect((await app.inject({ method: 'PUT', url: '/v1/admin/providers/order/movie', cookies, headers, payload: { providerIds: ['first', 'second'], revision: 0 } })).statusCode).toBe(409)
    expect((await app.inject({ method: 'GET', url: '/v1/admin/providers/order/movie', cookies })).json()).toMatchObject({ providerIds: ['second', 'first'], revision: 1 })
    await app.close()
  })

  it('returns validated source metadata without leaking signed media URLs', async () => {
    const identity = createFakeIdentity()
    const env = loadEnv({ NODE_ENV: 'test' })
    const app = Fastify()
    await app.register(cookie)
    const provider = createStaticProvider('primary', [{ ref: { kind: 'movie', id: 550 }, sources: [{
      key: 'main', url: 'https://media.example/video.m3u8?token=never-show-this', type: 'hls', language: 'en',
      expiresAt: '2099-01-01T00:00:00.000Z', headers: {}, subtitles: [],
    }] }])
    registerAdminRoutes(app, { env, identity, providers: [{ adapter: provider, enabled: true, approvedRegions: ['US'], mediaHosts: ['media.example'], upstreamGroup: 'primary', concurrency: 1, requestsPerMinute: 30,  mediaKinds: ['movie'] }] })
    const token = await loginAs(identity, undefined as never, 'admin-redaction@example.com', 'admin')
    const response = await app.inject({ method: 'POST', url: '/v1/admin/providers/test', cookies: { consumit_session: token }, headers: { origin: 'http://localhost:3000' }, payload: { providerId: 'primary', ref: { kind: 'movie', id: 550 } } })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ ok: true, sourceCount: 1, sources: [{ key: 'main', type: 'hls' }] })
    expect(response.body).not.toContain('never-show-this')
    expect(response.body).not.toContain('https://')
    await app.close()
  })

  it('bounds provider retests and restricts them to admins', async () => {
    const identity = createFakeIdentity()
    const env = loadEnv({ NODE_ENV: 'test' })
    const app = Fastify()
    await app.register(cookie)
    const playbackStore = createMemoryPlaybackStore()
    registerErrorHandlers(app)
    const provider = createStaticProvider('primary', [{ ref: { kind: 'movie', id: 550 }, sources: [{
      key: 'main', url: 'https://media.example/video.mp4', type: 'native', language: 'en',
      expiresAt: '2099-01-01T00:00:00.000Z', headers: {}, subtitles: [],
    }] }])
    registerAdminRoutes(app, { env, identity, playbackStore, providers: [{ adapter: provider, enabled: true, approvedRegions: ['US', 'IT'], mediaHosts: ['media.example'], upstreamGroup: 'primary', concurrency: 1, requestsPerMinute: 30,  mediaKinds: ['movie'] }] })
    const member = await loginAs(identity, undefined as never, 'member-retest@example.com', 'member')
    const admin = await loginAs(identity, undefined as never, 'admin-retest@example.com', 'admin')
    const request = (token: string) => app.inject({ method: 'POST', url: '/v1/admin/providers/primary/retest', payload: { kind: 'movie', region: 'IT' }, cookies: { consumit_session: token }, headers: { origin: 'http://localhost:3000' } })
    expect((await request(member)).statusCode).toBe(403)
    const first = await request(admin)
    expect(first.statusCode).toBe(200)
    expect(first.json()).toMatchObject({ providerId: 'primary', kind: 'movie', region: 'IT', ok: true })
    expect((await request(admin)).statusCode).toBe(409)
    expect(JSON.parse((await playbackStore.get('probe:primary:movie:IT'))!)).toMatchObject({ ok: true })
    await app.close()
    await playbackStore.close()
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
