import { afterEach, describe, expect, it, vi } from 'vitest'
import worker, { type Env } from './index.ts'
import { createProxyGrant } from '../apps/api/src/playback/embed-tokens.ts'

const secret = 'test-secret-long-enough-for-hmac-validation'
const workerHost = 'proxy.example.com'
const origin = `https://${workerHost}`
const media = 'https://media.example.com/master.m3u8'

function grant(url = media, hosts = ['media.example.com']) {
  return createProxyGrant(secret, { url, host: workerHost, hosts, patterns: [], headers: {} })
}

function env(allowed = true): Env {
  return { HMAC_SECRET: secret, RATE_LIMITER: { limit: vi.fn(async () => ({ success: allowed })) } }
}

function request(token: string) {
  return new Request(`${origin}/proxy?token=${encodeURIComponent(token)}`)
}

afterEach(() => vi.unstubAllGlobals())

describe('signed media proxy', () => {
  it('rejects unsigned, altered, expired, and arbitrary destination grants', async () => {
    const upstream = vi.fn()
    vi.stubGlobal('fetch', upstream)
    expect((await worker.fetch(new Request(`${origin}/proxy?url=${encodeURIComponent(media)}`), env())).status).toBe(403)
    expect((await worker.fetch(request(grant().replace(/.$/, '0')), env())).status).toBe(403)
    expect((await worker.fetch(request(createProxyGrant(secret, { url: media, host: workerHost, hosts: ['media.example.com'], patterns: [], headers: {} }, Date.now() - 1)), env())).status).toBe(403)
    expect((await worker.fetch(request(grant('https://127.0.0.1/private', ['127.0.0.1'])), env())).status).toBe(403)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('signs nested playlists, segments, and URI tags with the same destination scope', async () => {
    const upstream = vi.fn(async (url: string) => new Response(url.endsWith('master.m3u8')
      ? '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\nvariant.m3u8\n'
      : '#EXTM3U\nsegment.ts\n', { headers: { 'content-type': 'application/vnd.apple.mpegurl' } }))
    vi.stubGlobal('fetch', upstream)
    const response = await worker.fetch(request(grant()), env())
    expect(response.status).toBe(200)
    const lines = (await response.text()).split('\n')
    const keyUrl = /URI="([^"]+)"/.exec(lines[1]!)?.[1]
    const playlistUrl = lines[2]
    expect(keyUrl).toContain('/proxy?token=')
    expect(playlistUrl).toContain('/proxy?token=')
    const child = await worker.fetch(new Request(playlistUrl!), env())
    expect(child.status).toBe(200)
    expect(await child.text()).toContain('/proxy?token=')
    expect(upstream).toHaveBeenCalledTimes(2)
  })

  it('fails closed on off-list playlist children and redirects', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('#EXTM3U\nhttps://internal.example.net/segment.ts\n', { headers: { 'content-type': 'application/vnd.apple.mpegurl' } })))
    expect((await worker.fetch(request(grant()), env())).status).toBe(502)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 302, headers: { location: 'https://internal.example.net/segment.ts' } })))
    expect((await worker.fetch(request(grant()), env())).status).toBe(502)
  })

  it('uses the distributed limiter before fetching upstream', async () => {
    const upstream = vi.fn()
    vi.stubGlobal('fetch', upstream)
    expect((await worker.fetch(request(grant()), env(false))).status).toBe(429)
    expect(upstream).not.toHaveBeenCalled()
  })

  it('ignores unsigned header query parameters and bounds upstream documents', async () => {
    const upstream = vi.fn(async (_url: string, init: RequestInit) => {
      expect(new Headers(init.headers).get('authorization')).toBeNull()
      return new Response('x'.repeat(1024), { headers: { 'content-type': 'text/vtt', 'content-length': String(6 * 1024 * 1024) } })
    })
    vi.stubGlobal('fetch', upstream)
    const url = new URL(`${origin}/proxy`)
    url.searchParams.set('token', grant('https://media.example.com/subtitle.vtt'))
    url.searchParams.set('headers', JSON.stringify({ authorization: 'stolen' }))
    expect((await worker.fetch(new Request(url), env())).status).toBe(502)
    expect(upstream).toHaveBeenCalledOnce()
  })
})
