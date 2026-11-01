import { afterEach, describe, expect, it, vi } from 'vitest'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import { createStaticProvider, type ProviderRegistration } from '@consumit/provider-sdk'
import { frameDiagnosticsSchema } from '@consumit/contracts'
import { createPlayback } from './playback.ts'
import { registerPlaybackRoutes } from './routes.ts'
import { createMemoryPlaybackStore } from './state.ts'
import { registerErrorHandlers } from '../http/errors.ts'

const counters = vi.hoisted(() => new Map<string, ReturnType<typeof vi.fn>>())
vi.mock('@opentelemetry/api', async importOriginal => {
  const original = await importOriginal<typeof import('@opentelemetry/api')>()
  return { ...original, metrics: { ...original.metrics, getMeter: () => ({ createCounter(name: string) { const add = vi.fn(); counters.set(name, add); return { add } }, createGauge: () => ({ record: vi.fn() }), createHistogram: () => ({ record: vi.fn() }) }) } }
})
const ref = { kind: 'movie' as const, id: 550 }
const input = { ref, audioLanguage: 'en', capabilities: { hls: true, dash: false, native: true, nativeHls: false } }
const signal = new AbortController().signal
const apps: ReturnType<typeof Fastify>[] = []
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); counters.clear() })
function fixture() {
  const providers: ProviderRegistration[] = ['direct', 'vidriftframe'].map(id => ({ adapter: createStaticProvider(id, [{ ref, sources: [{ key: 'main', url: 'https://embed.vidrift.net/embed/movie/550', type: id === 'direct' ? 'native' : 'iframe', language: 'original', expiresAt: '2099-01-01T00:00:00.000Z', headers: {}, subtitles: [] }] }]), enabled: true, deliveryMode: id === 'direct' ? 'direct' : 'embed', mediaKinds: ['movie'], approvedRegions: ['US'], mediaHosts: ['embed.vidrift.net'], upstreamGroup: id, concurrency: 2, requestsPerMinute: 60 }))
  const store = createMemoryPlaybackStore()
  const playback = createPlayback({ providers, store, region: 'US' })
  return { playback, store }
}
describe('external reports stay separate from native playback', () => {
  it('requires owned current supported iframe and records only low-cardinality reported counters', async () => {
    const { playback, store } = fixture()
    const native = await playback.resolve('owner', input, signal)
    const batch = { sourceId: native.source.id, events: [{ type: 'playing' as const, browser: 'chrome' as const }] }
    await expect(playback.frameDiagnostics!('owner', native.id, batch)).rejects.toMatchObject({ code: 'BAD_REQUEST' })
    const frame = await playback.switchProvider('owner', native.id, 'vidriftframe', signal)
    batch.sourceId = frame.source.id
    await expect(playback.frameDiagnostics!('other', frame.id, batch)).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(playback.frameDiagnostics!('owner', frame.id, { ...batch, sourceId: 'stale' })).rejects.toMatchObject({ code: 'CONFLICT' })
    const set = vi.spyOn(store, 'set')
    await playback.frameDiagnostics!('owner', frame.id, batch)
    await playback.frameDiagnostics!('owner', frame.id, batch)
    expect(counters.get('playback.frame.reported')).toHaveBeenCalledExactlyOnceWith(1, { provider: 'vidriftframe', kind: 'movie', region: 'US', delivery: 'embed', browser: 'chrome', event: 'playing' })
    expect(counters.get('playback.events')).not.toHaveBeenCalled()
    expect(counters.get('playback.viewing.duration')).not.toHaveBeenCalled()
    expect(set).not.toHaveBeenCalled()
    await playback.events('owner', frame.id, { events: [{ type: 'started', position: 20 }] })
    expect(counters.get('playback.events')).not.toHaveBeenCalled()
  })
  it('bounds the schema and rejects raw messages, positions, URLs and unknown labels', () => {
    const batch = { sourceId: 'source', events: [{ type: 'progress', browser: 'chrome' }] }
    expect(frameDiagnosticsSchema.safeParse(batch).success).toBe(true)
    for (const value of [{ ...batch, url: 'https://secret.test' }, { ...batch, events: Array.from({ length: 21 }, () => batch.events[0]) }, { ...batch, events: [{ type: 'started', browser: 'chrome' }] }, { ...batch, events: [{ ...batch.events[0], position: 100 }] }, { ...batch, events: [{ type: 'progress', browser: 'arbitrary-agent' }] }]) expect(frameDiagnosticsSchema.safeParse(value).success).toBe(false)
  })
  it('guards origin and playback cookie before accepting a strict route batch', async () => {
    const app = Fastify(); apps.push(app); await app.register(cookie)
    registerErrorHandlers(app)
    const { playback } = fixture()
    registerPlaybackRoutes(app, { playback, origin: 'http://localhost:8080', secure: false })
    const headers = { origin: 'http://localhost:8080' }
    const resolved = await app.inject({ method: 'POST', url: '/v1/playback/resolve', headers, payload: { ...input, providerId: 'vidriftframe' } })
    expect(resolved.statusCode).toBe(200)
    const session = resolved.json()
    const cookies = { 'consumit-playback': resolved.cookies[0]!.value }
    const payload = { sourceId: session.source.id, events: [{ type: 'paused', browser: 'other' }] }
    const url = `/v1/playback/${session.id}/frame-diagnostics`
    expect((await app.inject({ method: 'POST', url, headers, cookies, payload })).statusCode).toBe(204)
    expect((await app.inject({ method: 'POST', url, headers, cookies, payload: { ...payload, secret: 'no' } })).statusCode).toBe(400)
    expect((await app.inject({ method: 'POST', url, headers: { origin: 'https://evil.test' }, cookies, payload })).statusCode).not.toBe(204)
    expect((await app.inject({ method: 'POST', url, headers, payload })).statusCode).not.toBe(204)
  })
})
