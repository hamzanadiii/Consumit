import { afterEach, describe, expect, it, vi } from 'vitest'
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
  const providers: ProviderRegistration[] = ['primary', 'backup'].map((id) => ({ adapter: createStaticProvider(id, [{ ref, sources: [id === 'primary' ? source : { ...source, subtitles: [] }] }]), enabled: true, approvedRegions: ['US'], mediaHosts: ['media.example'], upstreamGroup: id, concurrency: 2, requestsPerMinute: 30,  mediaKinds: ['movie', 'series'] as const, ...(id === 'primary' ? { priority: 1 } : {}) }))
  const app = await buildApp({ env: loadEnv({ NODE_ENV: 'test' }), playback: createPlayback({ providers, store, region: 'US' }) })
  apps.push(app)
  return app
}
describe('playback session API', () => {
  it.each([
    { delivery: 'proxy', src: source.url },
    { delivery: 'auto', src: source.url },
    { delivery: 'direct', src: 'https://relay.example/proxy?url=https%3A%2F%2Fmedia.example%2Fvideo.mp4' },
  ])('requires a fresh session for obsolete stored delivery $delivery ($src)', async (legacySource) => {
    const store = createMemoryPlaybackStore()
    const providers: ProviderRegistration[] = [{
      adapter: createStaticProvider('primary', [{ ref, sources: [source] }]), enabled: true,
      approvedRegions: ['US'], mediaHosts: ['media.example'], upstreamGroup: 'primary',
      concurrency: 2, requestsPerMinute: 30, mediaKinds: ['movie'],
    }]
    try {
      const playback = createPlayback({ providers, store, region: 'US' })
      const session = await playback.resolve('viewer', body, new AbortController().signal)
      const raw = await store.get(`session:${session.id}`)
      const record = JSON.parse(raw!)
      record.session.source = { ...record.session.source, ...legacySource }
      await store.set(`session:${session.id}`, JSON.stringify(record), 3600)
      await expect(playback.recover('viewer', session.id, { sourceId: 'stale-source-id', reason: 'expired' }, true, new AbortController().signal))
        .rejects.toMatchObject({ code: 'NOT_FOUND', retryable: true })
    } finally { await store.close() }
  })
  it('continues after the selected provider without retrying an earlier miss', async () => {
    const store = createMemoryPlaybackStore()
    const providers: ProviderRegistration[] = ['first', 'second', 'third'].map((id) => ({
      adapter: createStaticProvider(id, [{ ref, sources: id === 'first' ? [] : [source] }]),
      enabled: true, approvedRegions: ['US'], mediaHosts: ['media.example'], upstreamGroup: id,
      concurrency: 2, requestsPerMinute: 30,  mediaKinds: ['movie'],
    }))
    const first = vi.spyOn(providers[0]!.adapter, 'resolve')
    const playback = createPlayback({ providers, store, region: 'US', providerOrders: { movie: ['first', 'second', 'third'], series: [], anime: [] } })
    const session = await playback.resolve('viewer', body, new AbortController().signal)
    expect(session.source.providerId).toBe('second')
    const fallback = await playback.recover('viewer', session.id, { sourceId: session.source.id, reason: 'network' }, false, new AbortController().signal)
    expect(fallback.source.providerId).toBe('third')
    expect(first).toHaveBeenCalledTimes(1)
    await store.close()
  })
  it('can return to a recovered provider after the fallback window expires', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const store = createMemoryPlaybackStore()
    try {
      const providers: ProviderRegistration[] = ['first', 'second'].map((id) => ({
        adapter: createStaticProvider(id, [{ ref, sources: [source] }]), enabled: true,
        approvedRegions: ['US'], mediaHosts: ['media.example'], upstreamGroup: id,
        concurrency: 2, requestsPerMinute: 30,  mediaKinds: ['movie'],
      }))
      const playback = createPlayback({ providers, store, region: 'US', providerOrders: { movie: ['first', 'second'], series: [], anime: [] } })
      const first = await playback.resolve('viewer', body, new AbortController().signal)
      expect(first.source.providerId).toBe('first')
      const second = await playback.recover('viewer', first.id, { sourceId: first.source.id, reason: 'network' }, false, new AbortController().signal)
      expect(second.source.providerId).toBe('second')
      vi.setSystemTime(Date.now() + 11 * 60_000)
      const recovered = await playback.recover('viewer', second.id, { sourceId: second.source.id, reason: 'network' }, false, new AbortController().signal)
      expect(recovered.source.providerId).toBe('first')
      expect(recovered.fallbackCount).toBe(1)
    } finally { vi.useRealTimers(); await store.close() }
  })
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
  it('lists the fixed fleet without resolving providers', async () => {
    const store = createMemoryPlaybackStore()
    const frTrack = { id: 'fr', label: 'French', language: 'fr', url: 'https://media.example/subs/fr.vtt', format: 'vtt' as const }
    const providers: ProviderRegistration[] = ['primary', 'backup'].map((id) => ({ adapter: createStaticProvider(id, [{ ref, sources: [id === 'primary' ? source : { ...source, subtitles: [frTrack] }] }]), enabled: true, approvedRegions: ['US'], mediaHosts: ['media.example'], upstreamGroup: id, concurrency: 2, requestsPerMinute: 30,  mediaKinds: ['movie', 'series'] as const }))
    const app = await buildApp({ env: loadEnv({ NODE_ENV: 'test' }), playback: createPlayback({ providers, store, region: 'US' }) })
    apps.push(app)
    const listed = await app.inject({ method: 'POST', url: '/v1/playback/providers', headers: { origin: 'http://localhost:3000' }, payload: body })
    expect(listed.statusCode).toBe(200)
    const byId = Object.fromEntries(listed.json().providers.map((entry: { id: string }) => [entry.id, entry])) as Record<string, { available: boolean; subtitles: unknown[]; health: string }>
    // No upstream work: the fleet lists with breaker health only. Captions
    // arrive with the played source plus the aggregated engine tracks.
    expect(byId.primary!.available).toBe(true)
    expect(byId.backup!.available).toBe(true)
    expect(byId.primary!.subtitles).toEqual([])
    expect(byId.primary!.health).toBe('ok')
    await store.close()
  })
  it('lists the whole fleet without resolving, answering or not', async () => {
    const store = createMemoryPlaybackStore()
    const providers: ProviderRegistration[] = [
      { adapter: createStaticProvider('primary', [{ ref, sources: [source] }]), enabled: true, approvedRegions: ['US'], mediaHosts: ['media.example'], upstreamGroup: 'primary', concurrency: 2, requestsPerMinute: 30,  mediaKinds: ['movie', 'series'] as const },
      { adapter: createStaticProvider('ghost', [{ ref: { kind: 'movie', id: 999 }, sources: [source] }]), enabled: true, approvedRegions: ['US'], mediaHosts: ['media.example'], upstreamGroup: 'ghost', concurrency: 2, requestsPerMinute: 30,  mediaKinds: ['movie', 'series'] as const },
    ]
    const app = await buildApp({ env: loadEnv({ NODE_ENV: 'test' }), playback: createPlayback({ providers, store, region: 'US' }) })
    apps.push(app)
    const listed = await app.inject({ method: 'POST', url: '/v1/playback/providers', headers: { origin: 'http://localhost:3000' }, payload: body })
    expect(listed.statusCode).toBe(200)
    const byId = Object.fromEntries(listed.json().providers.map((entry: { id: string }) => [entry.id, entry])) as Record<string, { available: boolean; detail?: string }>
    // Even the ghost (nothing for this title) lists: tapping it attempts a
    // fresh resolve and auto-advances on failure.
    expect(byId.primary!.available).toBe(true)
    expect(byId.ghost!.available).toBe(true)
    expect(byId.ghost!.detail).toBeUndefined()
    await store.close()
  })
  it('lists available providers and switches sessions between them', async () => {
    const app = await setup()
    const listed = await app.inject({ method: 'POST', url: '/v1/playback/providers', headers: { origin: 'http://localhost:3000' }, payload: body })
    expect(listed.statusCode).toBe(200)
    expect(listed.json().providers.map((entry: { id: string }) => entry.id).sort()).toEqual(['backup', 'primary'])
    expect(listed.json().providers.find((entry: { id: string }) => entry.id === 'primary')).toMatchObject({ regions: ['US'], health: 'ok' })
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
  it('lists direct providers and rejects unknown delivery failures', async () => {
    const store = createMemoryPlaybackStore()
    const providers: ProviderRegistration[] = [
      { adapter: createStaticProvider('direct', [{ ref, sources: [source] }]), enabled: true, approvedRegions: ['US'], mediaHosts: ['media.example'], upstreamGroup: 'direct', concurrency: 2, requestsPerMinute: 30,   mediaKinds: ['movie'] },
      { adapter: createStaticProvider('preferred', [{ ref, sources: [source] }]), enabled: true, approvedRegions: ['US'], mediaHosts: ['media.example'], upstreamGroup: 'preferred', concurrency: 2, requestsPerMinute: 30,   mediaKinds: ['movie'] },
      { adapter: createStaticProvider('required', [{ ref, sources: [source] }]), enabled: true, approvedRegions: ['US'], mediaHosts: ['media.example'], upstreamGroup: 'required', concurrency: 2, requestsPerMinute: 30,   mediaKinds: ['movie'] },
    ]
    const app = await buildApp({ env: loadEnv({ NODE_ENV: 'test' }), playback: createPlayback({
      providers, store, region: 'US',
    }) })
    apps.push(app)
    const listed = await app.inject({ method: 'POST', url: '/v1/playback/providers', headers: { origin: 'http://localhost:3000' }, payload: body })
    expect(listed.statusCode).toBe(200)
    expect(listed.json().providers.map((entry: { id: string }) => entry.id)).toEqual(['direct', 'preferred', 'required'])
    expect(listed.json().providers.find((entry: { id: string }) => entry.id === 'preferred')).toMatchObject({  })
    const resolved = await app.inject({ method: 'POST', url: '/v1/playback/resolve', headers: { origin: 'http://localhost:3000' }, payload: body })
    expect(resolved.json().source.providerId).toBe('direct')
    const session = resolved.json()
    const cookie = resolved.cookies[0]!
    const headers = { origin: 'http://localhost:3000', cookie: `${cookie.name}=${cookie.value}` }
    const bogus = await app.inject({ method: 'POST', url: `/v1/playback/${session.id}/fallback`, headers, payload: { sourceId: session.source.id, reason: 'network', deliveryFailure: 'nope' } })
    expect(bogus.statusCode).toBe(400)
    await store.close()
  })
  it('cools definitively-failed providers five times longer than transient ones', async () => {
    for (const [reason, expectedMs] of [['unsupported', 300_000], ['network', 60_000]] as const) {
      const store = createMemoryPlaybackStore()
      const providers: ProviderRegistration[] = [{ adapter: createStaticProvider('solo', [{ ref, sources: [source] }]), enabled: true, approvedRegions: ['US'], mediaHosts: ['media.example'], upstreamGroup: 'solo', concurrency: 2, requestsPerMinute: 30,  mediaKinds: ['movie'] }]
      const playback = createPlayback({ providers, store, region: 'US' })
      const signal = new AbortController().signal
      const session = await playback.resolve('viewer', body, signal)
      providers[0]!.adapter.resolve = async () => ({ ok: false as const, code: 'empty' as const, retryable: false })
      const before = Date.now()
      for (let attempt = 0; attempt < 3; attempt++) {
        await playback.recover('viewer', session.id, { sourceId: session.source.id, reason }, true, signal).catch(() => undefined)
      }
      const status = playback.providerStatus!('movie').find((entry) => entry.id === 'solo')!
      expect(status.openUntil - before).toBeGreaterThanOrEqual(expectedMs - 5000)
      expect(status.openUntil - before).toBeLessThanOrEqual(expectedMs + 5000)
      await store.close()
    }
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
