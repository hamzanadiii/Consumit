import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import { Readable } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createStaticProvider } from '@consumit/provider-sdk'
import { createGrantCodec } from '@consumit/media-relay'
import { playbackOwner } from '@consumit/media-relay/authorization'
import { registerErrorHandlers } from '../http/errors.ts'
import { createPlayback } from './playback.ts'
import { createPlaybackRelay } from './relay.ts'
import { registerPlaybackRoutes } from './routes.ts'
import { createMemoryPlaybackStore } from './state.ts'
import { createPlaybackVerification } from './verification.ts'

const origin = 'https://consumit.online', secret = 'security-test-secret'.repeat(3)
const input = { ref: { kind: 'movie', id: 1 }, capabilities: { hls: true, native: true, dash: false, nativeHls: false }, audioLanguage: 'en' }
const apps: ReturnType<typeof Fastify>[] = []
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())) })
async function setup() {
  const app = Fastify(); apps.push(app)
  await app.register(cookie); registerErrorHandlers(app)
  const store = createMemoryPlaybackStore()
  const adapter = createStaticProvider('stormboron', [{ ref: { kind: 'movie', id: 1 }, sources: [{ key: 'main', url: 'https://media.example/master.m3u8', type: 'hls', language: 'en', expiresAt: '2099-01-01T00:00:00.000Z', headers: {}, subtitles: [] }] }])
  const resolve = vi.spyOn(adapter, 'resolve')
  const transport = vi.fn(async (url: string) => ({ status: 200, url, headers: new Headers(), body: Readable.from(['#EXTM3U\n#EXTINF:6,\npart.ts\n']) }))
  const relay = createPlaybackRelay({ origin, secret, providers: { stormboron: ['media.example'] }, discovery: { stormboron: 'storm-boron-v1' } }, transport)
  const playback = createPlayback({ providers: [{ adapter, enabled: true, deliveryMode: 'relay', approvedRegions: ['US'], mediaKinds: ['movie'], mediaHosts: ['media.example'], upstreamGroup: 'owned', concurrency: 2, requestsPerMinute: 60 }], store, region: 'US', relay, relayOrigin: origin })
  const verify = vi.fn(async () => Response.json({ success: true, hostname: 'consumit.online', action: 'playback' }))
  registerPlaybackRoutes(app, { playback, origin, secure: true, store, verification: createPlaybackVerification(store, { secret, hostname: 'consumit.online' }, verify) })
  return { app, resolve, transport, verify }
}
function cookieOf(response: { cookies: { name: string; value: string }[] }) { return response.cookies.map(value => `${value.name}=${value.value}`).join('; ') }

describe('protected playback authorization', () => {
  it('verifies before provider work and rejects a control link copied into another browser', async () => {
    const { app, resolve, verify, transport } = await setup()
    const denied = await app.inject({ method: 'POST', url: '/v1/playback/resolve', headers: { origin }, payload: input })
    expect(denied.statusCode).toBe(403)
    expect(denied.json().error.code).toBe('PLAYBACK_VERIFICATION_REQUIRED')
    expect(resolve).not.toHaveBeenCalled()
    const started = await app.inject({ method: 'POST', url: '/v1/playback/resolve', headers: { origin }, payload: { ...input, turnstileToken: 'token' } })
    expect(started.statusCode).toBe(200)
    const browserCookie = cookieOf(started), url = new URL(started.json().source.src)
    const path = url.pathname + url.search
    expect((await app.inject({ url: path })).statusCode).toBe(401)
    expect((await app.inject({ url: path, headers: { cookie: '__Host-consumit-playback=' + 'b'.repeat(64) } })).statusCode).toBe(403)
    expect(transport).not.toHaveBeenCalled()
    expect((await app.inject({ url: path, headers: { cookie: browserCookie } })).statusCode).toBe(200)
    expect((await app.inject({ url: path, headers: { cookie: browserCookie, 'sec-fetch-site': 'cross-site' } })).statusCode).toBe(403)
    expect((await app.inject({ method: 'POST', url: '/v1/playback/resolve', headers: { origin, cookie: browserCookie }, payload: input })).statusCode).toBe(200)
    expect(verify).toHaveBeenCalledTimes(1)
  })
  it('consumes a TV handoff once and gives its receiver no browser-playback authority', async () => {
    const { app } = await setup()
    const start = await app.inject({ method: 'POST', url: '/v1/playback/resolve', headers: { origin }, payload: { ...input, turnstileToken: 'token' } })
    const session = start.json(), browserCookie = cookieOf(start)
    const handoff = await app.inject({ method: 'POST', url: `/v1/playback/${session.id}/cast-handoff`, headers: { origin, cookie: browserCookie }, payload: { sourceId: session.source.id } })
    expect(handoff.statusCode).toBe(200)
    expect(handoff.json()).not.toHaveProperty('src')
    const claims = await Promise.all([1, 2].map(() => app.inject({ method: 'POST', url: '/v1/playback/cast/claim', headers: { origin }, payload: { handoffToken: handoff.json().handoffToken } })))
    expect(claims.map(value => value.statusCode).sort()).toEqual([200, 403])
    const claim = claims.find(value => value.statusCode === 200)!, receiverCookie = cookieOf(claim)
    expect(receiverCookie).toContain('__Host-consumit-cast=')
    expect(receiverCookie).not.toContain('consumit-playback=')
    const src = new URL(claim.json().src), grant = await (await createGrantCodec(secret)).open(src.searchParams.get('grant')!)
    expect(grant.audience).toBe('cast')
    expect(grant.owner).toBe(await playbackOwner(claim.cookies[0]!.value))
    expect((await app.inject({ url: src.pathname + src.search, headers: { cookie: receiverCookie } })).statusCode).toBe(200)
    expect((await app.inject({ url: src.pathname + src.search, headers: { cookie: browserCookie } })).statusCode).toBe(403)
    expect((await app.inject({ method: 'POST', url: `/v1/playback/${session.id}/refresh`, headers: { origin, cookie: receiverCookie }, payload: { sourceId: session.source.id, reason: 'expired' } })).statusCode).toBe(401)
  })
})
