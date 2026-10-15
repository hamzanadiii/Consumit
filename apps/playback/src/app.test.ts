import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it, expect, vi } from 'vitest'
import { loadEnv } from '../../api/src/config/env.ts'
import { buildPlaybackApp } from './app'
import * as configuredProviders from '../../api/src/playback/configured-providers.ts'

const secret = 'fixture-internal-service-secret-longer-than-32'
const apps: Awaited<ReturnType<typeof buildPlaybackApp>>[] = [], files: string[] = [], directories: string[] = []
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); for (const path of files.splice(0)) await unlink(path); for (const directory of directories.splice(0)) await rmdir(directory); vi.restoreAllMocks() })
async function fixture(extraProviders: Array<Record<string, unknown>> = []) {
  const directory = await mkdtemp(join(tmpdir(), 'consumit-rebuild-')), file = join(directory, 'providers.json')
  directories.push(directory); files.push(file)
  await writeFile(file, JSON.stringify([{ id: 'fixture', adapter: 'static', enabled: true, regions: ['US'], mediaKinds: ['movie'], mediaHosts: ['media.example'], upstreamGroup: 'fixture', entries: [{ ref: { kind: 'movie', id: 1 }, sources: [{ key: 'main', url: 'https://media.example/movie.mp4', type: 'native', language: 'en', headers: {}, subtitles: [], expiresAt: '2099-01-01T00:00:00.000Z' }] }] }, ...extraProviders]))
  const fetcher = vi.fn<typeof fetch>(async input => new Response(JSON.stringify(new URL(String(input)).pathname.endsWith('/config') ? { revision: 0, overrides: {} } : {}), { headers: { 'content-type': 'application/json' } }))
  const env = loadEnv({ NODE_ENV: 'test', APPLICATION_MODE: 'playback', APP_ORIGIN: 'http://localhost:3000', INTERNAL_API_ORIGIN: 'http://api.example', INTERNAL_SERVICE_SECRET: secret, PLAYBACK_ENABLED: 'true', PLAYBACK_MEDIA_CONFIG: file, PLAYBACK_PROBE_INTERVAL_MINUTES: '0' })
  const app = await buildPlaybackApp(env, fetcher); apps.push(app)
  return { app, fetcher }
}
describe('isolated playback application', () => {
  it('initializes canonical-identity and title adapters through product RPCs without a catalog credential', async () => {
    const loaded = vi.spyOn(configuredProviders, 'loadConfiguredProviders')
    const providers = ['vaplayer', 'cinehd', 'filmu', 'filmuainary', 'wecollege', 'purstream', 'cinejoylisbon', 'lookmovie', 'castletv', 'bingebangymovies', 'kisskh', 'videasy'].map(adapter => ({ id: adapter, adapter, enabled: false, regions: ['US'], mediaKinds: ['movie'], mediaHosts: ['media.example'], upstreamGroup: adapter }))
    const { app, fetcher } = await fixture(providers)
    expect((await app.inject({ url: '/health/ready' })).statusCode).toBe(200)
    fetcher.mockResolvedValueOnce(Response.json({ imdbId: 'tt0903747' }))
    const identity = loaded.mock.calls[0]?.[1]?.tmdbIdentityResolver
    expect(identity).toBeDefined()
    const ref = { kind: 'series' as const, id: 1396, season: 1, episode: 1 }
    expect(await identity!(ref, new AbortController().signal)).toEqual({ imdbId: 'tt0903747' })
    expect(JSON.parse(String(fetcher.mock.lastCall?.[1]?.body))).toEqual({ mode: 'worker', providerId: 'vaplayer', ref })
  })
  it('retains guest cookies, session ownership, canonical identity, and refresh DTOs', async () => {
    const { app } = await fixture(), headers = { origin: 'http://localhost:3000' }
    const result = await app.inject({ method: 'POST', url: '/v1/playback/resolve', headers, payload: { ref: { kind: 'movie', id: 1 }, audioLanguage: 'en', capabilities: { native: true, hls: true, dash: false, nativeHls: false } } })
    expect(result.statusCode).toBe(200)
    const session = result.json()
    expect(session.ref).toEqual({ kind: 'movie', id: 1 })
    expect(session.source).toMatchObject({ providerId: 'fixture', delivery: 'direct', src: 'https://media.example/movie.mp4' })
    const token = result.cookies.find(cookie => cookie.name === 'consumit-playback')?.value
    expect(token).toMatch(/^[a-f0-9]{64}$/)
    const request = { method: 'POST' as const, url: `/v1/playback/${session.id}/refresh`, headers, payload: { sourceId: session.source.id, reason: 'expired' } }
    expect((await app.inject(request)).statusCode).toBe(401)
    const refreshed = await app.inject({ ...request, cookies: { 'consumit-playback': token! } })
    expect(refreshed.statusCode).toBe(200); expect(refreshed.json().id).toBe(session.id)
  })
  it('rejects unauthenticated internal commands and arbitrary diagnostic routes', async () => {
    const { app } = await fixture()
    expect((await app.inject({ method: 'POST', url: '/v1/internal/playback/diagnostics', payload: { operation: 'providers.health' } })).statusCode).toBe(403)
    const result = await app.inject({ method: 'POST', url: '/v1/internal/playback/diagnostics', headers: { authorization: `Bearer ${secret}` }, payload: { method: 'POST', path: '/v1/admin/members/one/role', body: { role: 'admin' } } })
    expect(result.statusCode).toBe(400)
    const operation = await app.inject({ method: 'POST', url: '/v1/internal/playback/diagnostics', headers: { authorization: `Bearer ${secret}` }, payload: { operation: 'providers.health' } })
    expect(operation.statusCode).toBe(200)
    expect((await app.inject({ url: '/v1/admin/members/one/role' })).statusCode).toBe(404)
    expect((await app.inject({ url: '/v1/me' })).statusCode).toBe(404)
    expect((await app.inject({ url: '/v1/subtitles/preferences?kind=movie&id=1' })).statusCode).toBe(404)
  })
  it('publishes public playback contracts without private operation paths', async () => {
    const { app } = await fixture(), result = await app.inject({ url: '/v1/playback/openapi.json' })
    expect(result.statusCode).toBe(200)
    expect(result.json().paths['/v1/playback/resolve']).toBeDefined()
    expect(Object.keys(result.json().paths).some(path => path.startsWith('/v1/internal/') || path.startsWith('/v1/admin/'))).toBe(false)
  })
})
