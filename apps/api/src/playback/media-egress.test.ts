import { describe, expect, it, vi } from 'vitest'
import { Readable } from 'node:stream'
import { createGrantCodec, mediaGrantUrl } from '@consumit/media-relay'
import { createMediaEgress } from './media-egress.ts'
import type { MediaTransport } from './transport.ts'

const origin = 'https://watch.example', media = 'https://media.example', secret = 'media-node-separate-secret-at-least-32-chars'
const env = { RELAY_ENABLED: 'true', RELAY_SECRET: secret, APP_ORIGIN: origin, RELAY_PROVIDERS: JSON.stringify({ 'lookmovie-relay': ['srv310.seclar.cyou'] }), RELAY_DISCOVERY_PROVIDERS: JSON.stringify({ 'lookmovie-relay': 'lookmovie-v1' }) }
async function request(init?: RequestInit) {
  const token = await (await createGrantCodec(secret)).seal({ version: 1, provider: 'lookmovie-relay', url: 'https://srv313.seclar.cyou/part.ts', expires: Date.now() + 60000, origin, headers: {}, headerHost: 'srv313.seclar.cyou', kind: 'auto', depth: 1, recipe: 'lookmovie-v1', hosts: ['srv313.seclar.cyou'] })
  return new Request(mediaGrantUrl(media, token), { headers: { origin }, ...init })
}
function setup(body: Readable = Readable.from([Buffer.from('media')]), dailyBytes = 1000, active = 1, deadlineMs = 5000) {
  const transport = vi.fn<MediaTransport>(async url => ({ status: 206, headers: new Headers({ 'content-type': 'video/mp2t', 'content-range': 'bytes 0-4/5' }), body, url }))
  const save = vi.fn(async () => undefined), state = { day: new Date().toISOString().slice(0, 10), reserved: 0 }
  return { transport, save, daemon: createMediaEgress(env, { active, dailyBytes, bytesPerSecond: 1_500_000, deadlineMs }, { transport, save, state }) }
}
describe('isolated media daemon', () => {
  it('validates capabilities before touching the pinned transport and preserves Range', async () => {
    const { daemon, transport, save } = setup()
    const rejected = await daemon.fetch(new Request(`${media}/media/forged`))
    expect(rejected.status).toBe(403); await rejected.text()
    expect(transport).not.toHaveBeenCalled()
    const response = await daemon.fetch(await request({ headers: { origin, range: 'bytes=0-4' } }))
    expect(response.status).toBe(206)
    expect(response.headers.get('content-range')).toBe('bytes 0-4/5')
    expect(await response.text()).toBe('media')
    expect(transport).toHaveBeenCalledWith('https://srv313.seclar.cyou/part.ts', ['srv313.seclar.cyou'], expect.objectContaining({ range: 'bytes=0-4' }), expect.any(AbortSignal), undefined)
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ reserved: 1000 }))
    expect(daemon.snapshot().active).toBe(0)
  })
  it('rejects excess requests and closes the upstream on browser cancellation', async () => {
    const upstream = new Readable({ read() {} }), { daemon } = setup(upstream)
    const response = await daemon.fetch(await request())
    expect((await daemon.fetch(await request())).status).toBe(429)
    await response.body!.cancel()
    expect(upstream.destroyed).toBe(true)
    expect(daemon.snapshot().active).toBe(0)
  })
  it('does not release media when durable budget persistence fails', async () => {
    const { daemon, save } = setup()
    save.mockRejectedValue(new Error('disk unavailable'))
    const response = await daemon.fetch(await request())
    await expect(response.text()).rejects.toThrow()
    expect(daemon.snapshot().reserved).toBe(0)
    expect(daemon.snapshot().active).toBe(0)
  })
  it('retains spent quota across restart and cannot overdraw concurrent requests', async () => {
    const { daemon, save } = setup(Readable.from([Buffer.alloc(100)]), 99)
    const response = await daemon.fetch(await request())
    await expect(response.arrayBuffer()).rejects.toThrow()
    expect(save).not.toHaveBeenCalled()
    const state = { day: new Date().toISOString().slice(0, 10), reserved: 99 }
    const transport = vi.fn<MediaTransport>(async url => ({ status: 200, headers: new Headers({ 'content-type': 'video/mp2t' }), body: Readable.from([Buffer.from('x')]), url }))
    const restarted = createMediaEgress(env, { active: 2, dailyBytes: 99, bytesPerSecond: 1_500_000, deadlineMs: 5000 }, { state, save, transport })
    const responses = await Promise.all([restarted.fetch(await request()), restarted.fetch(await request())])
    for (const item of responses) await expect(item.text()).rejects.toThrow()
    expect(restarted.snapshot().reserved).toBe(99)
  })
  it('releases capacity when an unread response hits its overall deadline', async () => {
    const upstream = new Readable({ read() {} }), { daemon } = setup(upstream, 1000, 1, 30)
    await daemon.fetch(await request())
    await new Promise(resolve => setTimeout(resolve, 60))
    expect(daemon.snapshot().active).toBe(0)
    expect(upstream.destroyed).toBe(true)
  })
})
