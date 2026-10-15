import { describe, expect, it, vi } from 'vitest'
import { createCipheriv } from 'node:crypto'
import { createResolverWorker } from './resolver-worker.ts'

const secret = 'resolver-test-secret-that-is-at-least-32-characters'
const env = { RESOLVER_ENABLED: 'true', RESOLVER_SECRET: secret }
const ref = { kind: 'movie', id: 550 } as const
const config = {
  id: 'static-fixture', adapter: 'static', enabled: true, role: 'video', deliveryMode: 'direct', regions: ['US'],
  mediaHosts: ['media.example.com'], mediaHostPatterns: [], upstreamGroup: 'fixture', concurrency: 1,
  requestsPerMinute: 10, priority: 0, attemptMs: 3000, mediaKinds: ['movie'],
  entries: [{ ref, sources: [{ key: 'main', url: 'https://media.example.com/movie.m3u8', type: 'hls', expiresAt: new Date(Date.now() + 600_000).toISOString() }] }],
}
const vixsrcConfig = {
  id: 'vixsrc', adapter: 'vixsrc', enabled: true, role: 'video', deliveryMode: 'direct', regions: ['US'],
  mediaHosts: ['vixsrc.to'], mediaHostPatterns: [], resolutionHosts: [], upstreamGroup: 'vixsrc', concurrency: 1,
  requestsPerMinute: 10, priority: 0, attemptMs: 3000, mediaKinds: ['movie', 'series'],
}
function request(body: unknown, authorization = `Bearer ${secret}`, signal?: AbortSignal) {
  return new Request('https://resolver.example/v1/resolve', {
    method: 'POST', headers: { authorization, 'content-type': 'application/json' },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  })
}

