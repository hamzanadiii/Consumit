import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import rateLimit from '@fastify/rate-limit'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createStaticProvider, type ProviderRegistration } from '@consumit/provider-sdk'
import { createFakeIdentity } from '../identity/fake-identity.ts'
import { sessionCookieName } from '../identity/session.ts'
import { loadEnv } from '../config/env.ts'
import { registerErrorHandlers } from '../http/errors.ts'
import { createMemoryPlaybackStore } from '../playback/state.ts'
import { registerAdminRoutes } from './routes.ts'
import { createScoutCatalog, scoutRecipes } from './scout-catalog.ts'

const ref = { kind: 'movie' as const, id: 550 }
const source = { key: 'main', url: 'https://media.example/master.m3u8?token=private', type: 'hls' as const, language: 'en', expiresAt: '2099-01-01T00:00:00.000Z', headers: {}, subtitles: [] }
const registration = (id: string): ProviderRegistration => ({ adapter: createStaticProvider(id, [{ ref, sources: [source] }]), enabled: false, approvedRegions: ['US'], mediaHosts: ['media.example'], upstreamGroup: 'shared', concurrency: 1, requestsPerMinute: 10, mediaKinds: ['movie'] })
const apps: ReturnType<typeof Fastify>[] = []
afterEach(async () => { vi.useRealTimers(); vi.unstubAllGlobals(); await Promise.all(apps.splice(0).map(app => app.close())) })
async function setup(metricsUrl?: string, relayEnabled = false, extraProviderCount = 0, nodeEnv = 'test') {
  const app = Fastify(); apps.push(app)
  await app.register(cookie)
  await app.register(rateLimit, { global: false })
  registerErrorHandlers(app)
  const identity = createFakeIdentity()
  const configured = registration('configured')
  const candidate = registration('candidate')
  const extras = Array.from({ length: extraProviderCount }, (_, index) => registration(`extra-${index + 1}`))
  const appOrigin = nodeEnv === 'production' ? 'https://localhost:3000' : 'http://localhost:3000'
  const productionEnv = nodeEnv === 'production' ? { APP_ORIGIN: appOrigin, AUTH_CODE_PEPPER: 'fixture-production-auth-code-pepper-which-is-long-enough', AUTH_EMAIL_FROM: 'admin@example.com', DATABASE_URL: 'postgresql://fixture:fixture@database.example/consumit', DATABASE_DEPLOYMENT: 'managed', DATABASE_SSL_MODE: 'require', RESEND_API_KEY: 'fixture-resend-key', TMDB_API_READ_TOKEN: 'fixture-tmdb-token', VALKEY_URL: 'redis://valkey.example:6379' } : {}
  const env = loadEnv({ NODE_ENV: nodeEnv, ...productionEnv, ...(metricsUrl ? { ADMIN_METRICS_URL: metricsUrl } : {}), ...(relayEnabled ? { PLAYBACK_ENABLED: 'true', PLAYBACK_MEDIA_CONFIG: 'fixture.json', PLAYBACK_RELAY_ENABLED: 'true', PLAYBACK_RELAY_ORIGIN: 'https://edge.example', PLAYBACK_RELAY_SECRET: 'fixture-relay-secret-at-least-32-characters', PLAYBACK_RELAY_PROVIDERS: '{"configured":["media.example"]}' } : {}) })
  registerAdminRoutes(app, { env, identity, providers: [configured, ...extras], scoutCatalog: () => [candidate], scoutRecipes: [{ id: 'candidate' }], playbackStore: createMemoryPlaybackStore() })
  await identity.register({ email: 'operator@example.com', username: 'operator', password: 'password12345' })
  const delivery = identity.notifier.deliveries.findLast(d => d.kind === 'verification')!
  if (!('code' in delivery)) throw new Error('Missing verification')
  const session = await identity.verifyEmail({ email: 'operator@example.com', code: delivery.code })
  const cookies = { [sessionCookieName(env)]: session.sessionToken }
  const call = (body: Record<string, unknown>, origin = appOrigin) => app.inject({ method: 'POST', url: '/v1/admin/providers/inspect', cookies, headers: { origin }, payload: body })
  return { app, identity, configured, candidate, cookies, call, promote: () => identity.repository.setRole(session.member.id, 'ADMIN') }
}

