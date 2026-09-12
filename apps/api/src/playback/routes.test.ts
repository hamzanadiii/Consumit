import { afterEach, describe, expect, it } from 'vitest'
import { createStaticProvider, type ProviderRegistration, type ProviderSource } from '@consumit/provider-sdk'
import { buildApp } from '../app.ts'
import { loadEnv } from '../config/env.ts'
import { createPlayback } from './playback.ts'
import { createMemoryPlaybackStore } from './state.ts'

const ref = { kind: 'movie' as const, id: 1 }
const track = { id: 'en', label: 'English', language: 'en', url: 'https://media.example/subs/en.vtt', format: 'vtt' as const }
const source: ProviderSource = { key: 'main', url: 'https://media.example/video.mp4', type: 'native', language: 'original', expiresAt: '2099-01-01T00:00:00.000Z', headers: {}, subtitles: [track] }
const body = { ref, capabilities: { hls: true, dash: false, native: true, nativeHls: false }, audioLanguage: 'en' }
const apps: Awaited<ReturnType<typeof buildApp>>[] = []
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())) })
async function setup() {
  const store = createMemoryPlaybackStore()
  const providers: ProviderRegistration[] = ['primary', 'backup'].map((id) => ({ adapter: createStaticProvider(id, [{ ref, sources: [id === 'primary' ? source : { ...source, subtitles: [] }] }]), enabled: true, approvedRegions: ['US'], mediaHosts: ['media.example'], upstreamGroup: id, concurrency: 2, requestsPerMinute: 30, ...(id === 'primary' ? { priority: 1 } : {}) }))
  const app = await buildApp({ env: loadEnv({ NODE_ENV: 'test' }), playback: createPlayback({ providers, store, region: 'US' }) })
  apps.push(app)
  return app
}
describe('playback session API', () => {
  it('resolves guests, renews access, falls back, and rejects another guest', async () => {
    const app = await setup()
    const resolved = await app.inject({ method: 'POST', url: '/v1/playback/resolve', headers: { origin: 'http://localhost:3000' }, payload: body })
    expect(resolved.statusCode).toBe(200)
    const session = resolved.json()
    expect(session.source.providerId).toBe('primary')
    expect(session.source.headers).toBeUndefined()
    const cookie = resolved.cookies[0]!
    expect(cookie.httpOnly).toBe(true)
    const headers = { origin: 'http://localhost:3000', cookie: `${cookie.name}=${cookie.value}` }
    const refreshed = await app.inject({ method: 'POST', url: `/v1/playback/${session.id}/refresh`, headers, payload: { sourceId: session.source.id, reason: 'expired' } })
    expect(refreshed.statusCode).toBe(200)
    expect(refreshed.json().source.id).toBe(session.source.id)
    const failed = await app.inject({ method: 'POST', url: `/v1/playback/${session.id}/fallback`, headers, payload: { sourceId: session.source.id, reason: 'network' } })
    expect(failed.statusCode).toBe(200)
    expect(failed.json().source.providerId).toBe('backup')
    const intruder = await app.inject({ method: 'POST', url: `/v1/playback/${session.id}/fallback`, headers: { ...headers, cookie: `${cookie.name}=${'a'.repeat(64)}` }, payload: { sourceId: session.source.id, reason: 'network' } })
    expect(intruder.statusCode).toBe(404)
    const fallbackSession = failed.json()
    for (let attempt = 0; attempt < 4; attempt++) {
      const exhausted = await app.inject({ method: 'POST', url: `/v1/playback/${session.id}/fallback`, headers, payload: { sourceId: fallbackSession.source.id, reason: 'network' } })
      expect(exhausted.statusCode).toBe(503)
    }
    const current = await app.inject({ method: 'POST', url: `/v1/playback/${session.id}/refresh`, headers, payload: { sourceId: 'stale-source-id', reason: 'expired' } })
    expect(current.json().fallbackCount).toBe(3)
  })
  it('aggregates caption tracks at resolve and keeps them across fallback', async () => {
    const app = await setup()
    const resolved = await app.inject({ method: 'POST', url: '/v1/playback/resolve', headers: { origin: 'http://localhost:3000' }, payload: body })
    expect(resolved.statusCode).toBe(200)
    const session = resolved.json()
    expect(session.source.subtitles).toMatchObject([{ id: 'en', url: 'https://media.example/subs/en.vtt', format: 'vtt' }])
    const cookie = resolved.cookies[0]!
    const headers = { origin: 'http://localhost:3000', cookie: `${cookie.name}=${cookie.value}` }
    const failed = await app.inject({ method: 'POST', url: `/v1/playback/${session.id}/fallback`, headers, payload: { sourceId: session.source.id, reason: 'network' } })
    expect(failed.statusCode).toBe(200)
    expect(failed.json().source.providerId).toBe('backup')
    expect(failed.json().source.subtitles).toMatchObject([{ id: 'en', url: 'https://media.example/subs/en.vtt', format: 'vtt' }])
  })
  it('returns direct subtitles for every answering provider', async () => {
    const store = createMemoryPlaybackStore()
    const frTrack = { id: 'fr', label: 'French', language: 'fr', url: 'https://media.example/subs/fr.vtt', format: 'vtt' as const }
    const providers: ProviderRegistration[] = ['primary', 'backup'].map((id) => ({ adapter: createStaticProvider(id, [{ ref, sources: [id === 'primary' ? source : { ...source, subtitles: [frTrack] }] }]), enabled: true, approvedRegions: ['US'], mediaHosts: ['media.example'], upstreamGroup: id, concurrency: 2, requestsPerMinute: 30 }))
    const app = await buildApp({ env: loadEnv({ NODE_ENV: 'test' }), playback: createPlayback({ providers, store, region: 'US' }) })
    apps.push(app)
    const listed = await app.inject({ method: 'POST', url: '/v1/playback/providers', headers: { origin: 'http://localhost:3000' }, payload: body })
    expect(listed.statusCode).toBe(200)
    const byId = Object.fromEntries(listed.json().providers.map((entry: { id: string }) => [entry.id, entry])) as Record<string, { subtitles: { id: string; url: string; format: string }[] }>
    expect(byId.primary!.subtitles).toMatchObject([{ id: 'en', format: 'vtt' }])
    expect(byId.primary!.subtitles[0]!.url).toBe(track.url)
    expect(byId.backup!.subtitles).toMatchObject([{ id: 'fr', format: 'vtt' }])
    await store.close()
  })
  it('lists available providers and switches sessions between them', async () => {
    const app = await setup()
    const listed = await app.inject({ method: 'POST', url: '/v1/playback/providers', headers: { origin: 'http://localhost:3000' }, payload: body })
    expect(listed.statusCode).toBe(200)
    expect(listed.json().providers.map((entry: { id: string }) => entry.id).sort()).toEqual(['backup', 'primary'])
    const resolved = await app.inject({ method: 'POST', url: '/v1/playback/resolve', headers: { origin: 'http://localhost:3000' }, payload: body })
    const session = resolved.json()
    expect(session.source.providerId).toBe('primary')
    const cookie = resolved.cookies[0]!
    const headers = { origin: 'http://localhost:3000', cookie: `${cookie.name}=${cookie.value}` }
    const same = await app.inject({ method: 'POST', url: `/v1/playback/${session.id}/switch`, headers, payload: { providerId: 'primary' } })
    expect(same.statusCode).toBe(200)
    expect(same.json().source.providerId).toBe('primary')
    const switched = await app.inject({ method: 'POST', url: `/v1/playback/${session.id}/switch`, headers, payload: { providerId: 'backup' } })
    expect(switched.statusCode).toBe(200)
    expect(switched.json().id).toBe(session.id)
    expect(switched.json().source.providerId).toBe('backup')
    expect(switched.json().fallbackCount).toBe(0)
    // Manual switches never consume the automatic fallback budget: switching
    // back and forth stays available.
    const back = await app.inject({ method: 'POST', url: `/v1/playback/${session.id}/switch`, headers, payload: { providerId: 'primary' } })
    expect(back.statusCode).toBe(200)
    expect(back.json().source.providerId).toBe('primary')
    const forth = await app.inject({ method: 'POST', url: `/v1/playback/${session.id}/switch`, headers, payload: { providerId: 'backup' } })
    expect(forth.statusCode).toBe(200)
    expect(forth.json().source.providerId).toBe('backup')
    const unknown = await app.inject({ method: 'POST', url: `/v1/playback/${session.id}/switch`, headers, payload: { providerId: 'nope' } })
    expect(unknown.statusCode).toBe(400)
  })
  it('rejects cross-site resolution and incomplete episode identities', async () => {
    const app = await setup()
    expect((await app.inject({ method: 'POST', url: '/v1/playback/resolve', headers: { origin: 'https://evil.example' }, payload: body })).statusCode).toBe(403)
    expect((await app.inject({ method: 'POST', url: '/v1/playback/resolve', headers: { origin: 'http://localhost:3000' }, payload: { ...body, ref: { kind: 'series', id: 1 } } })).statusCode).toBe(400)
    const invalidJson = await app.inject({ method: 'POST', url: '/v1/playback/resolve', headers: { origin: 'http://localhost:3000', 'content-type': 'application/json' }, payload: '{' })
    expect(invalidJson.statusCode).toBe(400)
    expect(invalidJson.json()).toMatchObject({ error: { code: 'BAD_REQUEST' } })
  })
})