describe('Cloudflare provider resolver', () => {
  it('delegates only AnimeKai proof calculation to the authenticated API and keeps the provider chain in the Worker', async () => {
    const key = Buffer.alloc(32, 1), iv = Buffer.alloc(12, 2), cipher = createCipheriv('aes-256-gcm', key, iv)
    const plaintext = JSON.stringify({ sources: [{ url: 'https://media.example.com/master.m3u8', label: '720p' }], tracks: [], expires_at: '2099-01-01T00:00:00Z' })
    const payload = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]).toString('base64url')
    let solution = '38'
    let computeStatus = 200
    const fetcher = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = new URL(input)
      if (url.hostname === 'consumit.online') {
        expect(url.pathname).toBe('/v1/internal/animekai-pow')
        expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${secret}`)
        expect(JSON.parse(String(init?.body))).toEqual({ nonce: 'consumit-fixture-nonce', difficulty: 8 })
        expect(init?.redirect).toBe('manual')
        return computeStatus === 200 ? Response.json({ solution }) : new Response(null, { status: computeStatus, headers: { location: 'https://unapproved.example/compute' } })
      }
      if (url.pathname.includes('search_live')) return Response.json({ results: [{ slug: 'one-piece', title: 'One Piece' }] })
      if (url.pathname.includes('/watch/')) return new Response('<ul class="server-list" data-media="sub"><li data-url="https://mfw09.org/e/test" data-media="sub"></li></ul>')
      if (url.pathname.endsWith('/challenge')) return Response.json({ challenge_id: 'challenge', nonce: 'nonce' })
      if (url.pathname.endsWith('/attest')) return Response.json({ token: 'token', viewer_id: 'viewer', device_id: 'device' })
      if (url.pathname.endsWith('/captcha')) return Response.json({ pow_nonce: 'consumit-fixture-nonce', pow_difficulty: 8, pow_token: 'pow-token' })
      if (url.pathname.endsWith('/verify')) return Response.json({ token: 'verified' })
      return Response.json({ playback: { iv: iv.toString('base64url'), payload, key_parts: [key.toString('base64url')] } })
    })
    const row = { ...vixsrcConfig, id: 'animekai', adapter: 'animekai', mediaKinds: ['anime'], mediaHosts: ['media.example.com'], upstreamGroup: 'animekai' }
    const settings = { ...env, RESOLVER_COMPUTE_ORIGIN: 'https://consumit.online', RESOLVER_COMPUTE_SECRET: secret }
    const body = { providerId: 'animekai', config: row, input: { ref: { kind: 'anime', id: 21, episode: 1 }, region: 'US', audioLanguage: 'ja' }, metadata: { animeTitle: 'One Piece' } }
    const result = await createResolverWorker({ fetch: fetcher }).fetch(request(body), settings)
    expect(await result.json()).toMatchObject({ ok: true, sources: [{ type: 'hls' }] })
    expect(fetcher.mock.calls.filter(([url]) => new URL(url).hostname === 'consumit.online')).toHaveLength(1)
    expect(fetcher).toHaveBeenCalledTimes(8)
    fetcher.mockClear()
    const exhausted = await createResolverWorker({ fetch: fetcher, maxSubrequests: 5 }).fetch(request(body), settings)
    expect(await exhausted.json()).toMatchObject({ ok: false, code: 'unavailable' })
    expect(fetcher).toHaveBeenCalledTimes(5)
    solution = 'malformed-result'
    const malformed = await createResolverWorker({ fetch: fetcher }).fetch(request(body), settings)
    expect(await malformed.json()).toMatchObject({ ok: false })
    solution = '38'
    computeStatus = 302
    fetcher.mockClear()
    const redirected = await createResolverWorker({ fetch: fetcher }).fetch(request(body), settings)
    expect(await redirected.json()).toMatchObject({ ok: false })
    expect(fetcher).toHaveBeenCalledTimes(6)
  })
  it('resolves published frames without a page fetch from the API-facing Worker egress', async () => {
    const fetcher = vi.fn(async () => new Response('Forbidden', { status: 403 }))
    const frameConfig = { ...vixsrcConfig, id: 'apiplayerframe', adapter: 'apiplayerframe', deliveryMode: 'embed', mediaHosts: ['apiplayer.ru'], upstreamGroup: 'apiplayerframe' }
    const response = await createResolverWorker({ fetch: fetcher }).fetch(request({ providerId: 'apiplayerframe', config: frameConfig, input: { ref, region: 'US', audioLanguage: 'en' } }), env)
    expect(await response.json()).toMatchObject({ ok: true, sources: [{ url: 'https://apiplayer.ru/embed/movie/550', type: 'iframe' }] })
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('authenticates and resolves one compiled adapter from its scoped config', async () => {
    const worker = createResolverWorker()
    const response = await worker.fetch(request({ providerId: config.id, config, input: { ref, region: 'US', audioLanguage: 'en' } }), env)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, sources: [{ url: 'https://media.example.com/movie.m3u8' }] })
  })

  it('rejects unauthenticated and disabled requests before provider work', async () => {
    const fetcher = vi.fn()
    const worker = createResolverWorker({ fetch: fetcher })
    expect((await worker.fetch(request({}, 'Bearer wrong'), env)).status).toBe(403)
    expect((await worker.fetch(request({}), { ...env, RESOLVER_ENABLED: 'false' })).status).toBe(503)
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('rejects mismatched provider identity and unsafe host scope', async () => {
    const worker = createResolverWorker()
    expect((await worker.fetch(request({ providerId: 'other', config, input: { ref, region: 'US', audioLanguage: 'en' } }), env)).status).toBe(400)
    const unsafe = { ...config, mediaHosts: ['127.0.0.1'] }
    expect((await worker.fetch(request({ providerId: config.id, config: unsafe, input: { ref, region: 'US', audioLanguage: 'en' } }), env)).status).toBe(400)
  })

  it('rejects oversized and malformed requests', async () => {
    const worker = createResolverWorker()
    const tooLarge = new Request('https://resolver.example/v1/resolve', { method: 'POST', headers: { authorization: `Bearer ${secret}` }, body: 'x'.repeat(65 * 1024) })
    expect((await worker.fetch(tooLarge, env)).status).toBe(413)
    expect((await worker.fetch(request({ providerId: 'bad!', config, input: { ref, region: 'US', audioLanguage: 'en' } }), env)).status).toBe(400)
  })

  it('fails closed for an adapter outside the compiled configuration schema', async () => {
    const worker = createResolverWorker()
    const unknown = { ...config, adapter: 'remote-code' }
    const response = await worker.fetch(request({ providerId: config.id, config: unknown, input: { ref, region: 'US', audioLanguage: 'en' } }), env)
    expect(response.status).toBe(502)
    expect(await response.json()).toMatchObject({ ok: false, code: 'unavailable' })
  })

  it('follows only approved redirects and refuses redirect-based scope escape', async () => {
    const fetcher = vi.fn(async (input: string | URL) => {
      const url = String(input)
      if (url.endsWith('/api/movie/550')) return new Response(null, { status: 302, headers: { location: '/api/movie/550?source=1' } })
      if (url.includes('source=1')) return Response.json({ src: '/embed/movie/550' })
      if (url.includes('/embed/')) return new Response(`token": "t", expires": "${Math.floor(Date.now() / 1000) + 600}", url: "https://vixsrc.to/master.m3u8"`)
      return new Response('#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:8\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:8,\nseg.ts\n#EXT-X-ENDLIST', { headers: { 'content-type': 'application/vnd.apple.mpegurl' } })
    })
    const worker = createResolverWorker({ fetch: fetcher })
    const response = await worker.fetch(request({ providerId: 'vixsrc', config: vixsrcConfig, input: { ref, region: 'US', audioLanguage: 'en' } }), env)
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true })
    expect(fetcher).toHaveBeenCalledTimes(4)

    const escapeFetch = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'https://evil.example/api/movie/550' } }))
    const blocked = await createResolverWorker({ fetch: escapeFetch }).fetch(request({ providerId: 'vixsrc', config: vixsrcConfig, input: { ref, region: 'US', audioLanguage: 'en' } }), env)
    expect(escapeFetch).toHaveBeenCalledTimes(1)
    expect(await blocked.json()).toMatchObject({ ok: false, code: 'unavailable' })
  })

  it('stops before exceeding its per-invocation subrequest budget', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 302, headers: { location: '/next' } }))
    const response = await createResolverWorker({ fetch: fetcher, maxSubrequests: 1 }).fetch(
      request({ providerId: 'vixsrc', config: vixsrcConfig, input: { ref, region: 'US', audioLanguage: 'en' } }), env,
    )
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(await response.json()).toMatchObject({ ok: false, code: 'unavailable', retryable: true })
  })

  it('cancels upstream work when the API caller disconnects', async () => {
    let markStarted!: () => void
    const started = new Promise<void>(resolve => { markStarted = resolve })
    const fetcher = vi.fn((input: string | URL, init?: RequestInit) => new Promise<Response>((resolve, reject) => {
      expect(new URL(input).hostname).toBe('vixsrc.to')
      void resolve
      const signal = init?.signal
      markStarted()
      if (signal?.aborted) reject(signal.reason)
      else signal?.addEventListener('abort', () => reject(signal.reason), { once: true })
    }))
    const controller = new AbortController()
    const pending = createResolverWorker({ fetch: fetcher }).fetch(
      request({ providerId: 'vixsrc', config: vixsrcConfig, input: { ref, region: 'US', audioLanguage: 'en' } }, `Bearer ${secret}`, controller.signal), env,
    )
    await started
    controller.abort(new DOMException('Caller disconnected.', 'AbortError'))
    const response = await pending
    expect(await response.json()).toMatchObject({ ok: false, code: 'cancelled' })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
