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
  it('continues accepting object grants issued before the compact wire format', async () => {
    const encoder = new TextEncoder()
    const key = await crypto.subtle.importKey('raw', await crypto.subtle.digest('SHA-256', encoder.encode(secret)), 'AES-GCM', false, ['encrypt'])
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: encoder.encode('consumit-media-v1') }, key, encoder.encode(JSON.stringify(base)))
    const token = Buffer.concat([iv, new Uint8Array(encrypted)]).toString('base64url')
    expect(await (await createGrantCodec(secret)).open(token, now)).toEqual(base)
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
})
describe('Worker delivery boundary', () => {
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
  it('accepts only verified TS bytes from reviewed Storm/Zeta hosts despite their HTML content type', async () => {
    const bytes = new Uint8Array(564); bytes[0] = bytes[188] = bytes[376] = 0x47
    for (const [provider, host] of [['stormboron', 'celestialdreamer.lol'], ['stormboron', 'moonfirekeeper.lol'], ['stormboron', 'emberwindkeeper.lol'], ['zeta', 'remoteconsultinggroup.site']]) {
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
  it('decodes the fixed BingeBang manifest recipe, rewrites nested jpg fetches and leaves native bytes untouched', async () => {
    const encoded = Uint8Array.from(atob('fieJnDiqINzOWUvTmYBfd5DE0fjvYstZj9WA/mm0DIoZNpn1RJMDt591cunA9h8Xsa6e'), char => char.charCodeAt(0))
    const envBinge = { ...env, RELAY_PROVIDERS: JSON.stringify({ bingebangymovies: ['os.bingebangstream.online'] }) }
    const { worker, fetcher } = setup(new Response(encoded, { headers: { 'content-type': 'image/jpeg' } }))
    const root = await worker.fetch(await request({ provider: 'bingebangymovies', url: 'https://os.bingebangstream.online/master.m3u8', headerHost: 'os.bingebangstream.online' }), envBinge)
    expect(root.status).toBe(200)
    expect(fetcher.mock.calls[0]?.[0]).toBe('https://os.bingebangstream.online/master.jpg')
    const text = await root.text()
    expect(text).toContain('#EXT-X-STREAM-INF')
    const codec = await createGrantCodec(secret)
    const child = await codec.open(text.split('\n')[2]!.split('/media/')[1]!, now)
    expect(child).toMatchObject({ url: 'https://os.bingebangstream.online/variant.m3u8', kind: 'hls' })
    const native = setup(new Response(new Uint8Array([0, 1, 2, 3]), { status: 206 }))
    const segment = await native.worker.fetch(await request({ provider: 'bingebangymovies', url: 'https://os.bingebangstream.online/segment.mp4', headerHost: 'os.bingebangstream.online', kind: 'auto' }, { headers: { Range: 'bytes=0-3' } }), envBinge)
    expect([...new Uint8Array(await segment.arrayBuffer())]).toEqual([0, 1, 2, 3])
    expect(native.fetcher.mock.calls[0]?.[0]).toBe('https://os.bingebangstream.online/segment.mp4')
    const other = setup(new Response(encoded))
    expect((await other.worker.fetch(await request(), env)).status).toBe(502)
  })
  it('bounds BingeBang large playlists separately and still denies off-host encoded references', async () => {
    const large = '#EXTM3U\n# comment ' + 'x'.repeat(600_000) + '\n#EXTINF:6,\nseg.mp4\n'
    const settings = { ...env, RELAY_PROVIDERS: JSON.stringify({ bingebangymovies: ['os.bingebangstream.online'] }) }
    const grant = { provider: 'bingebangymovies', url: 'https://os.bingebangstream.online/master.m3u8', headerHost: 'os.bingebangstream.online' }
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