describe('provider inspection bench', () => {
  it('uses the saved relay registration in scout instead of testing its direct recipe', async () => {
    const s = await setup(undefined, true); await s.promote()
    s.configured.deliveryMode = 'relay'
    s.candidate.adapter = { ...s.candidate.adapter, id: 'configured' }
    s.candidate.deliveryMode = 'direct'
    const response = await s.call({ providerId: 'configured', ref, scope: 'scout' })
    expect(response.json()).toMatchObject({ ok: true, delivery: 'relay', preview: { delivery: 'relay' } })
    expect(String(response.json().preview.src).startsWith('https://edge.example/media/')).toBe(true)
  })
  it('fails closed for an unapproved relay recipe in scout without enabling it', async () => {
    const s = await setup(); await s.promote(); s.candidate.deliveryMode = 'relay'
    const response = await s.call({ providerId: 'candidate', ref, scope: 'scout' })
    expect(response.json()).toMatchObject({ ok: false, code: 'proxy_unavailable', delivery: 'relay' })
    expect(response.json().preview).toBeUndefined()
    expect(s.candidate.enabled).toBe(false)
  })
  it('uses saved Proxy delivery for configured previews and never replaces missing approval with Direct', async () => {
    const unapproved = await setup(); await unapproved.promote(); unapproved.configured.deliveryMode = 'relay'
    const denied = await unapproved.call({ providerId: 'configured', ref })
    expect(denied.json()).toMatchObject({ ok: false, code: 'proxy_unavailable', sources: [{ host: 'media.example' }] })
    expect(denied.json().preview).toBeUndefined()
    const approved = await setup(undefined, true); await approved.promote(); approved.configured.deliveryMode = 'relay'
    const response = await approved.call({ providerId: 'configured', ref })
    expect(response.json()).toMatchObject({ ok: true, code: 'resolved', preview: { delivery: 'relay', type: 'hls' } })
    expect(String(response.json().preview.src).startsWith('https://edge.example/media/')).toBe(true)
    expect(Date.parse(response.json().preview.expiresAt) - Date.now()).toBeLessThanOrEqual(90_000)
    expect(approved.configured.enabled).toBe(false)
  })
  it('requires an admin and same-origin requests, rejects caller destinations', async () => {
    const s = await setup()
    expect((await s.app.inject('/v1/admin/providers/scout')).statusCode).toBe(401)
    expect((await s.call({ providerId: 'candidate', ref, scope: 'scout' })).statusCode).toBe(403)
    await s.promote()
    expect((await s.call({ providerId: 'candidate', ref, scope: 'scout' }, 'https://foreign.example')).statusCode).toBe(403)
    expect((await s.call({ providerId: 'candidate', ref, scope: 'scout', url: 'https://evil.example' })).statusCode).toBe(400)
    expect((await s.call({ providerId: 'unknown', ref, scope: 'scout' })).statusCode).toBe(400)
  })
  it('allows a full sequential provider run instead of stopping at six checks per minute', async () => {
    const s = await setup(undefined, false, 8); await s.promote()
    const replies = []
    for (let index = 1; index <= 8; index++) replies.push(await s.call({ providerId: `extra-${index}`, ref }))
    expect(replies.map(reply => reply.statusCode)).toEqual(Array(8).fill(200))
  })
  it('enforces the inspection route request limit', async () => {
    const s = await setup(undefined, false, 61); await s.promote()
    const replies = []
    for (let index = 1; index <= 61; index++) replies.push(await s.call({ providerId: `extra-${index}`, ref }))
    expect(replies.slice(0, 60).map(reply => reply.statusCode)).toEqual(Array(60).fill(200))
    expect(replies[60]?.statusCode).toBe(429)
  })
  it('allows authorized provider inspection in production deployments', async () => {
    const s = await setup(undefined, false, 0, 'production'); await s.promote()
    const inspected = await s.call({ providerId: 'candidate', ref, scope: 'scout' })
    expect(inspected.statusCode).toBe(200)
    expect(inspected.json()).toMatchObject({ ok: true, providerId: 'candidate' })
    const roster = await s.app.inject({ url: '/v1/admin/providers/scout', cookies: s.cookies })
    expect(roster.statusCode).toBe(200)
    expect(roster.json()).toMatchObject({ candidates: [{ id: 'candidate' }] })
    expect(roster.json()).not.toHaveProperty('inspectEnabled')
    expect((await s.app.inject({ url: '/v1/admin/providers', cookies: s.cookies })).json()).not.toHaveProperty('inspectEnabled')
  })
  it('tests a disabled candidate privately without installing or enabling it', async () => {
    const s = await setup(); await s.promote()
    const roster = await s.app.inject({ url: '/v1/admin/providers/scout', cookies: s.cookies })
    expect(roster.json().candidates[0]).toMatchObject({ id: 'candidate', configured: false })
    expect(roster.body).not.toContain('token=')
    const response = await s.call({ providerId: 'candidate', ref, scope: 'scout' })
    expect(response.headers['cache-control']).toBe('private, no-store')
    expect(response.json()).toMatchObject({ ok: true, code: 'resolved', rejectedSources: 0, sources: [{ host: 'media.example' }], preview: { type: 'hls' } })
    expect(s.candidate.enabled).toBe(false)
    expect((await s.app.inject({ url: '/v1/admin/providers', cookies: s.cookies })).json().providers.map((p: { id: string }) => p.id)).toEqual(['configured'])
    expect((await s.call({ providerId: 'candidate', ref, scope: 'scout' })).statusCode).toBe(409)
    const recipe = await s.app.inject({ url: '/v1/admin/providers/scout/candidate/recipe', cookies: s.cookies })
    expect(recipe.json()).toEqual({ recipe: { id: 'candidate', enabled: false } })
  })
  it('rejects unapproved sources and audio-only roles, and releases upstream locks', async () => {
    const s = await setup(); await s.promote()
    s.candidate.adapter.resolve = vi.fn<ProviderRegistration['adapter']['resolve']>(async () => ({ ok: true, sources: [{ ...source, url: 'https://evil.example/stream.m3u8' }] }))
    const failed = await s.call({ providerId: 'candidate', ref, scope: 'scout' })
    expect(failed.json()).toMatchObject({ ok: false, code: 'invalid_sources', rejectedSources: 1, sources: [] })
    expect(failed.json().preview).toBeUndefined()
    expect((await s.call({ providerId: 'configured', ref })).json().ok).toBe(true)
    s.configured.role = 'audio'
    expect((await s.call({ providerId: 'configured', ref })).statusCode).toBe(400)
  })
  it('bounds hung adapters and returns a safe timeout rather than upstream errors', async () => {
    const s = await setup(); await s.promote()
    s.candidate.adapter.resolve = vi.fn(() => new Promise<never>(() => {}))
    await s.app.ready(); vi.useFakeTimers()
    const pending = s.call({ providerId: 'candidate', ref, scope: 'scout' })
    await vi.advanceTimersByTimeAsync(15001)
    const response = await pending
    expect(response.json()).toMatchObject({ ok: false, code: 'timeout' })
  })
  it('loads a finite, disabled catalog through the same configuration seam', () => {
    const read = createScoutCatalog({ tmdbToken: 'fixture-token', animeTitleResolver: async () => 'Fixture', animeTitleVariantsResolver: async () => ['Fixture'], animeMetaResolver: async () => ({ title: 'Fixture', malId: 21 }) })
    const catalog = read()
    expect(catalog.length).toBe(scoutRecipes.length)
    expect(catalog.every(row => !row.enabled)).toBe(true)
    expect(read()).toBe(catalog)
  })
  it('shares dashboard metric queries and briefly caches collector failure', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ status: 'success', data: { resultType: 'vector', result: [] } })))
    vi.stubGlobal('fetch', fetcher)
    const s = await setup('http://metrics.example'); await s.promote()
    const read = (url: string) => s.app.inject({ url, cookies: s.cookies })
    const replies = await Promise.all([read('/v1/admin/providers/health'), read('/v1/admin/providers/metrics')])
    expect(replies.every(reply => reply.statusCode === 200)).toBe(true)
    expect(replies[1]!.json().available).toBe(true)
    expect(fetcher).toHaveBeenCalledTimes(13)
    await read('/v1/admin/providers/metrics')
    expect(fetcher).toHaveBeenCalledTimes(13)
    vi.useFakeTimers({ toFake: ['Date'] }); vi.advanceTimersByTime(15001)
    fetcher.mockImplementation(async () => new Response('', { status: 503 }))
    const offline = await Promise.all([read('/v1/admin/providers/health'), read('/v1/admin/providers/metrics')])
    expect(offline[1]!.json().available).toBe(false)
    expect(fetcher).toHaveBeenCalledTimes(26)
    await read('/v1/admin/providers/metrics')
    expect(fetcher).toHaveBeenCalledTimes(26)
  })
})
