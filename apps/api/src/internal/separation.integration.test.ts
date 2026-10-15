import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { buildApp } from '../app'
import { buildPlaybackApp } from '../../../playback/src/app.ts'
import { loadEnv } from '../config/env'
import { createFakeCatalog } from '../catalog/fake-catalog'
import { createDbClient } from '../db/client'
import { hashPassword } from '../identity/password'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test')) throw new Error('Use a dedicated rebuild test database.')
const db = createDbClient(databaseUrl), secret = 'rebuild-fixture-internal-secret-at-least-32'
let api: Awaited<ReturnType<typeof buildApp>>, playback: Awaited<ReturnType<typeof buildPlaybackApp>>, directory: string, providerFile: string
beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'consumit-process-test-')); providerFile = join(directory, 'providers.json')
  await writeFile(providerFile, JSON.stringify([{ id: 'fixture', adapter: 'static', regions: ['US'], mediaKinds: ['movie'], mediaHosts: ['media.example'], upstreamGroup: 'fixture', entries: [{ ref: { kind: 'movie', id: 550 }, sources: [{ key: 'main', url: 'https://media.example/movie.mp4', type: 'native', language: 'en', headers: {}, subtitles: [], expiresAt: '2099-01-01T00:00:00.000Z' }] }] }]))
  await db.prisma.member.create({ data: { email: 'rebuild-flow@example.com', emailVerifiedAt: new Date(), credential: { create: { passwordHash: await hashPassword('RebuildFlowPassword123!') } }, profile: { create: { username: 'rebuild_flow', visibility: 'private' } } } })
  const common = { NODE_ENV: 'test', APP_ORIGIN: 'http://localhost:3000', INTERNAL_SERVICE_SECRET: secret, PLAYBACK_ENABLED: 'true', PLAYBACK_MEDIA_CONFIG: providerFile, PLAYBACK_PROBE_INTERVAL_MINUTES: '0', BACKGROUND_JOBS_ENABLED: 'true' }
  api = await buildApp({ catalog: createFakeCatalog(), env: loadEnv({ ...common, APPLICATION_MODE: 'product', INTERNAL_PLAYBACK_ORIGIN: 'http://playback.example', DATABASE_URL: databaseUrl, VALKEY_URL: process.env.VALKEY_URL, AUTH_CODE_PEPPER: 'fixture-auth-pepper-at-least-32-characters', RESEND_API_KEY: 'fixture', AUTH_EMAIL_FROM: 'Consumit <fixture@example.com>' }) })
  const fetcher: import('@consumit/server').InternalFetch = async (input, init) => {
    const response = await api.inject({ method: 'POST', url: new URL(String(input)).pathname, headers: { authorization: String((init?.headers as Record<string, string>).authorization), 'content-type': 'application/json' }, payload: String(init?.body) })
    return new Response(response.body, { status: response.statusCode, headers: { 'content-type': 'application/json' } })
  }
  playback = await buildPlaybackApp(loadEnv({ ...common, APPLICATION_MODE: 'playback', INTERNAL_API_ORIGIN: 'http://api.example' }), fetcher)
}, 15000)
afterAll(async () => { await playback?.close(); await api?.close(); await db.prisma.member.deleteMany({ where: { email: 'rebuild-flow@example.com' } }); await db.close(); if (providerFile) await unlink(providerFile); if (directory) await rmdir(directory) })
describe('product and playback separation with durable member records', () => {
  it('browses, signs in, resolves, saves, and resumes through the preserved interfaces', async () => {
    expect((await api.inject({ url: '/v1/titles/discover?kind=movie' })).statusCode).toBe(200)
    const headers = { origin: 'http://localhost:3000' }
    const login = await api.inject({ method: 'POST', url: '/v1/auth/login', headers, payload: { email: 'rebuild-flow@example.com', password: 'RebuildFlowPassword123!' } })
    expect(login.statusCode).toBe(200)
    const sessionCookie = login.cookies.find(cookie => cookie.name === 'consumit_session')!
    const cookies = { [sessionCookie.name]: sessionCookie.value }
    const resolved = await playback.inject({ method: 'POST', url: '/v1/playback/resolve', headers, payload: { ref: { kind: 'movie', id: 550 }, audioLanguage: 'en', capabilities: { native: true, hls: true, dash: false, nativeHls: false } } })
    expect(resolved.statusCode).toBe(200)
    expect((await api.inject({ method: 'PUT', url: '/v1/me/library/titles/movie/550', headers, cookies })).statusCode).toBe(204)
    expect((await api.inject({ method: 'PUT', url: '/v1/progress', headers, cookies, payload: { kind: 'movie', id: 550, positionSeconds: 37, durationSeconds: 120 } })).statusCode).toBe(200)
    const progress = await api.inject({ url: '/v1/progress/movie/550', cookies })
    expect(progress.json()).toMatchObject({ kind: 'movie', id: 550, positionSeconds: 37 })
    expect(progress.headers['cache-control']).toBe('private, no-store')
    expect(await db.prisma.outboxEvent.count({ where: { payload: { path: ['type'], equals: 'release.tracking.v1' } } })).toBeGreaterThan(0)
  })
  it('keeps product routes available when playback is closed and rejects unauthenticated internal commands', async () => {
    await playback.close()
    expect((await api.inject({ url: '/v1/titles/discover?kind=movie' })).statusCode).toBe(200)
    expect((await api.inject({ url: '/v1/playback/providers' })).statusCode).toBe(404)
    expect((await api.inject({ method: 'POST', url: '/v1/internal/playback/config' })).statusCode).toBe(403)
  })
})
