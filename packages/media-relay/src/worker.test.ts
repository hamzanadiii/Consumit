import { describe, expect, it, vi } from 'vitest'
import { createGrantCodec, MAX_GRANT_MS, mediaGrantUrl, type RelayGrant } from './grants.ts'
import { createRelayWorker, type RelayEnv } from './worker.ts'

const now = 1_800_000_000_000
const secret = 'a'.repeat(48)
const origin = 'https://watch.example'
const edge = 'https://edge.example'
const env: RelayEnv = { RELAY_ENABLED: 'true', RELAY_SECRET: secret, APP_ORIGIN: origin,
  RELAY_PROVIDERS: JSON.stringify({ owned: ['media.example', 'audio.example'] }) }
const base: RelayGrant = { version: 1, provider: 'owned', url: 'https://media.example/master.m3u8', expires: now + 60_000,
  origin, headers: { Referer: origin }, headerHost: 'media.example', kind: 'hls', depth: 0 }
// The native workerd constructor rejects incomplete/oversized bodies. The
// standard-stream fixture exercises that contract outside the edge runtime.
class FixedLengthFixture extends TransformStream<Uint8Array, Uint8Array> {
  constructor(length: number) {
    let size = 0
    super({ transform(chunk, controller) { size += chunk.length; if (size > length) throw new Error('Wrong length'); controller.enqueue(chunk) },
      flush() { if (size !== length) throw new Error('Wrong length') } })
  }
}
async function request(grant: Partial<RelayGrant> = {}, init: RequestInit = {}) {
  const codec = await createGrantCodec(secret)
  return new Request(mediaGrantUrl(edge, await codec.seal({ ...base, ...grant }, now)), init)
}
function setup(response: Response | ((url: string) => Response)) {
  const fetcher = vi.fn<typeof fetch>(async input => typeof response === 'function' ? response(String(input)) : response)
  const report = vi.fn()
  return { fetcher, report, worker: createRelayWorker({ fetch: fetcher, now: () => now, report }) }
}
describe('media grants', () => {
  it('accepts measured Mapple 4K media playlists above the generic bound', async () => {
    const playlist = '#EXTM3U\n#EXT-X-TARGETDURATION:6\n' + Array.from({ length: 1400 }, (_, index) => `#EXTINF:6,\npart-${index}.ts?pad=${'x'.repeat(390)}\n`).join('') + '#EXT-X-ENDLIST\n'
    expect(playlist.length).toBeGreaterThan(512 * 1024)
    const { worker } = setup(new Response(playlist, { headers: { 'content-type': 'application/vnd.apple.mpegurl' } }))
    const response = await worker.fetch(await request({ provider: 'mapple' }), { ...env, RELAY_PROVIDERS: JSON.stringify({ mapple: ['media.example'] }) })
    expect(response.status).toBe(200)
    expect(await response.text()).toContain('#EXT-X-ENDLIST')
  })
  it('continues accepting object grants issued before the compact wire format', async () => {
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', encoder.encode(secret)), 'AES-GCM', false, ['encrypt'])
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode('consumit-media-v1') }, key, encoder.encode(JSON.stringify(base)))
    const token = Buffer.concat([iv, new Uint8Array(encrypted)]).toString('base64url')
    expect(await (await createGrantCodec(secret)).open(token, now)).toEqual(base)
  })
  it('round trips the optional provider route version in compact signed grants', async () => {
    const codec = await createGrantCodec(secret)
    const versioned = { ...base, routeVersion: 'edge-v1-0123456789abcdef', route: { kind: 'movie' as const, region: 'US', purpose: 'video' as const } }
    expect(await codec.open(await codec.seal(versioned, now), now)).toEqual(versioned)
    await expect(codec.seal({ ...base, routeVersion: 'wrong-version' }, now)).rejects.toThrow()
  })
  it('hides URLs and headers, rejects forgery, expiry, wrong keys and unbounded lifetime', async () => {
    const codec = await createGrantCodec(secret)
    const token = await codec.seal(base, now)
    expect(token).not.toContain('media.example')
    expect(await codec.open(token, now)).toEqual(base)
    await expect(codec.open(`${token[0] === 'A' ? 'B' : 'A'}${token.slice(1)}`, now)).rejects.toThrow()
    await expect(codec.open(token, base.expires)).rejects.toThrow()
    expect(await codec.open(token, base.expires, true)).toEqual(base)
    await expect((await createGrantCodec('b'.repeat(48))).open(token, now)).rejects.toThrow()
    await expect(codec.seal({ ...base, expires: now + MAX_GRANT_MS + 1 }, now)).rejects.toThrow()
    await expect(codec.seal({ ...base, headers: { Cookie: 'secret' } }, now)).rejects.toThrow()
  })
  it('binds the NontonFlix cookie grant to its provider and exact media host', async () => {
    const codec = await createGrantCodec(secret)
    const review = { ...base, provider: 'nontonflix', url: 'https://media.nontonflix.com/media/grant', headerHost: 'media.nontonflix.com', headers: { cookie: 'nf_mk=device; nf_web=web', referer: 'https://nontonflix.com/' } }
    const token = await codec.seal(review, now)
    expect(await codec.open(token, now)).toEqual(review)
    await expect(codec.seal({ ...review, provider: 'owned' }, now)).rejects.toThrow()
    await expect(codec.seal({ ...review, url: 'https://media.example/grant', headerHost: 'media.example' }, now)).rejects.toThrow()
    await expect(codec.seal({ ...review, headers: { authorization: 'Bearer secret' } }, now)).rejects.toThrow()
  })
})
describe('Worker delivery boundary', () => {
  it('rejects route-version drift before making a media request', async () => {
    const { worker, fetcher } = setup(new Response('not used'))
    const requestVersion = 'edge-v1-0123456789abcdef'
    const requestValue = await request({ routeVersion: requestVersion })
    const response = await worker.fetch(requestValue, { ...env, RELAY_ROUTE_VERSION: 'edge-v1-fedcba9876543210' })
    expect(response.status).toBe(403)
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('requires a matching versioned provider, title, region, purpose, relay, and host policy', async () => {
    const { worker, fetcher } = setup(new Response('#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXTINF:4,\nseg.ts\n#EXT-X-ENDLIST', { headers: { 'content-type': 'application/vnd.apple.mpegurl' } }))
    const version = 'edge-v1-0123456789abcdef'
    const route = { kind: 'movie' as const, region: 'US', purpose: 'video' as const }
    const grant = { routeVersion: version, route }
    const policy = [{ version, provider: 'owned', ...route, delivery: 'relay' as const, media: edge, hosts: ['audio.example', 'media.example'] }]
    const settings = { ...env, RELAY_ROUTE_VERSION: version, RELAY_ROUTE_POLICY_REQUIRED: 'true', RELAY_ROUTE_POLICY: JSON.stringify(policy) }
    expect((await worker.fetch(await request(grant), settings)).status).toBe(200)
    fetcher.mockClear()
    expect((await worker.fetch(await request({ ...grant, route: { ...route, region: 'CA' } }), settings)).status).toBe(403)
    expect(fetcher).not.toHaveBeenCalled()
    expect((await worker.fetch(await request(grant), { ...settings, RELAY_PROVIDERS: JSON.stringify({ owned: ['media.example'] }) })).status).toBe(403)
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('rewrites a VidBolt VOD playlist with more than 2,000 segments within the byte limit', async () => {
    const settings = { ...env, RELAY_PROVIDERS: JSON.stringify({ vidbolt: ['media.example'] }) }
    const playlist = '#EXTM3U\n' + Array.from({ length: 2080 }, (_, index) => `#EXTINF:4,\nsegment-${index}.ts`).join('\n') + '\n#EXT-X-ENDLIST\n'
    const { worker, report } = setup(new Response(playlist, { headers: { 'content-type': 'application/vnd.apple.mpegurl' } }))
    const response = await worker.fetch(await request({ provider: 'vidbolt', url: 'https://media.example/master.m3u8' }), settings)

    expect(response.status).toBe(200)
    const rewritten = await response.text()
    expect((rewritten.match(/https:\/\/edge\.example\/media\//g) ?? [])).toHaveLength(2080)
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ provider: 'vidbolt', kind: 'manifest', status: 200, stage: 'manifest-rewrite' }))
  })

  it('forwards the NontonFlix device cookie to signed children and accepts its larger manifest', async () => {
    const settings = { ...env, RELAY_PROVIDERS: JSON.stringify({ nontonflix: ['media.nontonflix.com'] }) }
    const segments = Array.from({ length: 1392 }, (_, index) => `#EXTINF:4,\nhttps://media.nontonflix.com/media/segment-${index}.ts`)
    const playlist = '#EXTM3U\n# padding ' + 'x'.repeat(2_200_000) + '\n' + segments.join('\n') + '\n#EXT-X-ENDLIST\n'
    let upstream = 0
    const { worker, fetcher } = setup(() => upstream++ === 0
      ? new Response(playlist, { headers: { 'content-type': 'application/vnd.apple.mpegurl' } })
      : new Response('segment', { headers: { 'content-type': 'video/mp2t', 'content-length': '7' } }))
    const response = await worker.fetch(await request({
      provider: 'nontonflix', url: 'https://media.nontonflix.com/media/grant',
      headerHost: 'media.nontonflix.com', headers: { cookie: 'nf_mk=device; nf_web=web', referer: 'https://nontonflix.com/' },
    }), settings)

    expect(response.status).toBe(200)
    const rewritten = await response.text()
    expect((rewritten.match(/https:\/\/edge\.example\/media\//g) ?? [])).toHaveLength(1392)
    const outgoing = new Headers(fetcher.mock.calls[0]?.[1]?.headers)
    expect(outgoing.get('cookie')).toBe('nf_mk=device; nf_web=web')
    expect(outgoing.get('referer')).toBe('https://nontonflix.com/')

    const child = new URL(rewritten.split('\n').find(line => line.startsWith('https://'))!)
    expect((await worker.fetch(new Request(child), settings)).status).toBe(200)
    expect(new Headers(fetcher.mock.calls[1]?.[1]?.headers).get('cookie')).toBe('nf_mk=device; nf_web=web')
  })

  it('accepts the larger reviewed EmbedMaster feature playlist', async () => {
    const settings = { ...env, RELAY_PROVIDERS: JSON.stringify({ embedmaster: ['perfectbussines.website'] }) }
    const segments = Array.from({ length: 1669 }, (_, index) => `#EXTINF:5,\n/segment-${index}.html?t=token`)
    const playlist = '#EXTM3U\n# padding ' + 'x'.repeat(1_200_000) + '\n' + segments.join('\n') + '\n#EXT-X-ENDLIST\n'
    const { worker } = setup(new Response(playlist, { headers: { 'content-type': 'application/vnd.apple.mpegurl' } }))
    const response = await worker.fetch(await request({
      provider: 'embedmaster', url: 'https://perfectbussines.website/media/master.m3u8',
      headerHost: 'perfectbussines.website', kind: 'hls',
      headers: { referer: 'https://embdmstrplayer.com/', origin: 'https://embdmstrplayer.com' },
    }), settings)

    expect(response.status).toBe(200)
    const rewritten = await response.text()
    expect((rewritten.match(/https:\/\/edge\.example\/media\//g) ?? [])).toHaveLength(1669)
  })

  it('fetches only authenticated signed Rigel control playlists, without rewriting or accepting media grants', async () => {
    const settings = { ...env, RELAY_PROVIDERS: JSON.stringify({ rigel: ['media.example'] }) }
    const codec = await createGrantCodec(secret)
    const token = await codec.seal({ ...base, provider: 'rigel' }, now)
    const control = (grant = token, authorization = `Bearer ${secret}`) => new Request(`${edge}/v1/relay-manifest`, { method: 'POST', headers: { authorization, 'content-type': 'application/json' }, body: JSON.stringify({ grant }) })
    const text = '#EXTM3U\n# comment ' + 'x'.repeat(1_100_000) + '\n#EXTINF:6,\nseg.ts\n'
    const first = setup(new Response(text, { headers: { 'content-type': 'application/vnd.apple.mpegurl' } }))
    const response = await first.worker.fetch(control(), settings)
    expect(response.status).toBe(200)
    expect(await response.text()).toBe(text)
    expect(response.headers.get('x-consumit-manifest-base')).toBe(base.url)
    expect(first.fetcher.mock.calls[0]?.[1]?.method).toBe('GET')
    expect((await setup(new Response(text)).worker.fetch(control(token, 'Bearer wrong'), settings)).status).toBe(403)
    const native = await codec.seal({ ...base, provider: 'rigel', kind: 'native' }, now)
    expect((await setup(new Response(text)).worker.fetch(control(native), settings)).status).toBe(403)
    expect((await setup(new Response('x'.repeat(2_097_153))).worker.fetch(control(), settings)).status).toBe(502)
    expect((await setup(new Response(text)).worker.fetch(control(await codec.seal(base, now)), env)).status).toBe(403)
  })
  it('resolves LookMovie and discovers its HLS host graph from authenticated Worker egress', async () => {
    const settings = { ...env, RELAY_PROVIDERS: JSON.stringify({ 'lookmovie': ['srv310.seclar.cyou'] }), RELAY_DISCOVERY_PROVIDERS: JSON.stringify({ 'lookmovie': 'lookmovie-v1' }) }
    const segment = new Uint8Array(564); segment[0] = 71; segment[188] = 71; segment[376] = 71
    const fetcher = vi.fn<typeof fetch>(async (input, init) => {
      // Match workerd: redirect:'error' throws before performing any HTTP.
      if (init?.redirect === 'error') throw new TypeError('Invalid redirect value')
      expect(init?.redirect).toBe('manual')
      const url = new URL(String(input))
      if (url.hostname === 'lmscript.xyz' && url.pathname === '/v1/movies') return Response.json({ items: [{ id_movie: '42', title: 'Alien', year: 1979 }] })
      if (url.hostname === 'lmscript.xyz' && url.pathname === '/v1/movies/view') return Response.json({ streams: { '1080p': 'https://srv313.seclar.cyou/master.m3u8' }, subtitles: [] })
      if (url.hostname === 'srv313.seclar.cyou' && url.pathname === '/master.m3u8') return new Response('#EXTM3U\n#EXTINF:6,\nhttps://srv314.seclar.cyou/part.ts\n#EXT-X-ENDLIST\n', { headers: { 'content-type': 'application/vnd.apple.mpegurl' } })
      if (url.hostname === 'srv314.seclar.cyou') return new Response(segment, { headers: { 'content-type': 'video/mp2t' } })
      return new Response('', { status: 404 })
    })
    const worker = createRelayWorker({ fetch: fetcher, now: () => now, verifyPublicHost: async () => undefined })
    const response = await worker.fetch(new Request('https://edge.example/v1/lookmovie/resolve', {
      method: 'POST', headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Alien', year: 1979, ref: { kind: 'movie', id: 550 } }),
    }), settings)
    expect(response.status).toBe(200)
    const result = await response.json() as { ok: boolean; sources: Array<{ url: string; relayRecipe?: string; relayHosts?: string[] }> }
    expect(result.ok).toBe(true)
    expect(result.sources[0]).toMatchObject({ url: 'https://srv313.seclar.cyou/master.m3u8', relayRecipe: 'lookmovie-v1', relayHosts: ['srv313.seclar.cyou', 'srv314.seclar.cyou'] })
    expect(fetcher).toHaveBeenCalledTimes(4)
  })

  it('rejects Worker-side LookMovie catalog redirects without fetching their target', async () => {
    const settings = { ...env, RELAY_PROVIDERS: JSON.stringify({ lookmovie: ['srv310.seclar.cyou'] }), RELAY_DISCOVERY_PROVIDERS: JSON.stringify({ lookmovie: 'lookmovie-v1' }) }
    const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
      expect(init?.redirect).toBe('manual')
      return new Response(null, { status: 302, headers: { location: 'https://unapproved.example/catalog' } })
    })
    const worker = createRelayWorker({ fetch: fetcher })
    const response = await worker.fetch(new Request('https://edge.example/v1/lookmovie/resolve', {
      method: 'POST', headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Alien', year: 1979, ref: { kind: 'movie', id: 550 } }),
    }), settings)
    expect(response.status).toBe(502)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(fetcher.mock.calls[0]?.[1]?.redirect).toBe('manual')
  })

  it('rejects unauthenticated or malformed Worker-side LookMovie resolution requests', async () => {
    const worker = createRelayWorker({ fetch: vi.fn<typeof fetch>(), now: () => now })
    const url = 'https://edge.example/v1/lookmovie/resolve'
    expect((await worker.fetch(new Request(url, { method: 'POST', body: '{}' }), env)).status).toBe(403)
    expect((await worker.fetch(new Request(url, { method: 'POST', headers: { authorization: `Bearer ${secret}` }, body: '{"title":"Alien","year":1979}' }), env)).status).toBe(400)
  })

  it('allows LookMovie rotating hosts only through its exact Worker recipe and signed host scope', async () => {
    const settings = { ...env, RELAY_PROVIDERS: JSON.stringify({ 'lookmovie': ['srv310.seclar.cyou'] }), RELAY_DISCOVERY_PROVIDERS: JSON.stringify({ 'lookmovie': 'lookmovie-v1' }) }
    const grant = { provider: 'lookmovie', url: 'https://srv313.seclar.cyou/part.ts', kind: 'auto' as const, recipe: 'lookmovie-v1' as const, hosts: ['srv313.seclar.cyou'] }
    const fetcher = vi.fn<typeof fetch>(async () => new Response('media'))
    const dependencies = { fetch: fetcher, now: () => now, verifyPublicHost: async () => undefined }
    expect((await createRelayWorker(dependencies).fetch(await request(grant), settings)).status).toBe(200)
    expect((await createRelayWorker(dependencies).fetch(await request({ ...grant, url: 'https://unrelated.example/part.ts', hosts: ['unrelated.example'] }), settings)).status).toBe(403)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('leases Aether rotating tnmr hosts only through its exact recipe and replays the adapter UA', async () => {
    const settings = { ...env, RELAY_PROVIDERS: JSON.stringify({ aether: ['cdn1018.cdn-tnmr.org'] }), RELAY_DISCOVERY_PROVIDERS: JSON.stringify({ aether: 'aether-v1' }) }
    const grant = { provider: 'aether', url: 'https://cjdgxnffutfw.tnmr.org/hls2/master.m3u8', headerHost: 'cjdgxnffutfw.tnmr.org', kind: 'hls' as const, recipe: 'aether-v1' as const, hosts: ['cjdgxnffutfw.tnmr.org'], headers: { 'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36' } }
    const playlist = '#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6.0,\nseg0.ts\n#EXT-X-ENDLIST\n'
    const fetcher = vi.fn<typeof fetch>(async () => new Response(playlist, { headers: { 'content-type': 'application/vnd.apple.mpegurl' } }))
    const verifyPublicHost = vi.fn<(host: string, signal: AbortSignal) => Promise<void>>(async () => undefined)
    const dependencies = { fetch: fetcher, now: () => now, verifyPublicHost }
    const worker = createRelayWorker(dependencies)
    expect((await worker.fetch(await request(grant), settings)).status).toBe(200)
    expect(verifyPublicHost).toHaveBeenCalledWith('cjdgxnffutfw.tnmr.org', expect.any(AbortSignal))
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('user-agent')).toBe('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36')
    expect((await worker.fetch(await request({ ...grant, hosts: ['evil.example'], url: 'https://evil.example/master.m3u8' }), settings)).status).toBe(403)
    expect((await worker.fetch(await request(grant), { ...settings, RELAY_DISCOVERY_PROVIDERS: '{}' })).status).toBe(403)
    expect((await worker.fetch(await request({ provider: 'aether', url: 'https://cjdgxnffutfw.tnmr.org/hls2/master.m3u8', headerHost: 'cjdgxnffutfw.tnmr.org', kind: 'hls' as const, headers: { 'user-agent': 'Mozilla/5.0' } }), settings)).status).toBe(403)
  })
  it('requires independent recipe opt-in, an exact signed scope and public DNS before fetching a rotating host', async () => {
    const settings={...env,RELAY_PROVIDERS:JSON.stringify({'wecollege-miami':['moon.zenoak.top']}),RELAY_DISCOVERY_PROVIDERS:JSON.stringify({'wecollege-miami':'wecollege-city-v1'})}
    const grant={provider:'wecollege-miami',url:'https://new-title.example/part.ts',kind:'auto' as const,headerHost:'moon.zenoak.top',recipe:'wecollege-city-v1' as const,hosts:['new-title.example']}
    const fetcher=vi.fn<typeof fetch>(async()=>new Response('media')),verifyPublicHost=vi.fn<(host:string,signal:AbortSignal)=>Promise<void>>(async()=>undefined),worker=createRelayWorker({fetch:fetcher,verifyPublicHost,now:()=>now})
    expect((await worker.fetch(await request(grant),settings)).status).toBe(200)
    expect(verifyPublicHost).toHaveBeenCalledWith('new-title.example',expect.any(AbortSignal))
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('referer')).toBe('https://movy.sx/')
    fetcher.mockClear()
    expect((await worker.fetch(await request(grant),{...settings,RELAY_DISCOVERY_PROVIDERS:'{}'})).status).toBe(403)
    expect(fetcher).not.toHaveBeenCalled()
    verifyPublicHost.mockRejectedValueOnce(new Error('Private DNS'))
    expect((await worker.fetch(await request(grant),settings)).status).toBe(502)
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('keeps rewritten children inside their signed scope and denies unleased manifests and redirects', async()=>{
    const settings={...env,RELAY_PROVIDERS:JSON.stringify({'wecollege-miami':['moon.zenoak.top']}),RELAY_DISCOVERY_PROVIDERS:JSON.stringify({'wecollege-miami':'wecollege-city-v1'})}
    const grant={provider:'wecollege-miami',url:'https://moon.zenoak.top/title.m3u8',headerHost:'moon.zenoak.top',recipe:'wecollege-city-v1' as const,hosts:['moon.zenoak.top','new-title.example']}
    const fetcher=vi.fn<typeof fetch>(async()=>new Response('#EXTM3U\n#EXTINF:6,\nhttps://new-title.example/part.ts\n',{headers:{'content-type':'application/vnd.apple.mpegurl'}}))
    const worker=createRelayWorker({fetch:fetcher,verifyPublicHost:async()=>undefined,now:()=>now}),response=await worker.fetch(await request(grant),settings)
    expect(response.status).toBe(200)
    const child=(await response.text()).split('\n').find(line=>line.startsWith('https://'))!
    const decoded=await (await createGrantCodec(secret)).open(new URL(child).pathname.slice(7),now)
    expect(decoded.hosts).toEqual(['new-title.example'])
    fetcher.mockImplementationOnce(async()=>new Response('#EXTM3U\n#EXTINF:6,\nhttps://unleased.example/part.ts\n'))
    expect((await worker.fetch(await request(grant),settings)).status).toBe(502)
    fetcher.mockImplementationOnce(async()=>new Response(null,{status:302,headers:{location:'https://unleased.example/part.ts'}}))
    expect((await worker.fetch(await request(grant),settings)).status).toBe(502)
  })
  it('keeps native HLS asset piping bounded without a JavaScript idle timer for each chunk', async () => {
    const req = await request({ kind: 'auto', url: 'https://media.example/segment.mp4' })
    vi.stubGlobal('IdentityTransformStream', TransformStream)
    vi.useFakeTimers()
    try {
      const cancel = vi.fn()
      const { worker, report } = setup(new Response(new ReadableStream({ pull() { return new Promise(() => {}) }, cancel })))
      const response = await worker.fetch(req, env)
      let ended = false
      const body = response.arrayBuffer().then(() => { ended = true }, () => { ended = true })
      await vi.advanceTimersByTimeAsync(15_000)
      expect(ended).toBe(false)
      await vi.advanceTimersByTimeAsync(45_000)
      await body
      expect(cancel).toHaveBeenCalled()
      expect(report).toHaveBeenCalledWith(expect.objectContaining({ status: 504, bytesKnown: false }))
    } finally { vi.useRealTimers(); vi.unstubAllGlobals() }
  })
  it('passes complete ranged HLS assets through native piping and reports their known length', async () => {
    vi.stubGlobal('IdentityTransformStream', TransformStream)
    vi.stubGlobal('FixedLengthStream', FixedLengthFixture)
    try {
      const { worker, report } = setup(new Response(new Uint8Array([1, 2, 3]), { status: 206,
        headers: { 'content-type': 'video/mp4', 'content-length': '3', 'content-range': 'bytes 0-2/999' } }))
      const response = await worker.fetch(await request({ kind: 'auto', url: 'https://media.example/segment.mp4' }, { headers: { Range: 'bytes=0-2' } }), env)
      expect(response.status).toBe(206)
      expect(response.headers.get('content-range')).toBe('bytes 0-2/999')
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
      await vi.waitFor(() => expect(report).toHaveBeenCalledWith(expect.objectContaining({ status: 206, bytes: 3, bytesKnown: true })))
    } finally { vi.unstubAllGlobals() }
  })
  it('keeps sniff-verified TS assets on native piping after preserving their prefix', async () => {
    const host = 'celestialdreamer.lol', bytes = new Uint8Array(564)
    bytes[0] = bytes[188] = bytes[376] = 0x47
    const req = await request({ provider: 'stormboron', kind: 'auto', url: `https://${host}/segment.html`, headerHost: host })
    const settings = { ...env, RELAY_PROVIDERS: JSON.stringify({ stormboron: [host] }) }
    vi.stubGlobal('IdentityTransformStream', TransformStream)
    vi.useFakeTimers()
    try {
      let sent = false
      const cancel = vi.fn()
      const { worker } = setup(new Response(new ReadableStream({ pull(controller) { if (!sent) { sent = true; controller.enqueue(bytes) } else return new Promise(() => {}) }, cancel }), { headers: { 'content-type': 'text/html' } }))
      const response = await worker.fetch(req, settings)
      const reader = response.body!.getReader()
      expect((await reader.read()).value).toEqual(bytes)
      let ended = false
      const pending = reader.read().then(() => { ended = true }, () => { ended = true })
      await vi.advanceTimersByTimeAsync(15_000)
      expect(ended).toBe(false)
      await vi.advanceTimersByTimeAsync(45_000)
      await pending
      expect(cancel).toHaveBeenCalled()
    } finally { vi.useRealTimers(); vi.unstubAllGlobals() }
  })
  it('rejects a truncated native asset rather than counting the declared length as delivered', async () => {
    vi.stubGlobal('IdentityTransformStream', TransformStream)
    vi.stubGlobal('FixedLengthStream', FixedLengthFixture)
    try {
      const { worker, report } = setup(new Response(new Uint8Array([1, 2]), { headers: { 'content-length': '3' } }))
      const response = await worker.fetch(await request({ kind: 'auto', url: 'https://media.example/segment.mp4' }), env)
      await expect(response.arrayBuffer()).rejects.toThrow()
      await vi.waitFor(() => expect(report).toHaveBeenCalledWith(expect.objectContaining({ status: 504, bytes: 0, bytesKnown: false })))
    } finally { vi.unstubAllGlobals() }
  })
  it('cancels native asset transfer on browser abort without claiming complete response bytes', async () => {
    vi.stubGlobal('IdentityTransformStream', TransformStream)
    try {
      const abort = new AbortController(), cancel = vi.fn()
      const { worker, report } = setup(new Response(new ReadableStream({ pull() { return new Promise(() => {}) }, cancel }), { headers: { 'content-length': '100' } }))
      const response = await worker.fetch(await request({ kind: 'auto', url: 'https://media.example/segment.mp4' }, { signal: abort.signal }), env)
      const body = response.arrayBuffer()
      const rejected = expect(body).rejects.toThrow()
      abort.abort()
      await rejected
      await vi.waitFor(() => expect(report).toHaveBeenCalledWith(expect.objectContaining({ status: 499, bytes: 0, bytesKnown: false })))
      expect(cancel).toHaveBeenCalled()
    } finally { vi.unstubAllGlobals() }
  })
  it('forwards only the reviewed public WeCollege Referer to its approved split media hosts', async () => {
    for (const provider of ['wecollege-miami', 'wecollege-boise']) {
      for (const host of ['ultramoss.top', 'emberwave.top', 'rapidmesa.top']) {
        const settings = { ...env, RELAY_PROVIDERS: JSON.stringify({ [provider]: ['moon.zenoak.top', host] }) }
        const grant = { provider, url: `https://${host}/segment.mp4`, headerHost: 'moon.zenoak.top', headers: { origin: 'https://movy.sx', referer: 'https://movy.sx/' }, kind: 'auto' as const }
        const { worker, fetcher } = setup(new Response('media'))
        expect((await worker.fetch(await request(grant), settings)).status).toBe(200)
        const outgoing = new Headers(fetcher.mock.calls[0]?.[1]?.headers)
        expect(outgoing.get('referer')).toBe('https://movy.sx/')
        expect(outgoing.has('origin')).toBe(false)
        const denied = setup(new Response('media'))
        expect((await denied.worker.fetch(await request(grant), { ...settings, RELAY_PROVIDERS: JSON.stringify({ [provider]: ['moon.zenoak.top'] }) })).status).toBe(403)
        expect(denied.fetcher).not.toHaveBeenCalled()
      }
    }
  })
  it('preserves Aphrodite Referer through its exact master, transcode and segment host graph', async () => {
    const hosts = ['stream.hls.lol', 'iad-01.transcode.cfd', 'totallyacdn.org']
    const settings = { ...env, RELAY_PROVIDERS: JSON.stringify({ aphrodite: hosts }) }
    const grant = { provider: 'aphrodite', url: 'https://stream.hls.lol/helios/master.m3u8', headerHost: 'stream.hls.lol',
      headers: { referer: 'https://atlantic.st/' }, kind: 'hls' as const }
    const fetcher = vi.fn<typeof fetch>(async input => {
      const url = new URL(String(input))
      if (url.hostname === 'stream.hls.lol') return new Response('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000\nhttps://iad-01.transcode.cfd/variant.m3u8\n', { headers: { 'content-type': 'application/vnd.apple.mpegurl' } })
      if (url.hostname === 'iad-01.transcode.cfd') return new Response('#EXTM3U\n#EXTINF:6,\nhttps://totallyacdn.org/segment.ts\n#EXT-X-ENDLIST\n', { headers: { 'content-type': 'application/vnd.apple.mpegurl' } })
      return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'video/mp2t' } })
    })
    const worker = createRelayWorker({ fetch: fetcher, now: () => now })
    const master = await worker.fetch(await request(grant), settings)
    expect(master.status).toBe(200)
    const variantUrl = new URL((await master.text()).split('\n').find(line => line.startsWith('https://'))!)
    const variant = await worker.fetch(new Request(variantUrl, { headers: { origin } }), settings)
    expect(variant.status).toBe(200)
    const segmentUrl = new URL((await variant.text()).split('\n').find(line => line.startsWith('https://'))!)
    const segment = await worker.fetch(new Request(segmentUrl, { headers: { origin } }), settings)
    expect(segment.status).toBe(200)
    expect(await segment.arrayBuffer()).toEqual(new Uint8Array([1, 2, 3]).buffer)
    for (const call of fetcher.mock.calls) expect(new Headers(call[1]?.headers).get('referer')).toBe('https://atlantic.st/')
    expect(fetcher.mock.calls.map(([url]) => new URL(String(url)).hostname)).toEqual(hosts)
    const denied = await worker.fetch(await request({ ...grant, url: 'https://unapproved.transcode.cfd/variant.m3u8' }), settings)
    expect(denied.status).toBe(403)
  })

  it('preserves JustAnime site headers on its approved CDN segment hosts', async () => {
    const { fetcher, worker } = setup(new Response(new Uint8Array([0, 0, 0]), { status: 200 }))
    const settings = { ...env, RELAY_PROVIDERS: JSON.stringify({ justanime: ['core.justanime.to', 'vault-92.rundowncdn.top'] }) }
    const grant = { provider: 'justanime', url: 'https://vault-92.rundowncdn.top/segment.ts', headerHost: 'core.justanime.to',
      headers: { origin: 'https://justanime.to', referer: 'https://justanime.to/', 'user-agent': 'JustAnime test agent' }, kind: 'auto' as const }
    const response = await worker.fetch(await request(grant), settings)
    expect(response.status).toBe(200)
    const outgoing = new Headers(fetcher.mock.calls[0]?.[1]?.headers)
    expect(outgoing.get('origin')).toBe('https://justanime.to')
    expect(outgoing.get('referer')).toBe('https://justanime.to/')
    expect(outgoing.get('user-agent')).toBe('JustAnime test agent')
  })

  it('preserves AniClover and AnimeDex site headers on their approved nested media hosts', async () => {
    for (const [provider, headerHost, nestedHost, referrer] of [
      ['aniclover', 'beta.zanora.xyz', 'misty-thistle-2c17.kvofjofh103.workers.dev', 'https://aniclover.cc/'],
      ['animedex', 'new.vidnest.fun', 'vidnest.fun', 'https://vidnest.fun/'],
    ]) {
      const { fetcher, worker } = setup(new Response(new Uint8Array([0, 0, 0]), { status: 200 }))
      const settings = { ...env, RELAY_PROVIDERS: JSON.stringify({ [provider!]: [headerHost!, nestedHost!] }) }
      const grant = { provider: provider!, url: `https://${nestedHost}/segment.ts`, headerHost: headerHost!,
        headers: { origin: new URL(referrer!).origin, referer: referrer! }, kind: 'auto' as const }
      const response = await worker.fetch(await request(grant), settings)
      expect(response.status).toBe(200)
      const outgoing = new Headers(fetcher.mock.calls[0]?.[1]?.headers)
      expect(outgoing.get('origin')).toBe(new URL(referrer!).origin)
      expect(outgoing.get('referer')).toBe(referrer)
    }
  })
  it('accepts only verified TS bytes from reviewed HTML-labelled hosts despite their content type', async () => {
    const bytes = new Uint8Array(564); bytes[0] = bytes[188] = bytes[376] = 0x47
    for (const [provider, host] of [['stormboron', 'celestialdreamer.lol'], ['stormboron', 'moonfirekeeper.lol'], ['stormboron', 'emberwindkeeper.lol'], ['zeta', 'remoteconsultinggroup.site'], ['embedmaster', 'perfectbussines.website']]) {
      const grant = { provider: provider!, url: `https://${host}/segment.html`, headerHost: host!, kind: 'auto' as const }
      const settings = { ...env, RELAY_PROVIDERS: JSON.stringify({ [provider!]: [host] }) }
      const { worker } = setup(new Response(bytes, { headers: { 'content-type': 'text/html' } }))
      const response = await worker.fetch(await request(grant), settings)
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toBe('video/mp2t')
      expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes)
      expect((await setup(new Response('<html>Denied</html>', { headers: { 'content-type': 'text/html' } })).worker.fetch(await request(grant), settings)).status).toBe(502)
    }
    expect((await setup(new Response(bytes, { headers: { 'content-type': 'text/html' } })).worker.fetch(await request({ kind: 'native' }), env)).status).toBe(502)
  })
  it('accepts structurally verified Mapple fragmented MP4 while rejecting HTML and forged boxes', async () => {
    const bytes = new Uint8Array(564), view = new DataView(bytes.buffer)
    const box = (at: number, size: number, type: string) => { view.setUint32(at, size); bytes.set(new TextEncoder().encode(type), at + 4) }
    box(0, 64, 'moof'); box(8, 16, 'mfhd'); box(24, 40, 'traf'); box(64, 500, 'mdat')
    const host = 'proxy2.jordanblackwell.bid'
    const grant = { provider: 'mapple', url: `https://${host}/4k.m4s`, headerHost: host, kind: 'auto' as const }
    const settings = { ...env, RELAY_PROVIDERS: JSON.stringify({ mapple: [host] }) }
    const response = await setup(new Response(bytes, { headers: { 'content-type': 'text/html' } })).worker.fetch(await request(grant), settings)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('video/mp4')
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes)
    for (const body of ['<html>Denied</html>', new Uint8Array(564)]) {
      const result = await setup(new Response(body, { headers: { 'content-type': 'text/html' } })).worker.fetch(await request(grant), settings)
      expect(result.status).toBe(502)
    }
    bytes[12] = 0
    expect((await setup(new Response(bytes, { headers: { 'content-type': 'text/html' } })).worker.fetch(await request(grant), settings)).status).toBe(502)
  })
  it('decodes the fixed BingeBang manifest recipe, rewrites nested jpg fetches and leaves native bytes untouched', async () => {
    const encoded = Uint8Array.from(atob('fieJnDiqINzOWUvTmYBfd5DE0fjvYstZj9WA/mm0DIoZNpn1RJMDt591cunA9h8Xsa6e'), char => char.charCodeAt(0))
    const envBinge = { ...env, RELAY_PROVIDERS: JSON.stringify({ bingebangymovies: ['os.bingebangstream.online'] }) }
    for (const host of ['os.bingebangstream.online', 'reliablephonerepairs.website']) {
      const hostEnv = { ...env, RELAY_PROVIDERS: JSON.stringify({ bingebangymovies: [host] }) }
      const { worker, fetcher } = setup(new Response(encoded, { headers: { 'content-type': 'image/jpeg' } }))
      const root = await worker.fetch(await request({ provider: 'bingebangymovies', url: `https://${host}/master.m3u8`, headerHost: host }), hostEnv)
      expect(root.status).toBe(200)
      expect(fetcher.mock.calls[0]?.[0]).toBe(`https://${host}/master.jpg`)
      const text = await root.text()
      expect(text).toContain('#EXT-X-STREAM-INF')
      const codec = await createGrantCodec(secret)
      const child = await codec.open(text.split('\n')[2]!.split('/media/')[1]!, now)
      expect(child).toMatchObject({ url: `https://${host}/variant.m3u8`, kind: 'hls' })
    }
    const native = setup(new Response(new Uint8Array([0, 1, 2, 3]), { status: 206 }))
    const segment = await native.worker.fetch(await request({ provider: 'bingebangymovies', url: 'https://os.bingebangstream.online/segment.mp4', headerHost: 'os.bingebangstream.online', kind: 'auto' }, { headers: { Range: 'bytes=0-3' } }), envBinge)
    expect([...new Uint8Array(await segment.arrayBuffer())]).toEqual([0, 1, 2, 3])
    expect(native.fetcher.mock.calls[0]?.[0]).toBe('https://os.bingebangstream.online/segment.mp4')
    const other = setup(new Response(encoded))
    expect((await other.worker.fetch(await request(), env)).status).toBe(502)
  })
  it.each(['bingebangymovies', 'rigel'])('bounds %s large playlists separately and still denies off-host references', async (provider) => {
    const large = '#EXTM3U\n# comment ' + 'x'.repeat(600_000) + '\n#EXTINF:6,\nseg.mp4\n'
    const settings = { ...env, RELAY_PROVIDERS: JSON.stringify({ [provider]: ['os.bingebangstream.online'] }) }
    const grant = { provider, url: 'https://os.bingebangstream.online/master.m3u8', headerHost: 'os.bingebangstream.online' }
    expect((await setup(new Response(large)).worker.fetch(await request(grant), settings)).status).toBe(200)
    expect((await setup(new Response(large)).worker.fetch(await request(), env)).status).toBe(502)
    expect((await setup(new Response('#EXTM3U\n#EXTINF:6,\nhttps://evil.example/a.mp4\n')).worker.fetch(await request(grant), settings)).status).toBe(502)
    expect((await setup(new Response('#EXTM3U\n' + 'x'.repeat(1_048_577))).worker.fetch(await request(grant), settings)).status).toBe(502)
  })
  it('adds only the fixed Zoko split-host hints and preserves generic original-host scope', async () => {
    const settings = { ...env, RELAY_PROVIDERS: JSON.stringify({ zoko: ['hls.dramahot.top', 'hls1.drama1.cfd'] }) }
    const { worker, fetcher } = setup(new Response('segment'))
    const grant = { provider: 'zoko', url: 'https://hls1.drama1.cfd/segment.ts', headerHost: 'hls.dramahot.top', kind: 'auto' as const }
    expect((await worker.fetch(await request(grant), settings)).status).toBe(200)
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).get('origin')).toBe('https://zokoanime.video')
    const denied = setup(new Response('segment'))
    expect((await denied.worker.fetch(await request(grant), { ...settings, RELAY_PROVIDERS: JSON.stringify({ zoko: ['hls.dramahot.top'] }) })).status).toBe(403)
    expect(denied.fetcher).not.toHaveBeenCalled()
  })
  it('rewrites nested playlists, alternate audio, keys, maps and segments into independently bound grants', async () => {
    const text = '#EXTM3U\n#EXT-X-MEDIA:TYPE=AUDIO,URI="https://audio.example/audio.m3u8"\n#EXT-X-KEY:METHOD=AES-128,URI="key.bin"\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:6,\nsegment.ts?signature=abc\nvariant.m3u8\n'
    const { worker, fetcher, report } = setup(new Response(text, { headers: { 'content-type': 'application/vnd.apple.mpegurl', 'set-cookie': 'secret' } }))
    const result = await worker.fetch(await request(), env)
    expect(result.status).toBe(200)
    expect(result.headers.get('access-control-allow-origin')).toBe(origin)
    expect(result.headers.get('set-cookie')).toBeNull()
    const output = await result.text()
    expect(output).not.toContain('media.example')
    const urls = output.match(/https:\/\/edge\.example\/media\/[A-Za-z0-9_-]+/g)!
    expect(urls).toHaveLength(5)
    const codec = await createGrantCodec(secret)
    const children = await Promise.all(urls.map(url => codec.open(new URL(url).pathname.slice(7), now)))
    expect(children.map(child => child.url)).toEqual(['https://audio.example/audio.m3u8', 'https://media.example/key.bin', 'https://media.example/init.mp4', 'https://media.example/segment.ts?signature=abc', 'https://media.example/variant.m3u8'])
    expect(children.every(child => child.depth === 1 && child.expires === base.expires)).toBe(true)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ provider: 'owned', kind: 'manifest', status: 200 }))
  })
  it.each(['https://evil.example/a.ts', 'http://media.example/a.ts', 'https://127.0.0.1/a.ts', 'https://user:pass@media.example/a.ts', 'https://media.example:444/a.ts', 'data:application/octet-stream,abc'])('rejects hostile playlist destination %s', async ref => {
    const { worker, fetcher } = setup(new Response(`#EXTM3U\n#EXTINF:6,\n${ref}\n`))
    expect((await worker.fetch(await request(), env)).status).toBe(502)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('reports only the hostname for blocked playlist destinations', async () => {
    const { worker, report } = setup(new Response('#EXTM3U\n#EXTINF:6,\nhttps://cdn.unapproved.example/secret/path?token=private\n'))
    expect((await worker.fetch(await request(), env)).status).toBe(502)
    expect(report).toHaveBeenCalledWith(expect.objectContaining({
      provider: 'owned', kind: 'manifest', status: 502, stage: 'manifest-host-scope', blockedHost: 'cdn.unapproved.example',
    }))
    expect(JSON.stringify(report.mock.calls)).not.toContain('secret/path')
    expect(JSON.stringify(report.mock.calls)).not.toContain('private')
  })
  it.each(['#EXTM3U\n#EXT-X-DEFINE:NAME="x",VALUE="evil"\n', '#EXTM3U\n#EXT-X-CONTENT-STEERING:SERVER-URI="https://media.example/x"', '<html>error</html>', '#EXTM3U\n' + 'a'.repeat(512 * 1024)])('rejects unsupported or oversized manifests', async text => {
    const { worker } = setup(new Response(text))
    expect((await worker.fetch(await request(), env)).status).toBe(502)
  })
  it('limits nested playlists', async () => {
    const { worker } = setup(new Response('#EXTM3U\nsegment.ts'))
    expect((await worker.fetch(await request({ depth: 5 }), env)).status).toBe(502)
  })
  it('rejects partial manifests and preserves explicit playlist kinds for extensionless children', async () => {
    const { worker } = setup(() => new Response('#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000\nvariant\n'))
    const response = await worker.fetch(await request(), env)
    const codec = await createGrantCodec(secret)
    const token = (await response.text()).match(/\/media\/([A-Za-z0-9_-]+)/)![1]!
    expect(await codec.open(token, now)).toMatchObject({ url: 'https://media.example/variant', kind: 'hls' })
    expect((await worker.fetch(await request({}, { headers: { Range: 'bytes=0-10' } }), env)).status).toBe(416)
  })
  it('terminates stalled binary reads and reports the failure without logging URLs', async () => {
    const req = await request({ kind: 'native' })
    vi.useFakeTimers()
    try {
      const { worker, report } = setup(new Response(new ReadableStream({ pull() { return new Promise(() => {}) } })))
      const response = await worker.fetch(req, env)
      const body = response.arrayBuffer()
      const rejected = expect(body).rejects.toThrow('Media transfer failed')
      await vi.advanceTimersByTimeAsync(15_000)
      await rejected
      expect(report).toHaveBeenCalledWith(expect.objectContaining({ status: 504, bytes: 0 }))
      expect(JSON.stringify(report.mock.calls)).not.toContain('media.example')
    } finally { vi.useRealTimers() }
  })
  it('streams byte ranges and strips upstream cookies, CORS and other response headers', async () => {
    const { worker, fetcher, report } = setup(new Response(new Uint8Array([1, 2, 3]), { status: 206, headers: {
      'content-type': 'video/mp4', 'content-length': '3', 'content-range': 'bytes 0-2/999', 'accept-ranges': 'bytes', 'set-cookie': 'secret', 'access-control-allow-origin': '*',
    } }))
    const result = await worker.fetch(await request({ kind: 'native', url: 'https://media.example/video.mp4' }, { headers: { Range: 'bytes=0-2', Cookie: 'member-secret', Authorization: 'member-secret' } }), env)
    expect(result.status).toBe(206)
    expect(new Uint8Array(await result.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
    expect(result.headers.get('content-range')).toBe('bytes 0-2/999')
    expect(result.headers.get('set-cookie')).toBeNull()
    const sent = new Headers(fetcher.mock.calls[0]![1]!.headers)
    expect(sent.get('range')).toBe('bytes=0-2')
    expect(sent.get('referer')).toBe(origin)
    expect(sent.get('cookie')).toBeNull()
    expect(sent.get('authorization')).toBeNull()
    expect(report).toHaveBeenCalledWith(expect.objectContaining({ bytes: 3, status: 206 }))
  })
  it('validates each redirect and removes hints across hosts', async () => {
    const { worker, fetcher } = setup(url => url.includes('master')
      ? new Response(null, { status: 302, headers: { location: 'https://audio.example/play.m3u8' } }) : new Response('#EXTM3U\npart.ts'))
    const result = await worker.fetch(await request(), env)
    expect(result.status).toBe(200)
    expect(new Headers(fetcher.mock.calls[1]![1]!.headers).get('referer')).toBeNull()
    const codec = await createGrantCodec(secret)
    const child = (await result.text()).match(/https:\/\/edge.example\/media\/([A-Za-z0-9_-]+)/)![1]!
    expect((await codec.open(child, now)).url).toBe('https://audio.example/part.ts')
    const denied = setup(new Response(null, { status: 302, headers: { location: 'https://evil.example/a' } }))
    expect((await denied.worker.fetch(await request(), env)).status).toBe(502)
    expect(denied.fetcher).toHaveBeenCalledTimes(1)
  })
  it('supports HEAD and range preflight without buffering video', async () => {
    const { worker, fetcher } = setup(new Response(null, { headers: { 'content-length': '999' } }))
    const head = await worker.fetch(await request({ kind: 'native' }, { method: 'HEAD' }), env)
    expect(head.headers.get('content-length')).toBe('999')
    expect(await head.text()).toBe('')
    expect(fetcher.mock.calls[0]![1]!.method).toBe('HEAD')
    const preflight = await worker.fetch(new Request(edge, { method: 'OPTIONS', headers: { Origin: origin } }), env)
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-headers')).toBe('Range')
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('fails closed on the kill switch, removed hosts, bad origin, malformed grants, unsupported methods and multiple ranges', async () => {
    const { worker, fetcher } = setup(new Response('media'))
    expect((await worker.fetch(await request(), { ...env, RELAY_ENABLED: 'false' })).status).toBe(503)
    expect((await worker.fetch(await request(), { ...env, RELAY_PROVIDERS: '{}' })).status).toBe(403)
    expect((await worker.fetch(await request(), { ...env, RELAY_PROVIDERS: '{"owned":["*.example"]}' })).status).toBe(403)
    expect((await worker.fetch(await request({}, { headers: { Origin: 'https://evil.example' } }), env)).status).toBe(403)
    expect((await worker.fetch(new Request(`${edge}/media/invalid`), env)).status).toBe(403)
    expect((await worker.fetch(await request({}, { method: 'POST' }), env)).status).toBe(405)
    expect((await worker.fetch(await request({}, { headers: { Range: 'bytes=0-1,3-4' } }), env)).status).toBe(416)
    const expired = createRelayWorker({ fetch: fetcher, now: () => base.expires })
    expect((await expired.fetch(await request(), env)).status).toBe(403)
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('fails closed on upstream outage or HTML and preserves unsatisfiable range status', async () => {
    for (const response of [new Response('bad', { status: 500 }), new Response('html', { headers: { 'content-type': 'text/html' } })]) {
      const { worker } = setup(response)
      expect((await worker.fetch(await request({ kind: 'native' }), env)).status).toBe(502)
    }
    const { worker } = setup(new Response(null, { status: 416, headers: { 'content-range': 'bytes */100' } }))
    expect((await worker.fetch(await request({ kind: 'native' }), env)).status).toBe(416)
  })
})
