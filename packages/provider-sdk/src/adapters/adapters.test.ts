import { Buffer } from 'node:buffer'
import { describe, expect, it, vi } from 'vitest'
import { allowedMediaUrl, createVixsrcProvider, createNhdapiProvider, createVaPlayerProvider, createVidcoreProvider, createInsertunitProvider, createMappleProvider, createStigstreamProvider, createWecollegeProvider, createPersesProvider, createRivestreamProvider, createVidapiProvider, createVidloveProvider, createScreenscapeProvider, createVidrockProvider, createVidnestProvider, createNetmirrorProvider, createVidstormProvider, createVidlinkProvider, createVidvaultProvider, createModiplayProvider, createCinehdProvider, createNxshaProvider, createStellarProvider, createAphroditeProvider, type ProviderHttp } from '../index.ts'
import { encodeNxshaPayload } from './nxsha.ts'
import { decipherPayload } from './vidnest.ts'
import { decryptWecollegePayload, keystream } from './wecollege-cipher.ts'
import { accessDeadline } from './http.ts'

const now = Date.UTC(2026, 8, 9)
const input = { ref: { kind: 'movie' as const, id: 1 }, region: 'US', audioLanguage: 'en' }
const episode = { ...input, ref: { kind: 'series' as const, id: 2, season: 3, episode: 4 } }
function http(...responses: { status?: number; text: string }[]) {
  return vi.fn<ProviderHttp>(async (url, _headers, signal) => {
    signal.throwIfAborted()
    const next = responses.shift()
    if (!next) throw new Error('Unexpected request')
    return { status: next.status ?? 200, text: next.text, url }
  })
}
function vixPage(expires = now / 1000 + 3600) { return `window.masterPlaylist = { params: {'token': 'test-access', 'expires': '${expires}'}, url: 'https://vixsrc.to/playlist' };` }
const playlist = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000000\nvideo.m3u8'
const mediaPlaylist = '#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:6,\nseg.ts'

describe('imported provider contracts', () => {
  for (const [label, request, path] of [['movie', input, '/movie/1'], ['episode', episode, '/tv/2/3/4']] as const) {
    it(`resolves VixSrc ${label} through its API and validates the adaptive manifest`, async () => {
      const client = http({ text: '{"src":"/player/title"}' }, { text: vixPage() }, { text: playlist })
      const result = await createVixsrcProvider(client, () => now).resolve(request, new AbortController().signal)
      expect(client.mock.calls[0]?.[0]).toBe(`https://vixsrc.to/api${path}`)
      expect(result).toMatchObject({ ok: true, sources: [{ key: 'original-hls', type: 'hls', language: 'original', headers: { referer: `https://vixsrc.to/api${path}` } }] })
    })
    it(`resolves NHD ${label} with a per-request key and nullable metadata`, async () => {
      const client = http({ text: `var API_PATH = "/api${path}"; var API_KEY = "temporary";` }, { text: JSON.stringify({ success: true, m3u8: 'https://media.example/movie.m3u8', cookies: null, referer: null, kind: 'hls' }) }, { text: mediaPlaylist })
      expect(await createNhdapiProvider(client, () => now).resolve(request, new AbortController().signal)).toMatchObject({ ok: true, sources: [{ key: 'original', type: 'hls', language: 'original' }] })
      expect(new URL(client.mock.calls[1]![0]).pathname).toBe(`/api${path}`)
      expect(new URL(client.mock.calls[1]![0]).searchParams.get('key')).toBe('temporary')
    })
  }
  for (const [name, factory] of [
    ['vixsrc', (client: ProviderHttp) => createVixsrcProvider(client)],
    ['nhdapi', (client: ProviderHttp) => createNhdapiProvider(client)],
  ] as const) {
    it(`${name} distinguishes missing titles, cancellation, timeout, and malformed documents`, async () => {
      expect(await factory(http({ status: 404, text: '' })).resolve(input, new AbortController().signal)).toMatchObject({ code: 'empty' })
      const client = http()
      expect(await factory(client).resolve(input, AbortSignal.abort())).toMatchObject({ code: 'cancelled' })
      expect(await factory(client).resolve(input, AbortSignal.abort(new DOMException('deadline', 'TimeoutError')))).toMatchObject({ code: 'timeout' })
      expect(client).not.toHaveBeenCalled()
      expect(await factory(http({ text: '<html>Unavailable</html>' })).resolve(input, new AbortController().signal)).toMatchObject({ code: 'malformed' })
    })
  }
  it('rejects expired VixSrc access before fetching media and rejects cross-origin page redirects', async () => {
    const expired = http({ text: '{"src":"/page"}' }, { text: vixPage(now / 1000) })
    expect(await createVixsrcProvider(expired, () => now).resolve(input, new AbortController().signal)).toMatchObject({ code: 'empty' })
    expect(expired).toHaveBeenCalledTimes(2)
    expect(await createVixsrcProvider(http({ text: '{"src":"https://attacker.example/page"}' })).resolve(input, new AbortController().signal)).toMatchObject({ code: 'malformed' })
  })
  it('rejects an NHD page pointing at a different episode', async () => {
    const client = http({ text: 'var API_PATH = "/api/tv/2/1/1";' })
    expect(await createNhdapiProvider(client).resolve(episode, new AbortController().signal)).toMatchObject({ code: 'malformed' })
    expect(client).toHaveBeenCalledTimes(1)
  })
  it('resolves Perses movies and episodes through streamguide with dedupe', async () => {
    const body = JSON.stringify({ providers: [
      { name: 'Nova', sources: [
        { url: 'https://cdn.example/a.m3u8', quality: '1080p', language: 'English' },
        { url: 'https://cdn.example/a.m3u8', quality: '1080p' },
        { url: 'http://cdn.example/b.mp4', quality: '720p' },
      ] },
    ] })
    const movie = await createPersesProvider(http({ text: body }), () => now).resolve(input, new AbortController().signal)
    expect(movie).toMatchObject({ ok: true, sources: [{ key: 'nova:1080p:0', type: 'hls', headers: { referer: 'https://vidcore.org/' } }] })
    const episodeClient = http({ text: body })
    await createPersesProvider(episodeClient, () => now).resolve(episode, new AbortController().signal)
    expect(episodeClient.mock.calls[0]?.[0]).toBe('https://streamguide.cfd/Perses/tv/2/3/4')
  })
  it('resolves RiveStream movies across sub-providers with sanitized proxy headers', async () => {
    const valhalla = `https://valhallastream.dpdns.org/m3u8-proxy?url=${encodeURIComponent('https://cdn.example/inner.m3u8')}&headers=${encodeURIComponent(JSON.stringify({ Referer: 'https://example.com/', Cookie: 'steal-me', 'X-Evil': '1' }))}`
    const scrapperBody = JSON.stringify({ data: { sources: [
      { url: 'https://cdn.example/en.m3u8', quality: '1080p' },
      { url: valhalla, quality: '720p' },
      { url: 'not a url', quality: '480p' },
    ] } })
    const client = vi.fn<ProviderHttp>(async (url, _headers, signal) => {
      signal.throwIfAborted()
      if (url.includes('scrapper.rivestream.app')) return { status: 200, text: scrapperBody, url }
      if (url.endsWith('.m3u8')) return { status: 200, text: mediaPlaylist, url }
      throw new Error(`Unexpected ${url}`)
    })
    const result = await createRivestreamProvider(client, () => now).resolve(input, new AbortController().signal)
    expect(result).toMatchObject({ ok: true, sources: [
      { key: 'citadel:1080p:0', type: 'hls', language: 'English', headers: {}, height: 1080, qualityHint: '1080p' },
      { key: 'citadel:720p:1', headers: { referer: 'https://example.com/' } },
    ] })
    expect(result.ok && result.sources[1]?.headers).not.toHaveProperty('Cookie')
    expect(result.ok && result.sources[1]?.headers).not.toHaveProperty('X-Evil')
  })
  it('unwraps RiveStream proxy framing without headers instead of dropping the source', async () => {
    const bare = `https://proxy.valhallastream.dpdns.org/proxy?url=${encodeURIComponent('https://cdn.example/direct.m3u8')}`
    const client = vi.fn<ProviderHttp>(async (url, _headers, signal) => {
      signal.throwIfAborted()
      if (url.includes('scrapper.rivestream.app')) {
        return { status: 200, text: JSON.stringify({ data: { sources: [{ url: bare, quality: 'HLS' }] } }), url }
      }
      if (url.endsWith('.m3u8')) return { status: 200, text: mediaPlaylist, url }
      throw new Error(`Unexpected ${url}`)
    })
    const result = await createRivestreamProvider(client, () => now).resolve(input, new AbortController().signal)
    expect(result).toMatchObject({ ok: true, sources: [{ type: 'hls', headers: { referer: 'https://nextgencloudfabric.com/' } }] })
  })
  it('parses RiveStream suffixed qualities into heights and keeps captions', async () => {
    const client = vi.fn<ProviderHttp>(async (url, _headers, signal) => {
      signal.throwIfAborted()
      if (url.includes('scrapper.rivestream.app')) {
        return { status: 200, text: JSON.stringify({ data: {
          sources: [{ url: 'https://cdn.example/film.m3u8', quality: '720p | English' }],
          captions: [{ file: 'https://cdn.example/en.vtt', label: 'English', language: 'English', type: 'vtt' }],
        } }), url }
      }
      if (url.endsWith('.m3u8')) return { status: 200, text: mediaPlaylist, url }
      throw new Error(`Unexpected ${url}`)
    })
    const result = await createRivestreamProvider(client, () => now).resolve(input, new AbortController().signal)
    expect(result).toMatchObject({ ok: true, sources: [{ height: 720, qualityHint: '720p' }] })
    expect(result.ok && result.sources[0]?.subtitles).toMatchObject([{ format: 'vtt' }])
  })
  it('resolves RiveStream episodes and prefers original audio over dubs', async () => {
    const slow = vi.fn<ProviderHttp>(async (url, _headers, signal) => {
      signal.throwIfAborted()
      if (url.endsWith('.m3u8')) return { status: 200, text: mediaPlaylist, url }
      const body = (sources: unknown) => ({ status: 200, text: JSON.stringify({ data: { sources } }), url })
      if (url.includes('provider=quasar')) return body([{ url: 'https://cdn.example/fr.m3u8', quality: '720p' }])
      await new Promise((resolve) => setTimeout(resolve, 60))
      if (url.includes('provider=citadel')) return body([{ url: 'https://cdn.example/en.m3u8', quality: '1080p' }])
      return body([])
    })
    const result = await createRivestreamProvider(slow, () => now).resolve(episode, new AbortController().signal)
    expect(slow.mock.calls[0]?.[0]).toBe('https://scrapper.rivestream.app/api/provider?provider=citadel&id=2&season=3&episode=4')
    // The French sub answered first, yet English still leads the ranking.
    expect(result).toMatchObject({ ok: true, sources: [{ language: 'English' }, { language: 'French' }] })
  })
  it('resolves NHD dubs, failover exclusion, and keyless subtitles', async () => {
    const api = (extra: object) => ({ text: JSON.stringify({ success: true, m3u8: 'https://media.example/movie.m3u8', kind: 'hls', ...extra }) })
    const subs = { text: JSON.stringify({ subtitles: [{ url: 'https://media.example/en.vtt', display: 'English', format: 'vtt' }] }) }
    const client = http(
      { text: 'var API_PATH = "/api/movie/1"; var API_KEY = "k";' },
      { text: JSON.stringify({ success: false, provider: 'dead' }) },
      api({}),
      { text: mediaPlaylist },
      subs,
    )
    const result = await createNhdapiProvider(client, () => now).resolve(input, new AbortController().signal)
    expect(client.mock.calls[2]?.[0]).toContain('exclude=dead')
    expect(result).toMatchObject({ ok: true, sources: [{ key: 'original', type: 'hls' }] })
    expect(result.ok && result.sources[0]?.subtitles).toMatchObject([{ id: 'nhd-sub-0', label: 'English', format: 'vtt' }])
  })
  it('resolves NHD multi-dub siblings as separate sources', async () => {
    const client = http(
      { text: 'var API_PATH = "/api/movie/1";' },
      { text: JSON.stringify({ success: true, m3u8: 'https://media.example/movie.m3u8', audioTracks: [{ url: 'https://media.example/hindi.m3u8', language: 'Hindi' }] }) },
      { text: mediaPlaylist },
      { text: mediaPlaylist },
      { text: JSON.stringify({ subtitles: [] }) },
    )
    const result = await createNhdapiProvider(client, () => now).resolve(input, new AbortController().signal)
    expect(result).toMatchObject({ ok: true, sources: [{ key: 'original' }, { key: 'dub-0', language: 'Hindi' }] })
  })
  for (const [label, request, query] of [
    ['movie', input, 'id=1&type=movie'],
    ['episode', episode, 'id=2&type=tv&season=3&episode=4'],
  ] as const) {
    it(`resolves bounded VidCore multi-endpoint ${label} renditions without copying its aggregator fanout`, async () => {
      const manifest = '#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:6,\nseg.ts'
      const client = vi.fn<ProviderHttp>(async (url) => {
        if (url.includes('/cineplay?')) return { status: 200, text: JSON.stringify({ sources: [
          { url: 'https://media.example/uhd.m3u8', quality: '2160p', type: 'hls' },
          { url: 'https://media.example/hd.m3u8', quality: '1080p', type: 'hls' },
          { url: 'https://media.example/duplicate.m3u8', quality: '1080p', type: 'hls' },
        ] }), url }
        if (url.endsWith('.m3u8')) return { status: 200, text: manifest, url }
        throw new Error(`Unexpected ${url}`)
      })
      const result = await createVidcoreProvider(client, () => now).resolve(request, new AbortController().signal)
      expect(client.mock.calls[0]?.[0]).toBe(`https://vidrack.created.app/api/sources/cineplay?${query}`)
      expect(client.mock.calls[0]?.[1]).toMatchObject({ referer: 'https://vidcore.org/' })
      expect(result).toMatchObject({ ok: true, sources: [
        { key: 'cineplay:2160p', height: 2160, qualityHint: '4K', headers: { referer: 'https://vidcore.org/' } },
        { key: 'cineplay:1080p', height: 1080, qualityHint: '1080p', headers: { referer: 'https://vidcore.org/' } },
      ] })
    })
    it(`keeps VidCore 4K while sinking HEVC renditions below H.264`, async () => {
      const manifest = '#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:6,\nseg.ts'
      const client = vi.fn<ProviderHttp>(async (url) => {
        if (url.includes('/cineplay?')) return { status: 200, text: JSON.stringify({ sources: [
          { url: 'https://media.example/hevc-2160p.m3u8', quality: '2160p', type: 'hls' },
          { url: 'https://media.example/avc-1080p.m3u8', quality: '1080p', type: 'hls' },
        ] }), url }
        if (url.includes('.m3u8')) return { status: 200, text: manifest, url }
        throw new Error(`Unexpected ${url}`)
      })
      const result = await createVidcoreProvider(client, () => now).resolve(request, new AbortController().signal)
      expect(result.ok && result.sources.map((source) => source.url)).toEqual(['https://media.example/avc-1080p.m3u8', 'https://media.example/hevc-2160p.m3u8'])
      expect(result.ok && result.sources[1]).toMatchObject({ height: 2160, qualityHint: '4K' })
    })
    it(`resolves VAPlayer ${label} through canonical IMDb identity`, async () => {
      const identity = vi.fn(async () => ({ imdbId: 'tt1234567' }))
      const client = http({ text: JSON.stringify({ status_code: '200', data: { stream_urls: [
        'https://media.example/master.m3u8', 'https://media.example/master.m3u8',
      ] } }) }, { text: '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000000\nvideo.m3u8' })
      const result = await createVaPlayerProvider(client, identity, () => now).resolve(request, new AbortController().signal)
      expect(identity).toHaveBeenCalledWith(request.ref, expect.any(AbortSignal))
      const url = new URL(client.mock.calls[0]![0])
      expect(url.searchParams.get('imdb')).toBe('tt1234567')
      expect(url.searchParams.get('type')).toBe(request.ref.kind === 'movie' ? 'movie' : 'tv')
      expect(url.searchParams.get('season')).toBe(request.ref.kind === 'series' ? '3' : null)
      expect(url.searchParams.get('episode')).toBe(request.ref.kind === 'series' ? '4' : null)
      expect(result).toMatchObject({ ok: true, sources: [{ key: 'adaptive-1', type: 'hls', headers: { referer: 'https://nextgencloudfabric.com/', origin: 'https://nextgencloudfabric.com' }, qualityHint: 'Auto · up to 1080p' }] })
    })
  }
  it('resolves InsertUnit movies through the embed page without script evaluation', async () => {
    const page = `<html><script>makePlayer({blocked: false, source: {dash: "https://cdn.example/film.mpd", hls: "https://cdn.example/film.m3u8", cc: [{url: "https://cdn.example/en.vtt", name: "Eng. full"}]}});</script></html>`
    const identity = vi.fn(async () => ({ imdbId: 'tt0137523' }))
    const client = http({ text: page }, { text: mediaPlaylist })
    const result = await createInsertunitProvider(client, identity, () => now).resolve(input, new AbortController().signal)
    expect(identity).toHaveBeenCalledWith(input.ref, expect.any(AbortSignal))
    expect(client.mock.calls[0]?.[0]).toBe('https://api.insertunit.ws/embed/imdb/tt0137523')
    expect(result).toMatchObject({ ok: true, sources: [{ key: 'insertunit:1080p', type: 'hls', language: 'multi', qualityHint: '1080p', headers: { referer: 'https://api.insertunit.ws/' } }] })
    expect(result.ok && result.sources[0]?.subtitles).toMatchObject([{ id: 'insertunit-sub-0', label: 'Eng. full', format: 'vtt' }])
  })
  it('resolves InsertUnit exact episodes and never falls back to a neighbor', async () => {
    const seasons = [{ season: 1, episodes: [
      { episode: '1', hls: 'https://cdn.example/s1e1.m3u8', cc: [{ url: 'https://cdn.example/s1e1.vtt', name: 'Eng. full' }] },
      { episode: '2', hls: 'https://cdn.example/s1e2.m3u8' },
    ] }, { season: 2, blocked: true, episodes: [{ episode: '1', hls: 'https://cdn.example/s2e1.m3u8' }] }]
    const page = `<html><script>makePlayer({playlist: {current: {season: 1, episode: "1"}, seasons: ${JSON.stringify(seasons)}}});</script></html>`
    const identity = vi.fn(async () => ({ imdbId: 'tt0903747' }))
    const exact = await createInsertunitProvider(http({ text: page }, { text: mediaPlaylist }), identity, () => now).resolve(episode, new AbortController().signal)
    // Fixture covers S03E04 only through S01E01/S01E02/S02E01: the shared
    // episode input (S03E04) must resolve empty rather than episode 1.
    expect(exact).toMatchObject({ ok: false, code: 'empty' })
    const first = await createInsertunitProvider(http({ text: page }, { text: mediaPlaylist }), identity, () => now)
      .resolve({ ...input, ref: { kind: 'series' as const, id: 2, season: 1, episode: 1 } }, new AbortController().signal)
    expect(first).toMatchObject({ ok: true, sources: [{ url: 'https://cdn.example/s1e1.m3u8' }] })
    expect(first.ok && first.sources[0]?.subtitles).toMatchObject([{ format: 'vtt' }])
    const blocked = await createInsertunitProvider(http({ text: page }, { text: mediaPlaylist }), identity, () => now)
      .resolve({ ...input, ref: { kind: 'series' as const, id: 2, season: 2, episode: 1 } }, new AbortController().signal)
    expect(blocked).toMatchObject({ ok: false, code: 'empty' })
  })
  it('keeps InsertUnit missing identities and malformed pages structured', async () => {
    const missing = createInsertunitProvider(http(), async () => ({}))
    expect(await missing.resolve(input, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
    const noPlayer = createInsertunitProvider(http({ text: '<html>blocked</html>' }), async () => ({ imdbId: 'tt0137523' }))
    expect(await noPlayer.resolve(input, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
  })
  it('resolves StigStream movies through the ECDH secure channel', async () => {
    // Loopback server: real server keypair, key derived from the client's
    // handshake body, streams sealed in the v4 AES-GCM envelope.
    const serverKp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'])
    const serverPubRaw = await crypto.subtle.exportKey('raw', serverKp.publicKey)
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const info = new TextEncoder().encode('yur/secure-channel/v1|aes-256-gcm')
    let sessionKey: CryptoKey | null = null
    const seal = async (payload: unknown) => {
      const iv = crypto.getRandomValues(new Uint8Array(12))
      const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, sessionKey!, Buffer.from(JSON.stringify(payload)))
      return { status: 200, text: JSON.stringify({ v: '4', iv: Buffer.from(iv).toString('base64'), data: Buffer.from(ct).toString('base64') }) }
    }
    const client = vi.fn<ProviderHttp>(async (url, _headers, signal, init) => {
      signal.throwIfAborted()
      if (url.endsWith('/secure/handshake')) {
        expect(init?.method).toBe('POST')
        const { clientPublicKey } = JSON.parse(init?.body ?? '{}')
        const clientPub = await crypto.subtle.importKey('raw', Buffer.from(clientPublicKey, 'base64'), { name: 'ECDH', namedCurve: 'P-256' }, false, [])
        const bits = await crypto.subtle.deriveBits({ name: 'ECDH', public: clientPub } as EcdhKeyDeriveParams, serverKp.privateKey, 256)
        const hk = await crypto.subtle.importKey('raw', bits, 'HKDF', false, ['deriveKey'])
        sessionKey = await crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: salt as BufferSource, info } as HkdfParams, hk, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
        return { status: 200, text: JSON.stringify({ sessionId: 'sess-1', serverPublicKey: Buffer.from(serverPubRaw).toString('base64'), salt: Buffer.from(salt).toString('base64'), ttl: 600000 }), url }
      }
      if (url.includes('/movie/Nova/1')) {
        return { ...await seal({ streams: [{ url: 'https://cdn.example/nova.m3u8', type: 'hls', quality: 'Auto' }], subtitles: [{ url: 'https://cdn.example/en.vtt', lang: 'English' }] }), url }
      }
      if (url.endsWith('.m3u8')) return { status: 200, text: mediaPlaylist, url }
      throw new Error(`Unexpected ${url}`)
    })
    const result = await createStigstreamProvider(client, () => now).resolve(input, new AbortController().signal)
    expect(client.mock.calls[1]?.[0]).toBe('https://api.stigstream.ru/movie/Nova/1')
    expect(result).toMatchObject({ ok: true, sources: [{ key: 'stigstream:nova:0', type: 'hls', language: 'original', qualityHint: 'Auto', headers: { referer: 'https://stigstream.ru/' } }] })
    expect(result.ok && result.sources[0]?.subtitles).toMatchObject([{ id: 'stigstream-sub-0', label: 'English', format: 'vtt' }])
  })
  it('walks StigStream servers in order and labels dub servers honestly', async () => {
    const serverKp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits'])
    const serverPub = Buffer.from(await crypto.subtle.exportKey('raw', serverKp.publicKey)).toString('base64')
    const empty = (url: string) => ({ status: 200, text: JSON.stringify({ streams: [] }), url })
    const manifest = { status: 200, text: mediaPlaylist }
    const calls: string[] = []
    const client = vi.fn<ProviderHttp>(async (url, _headers, signal) => {
      signal.throwIfAborted()
      calls.push(url)
      if (url.endsWith('/secure/handshake')) return { status: 200, text: JSON.stringify({ sessionId: 's', serverPublicKey: serverPub, salt: Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64'), ttl: 600000 }), url }
      if (url.includes('/movie/Orion/1')) return { status: 200, text: JSON.stringify({ streams: [{ url: 'https://cdn.example/orion.m3u8', quality: 'Auto' }] }), url }
      if (url.endsWith('.m3u8')) return { ...manifest, url }
      return empty(url)
    })
    // The plain (non-v4) fixtures below never reach AES decryption, so the
    // handshake only needs to complete structurally here.
    const result = await createStigstreamProvider(client, () => now).resolve(input, new AbortController().signal)
    expect(calls.filter((url) => url.includes('/movie/'))).toEqual([
      'https://api.stigstream.ru/movie/Nova/1',
      'https://api.stigstream.ru/movie/Comet/1',
      'https://api.stigstream.ru/movie/Nebula/1',
      'https://api.stigstream.ru/movie/Cosmic/1',
      'https://api.stigstream.ru/movie/Obsidian/1',
      'https://api.stigstream.ru/movie/Flux/1',
      'https://api.stigstream.ru/movie/Orion/1',
    ])
    expect(result).toMatchObject({ ok: true, sources: [{ language: 'Turkish' }] })
  })
  it('resolves Mapple movies through token, encrypt, and manifest quality', async () => {
    const page = `<html><script>window.__REQUEST_TOKEN__ = "tok-1";</script></html>`
    const manifest = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=1280x720\nvideo.m3u8'
    const client = http(
      { text: page },
      { text: JSON.stringify({ success: true, token: 'stream-tok' }) },
      { text: JSON.stringify({ url: '/api/stream-encrypted?data=abc' }) },
      { text: JSON.stringify({ success: true, data: { stream_url: 'https://cdn.example/master.m3u8' } }) },
      { text: manifest },
    )
    const result = await createMappleProvider(client, () => now).resolve(input, new AbortController().signal)
    expect(client.mock.calls[0]?.[0]).toBe('https://mapple.rip/watch/movie/1')
    expect(JSON.parse(String(client.mock.calls[1]?.[3]?.body)).requestToken).toBe('tok-1')
    expect(client.mock.calls[3]?.[0]).toContain('requestToken=tok-1&token=stream-tok')
    expect(result).toMatchObject({ ok: true, sources: [{ key: 'mapple:720p', type: 'hls', height: 720, qualityHint: '720p', headers: { referer: 'https://mapple.rip/' } }] })
  })
  it('resolves Mapple episodes with exact tv_slug and bounded proof-of-work', async () => {
    const page = `<html><script>window.__REQUEST_TOKEN__ = "tok-2";</script></html>`
    const manifest = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000000\nvideo.m3u8'
    const client = http(
      { text: page },
      { text: JSON.stringify({ success: true, requiresPow: true, pow: { challengeId: 'c1', challenge: 'pow-test', difficulty: 1 } }) },
      { text: JSON.stringify({ success: true, token: 'tok-tv' }) },
      { text: JSON.stringify({ url: 'https://cdn.example/enc' }) },
      { text: JSON.stringify({ success: true, data: { stream_url: 'https://cdn.example/tv.m3u8' } }) },
      { text: manifest },
    )
    const result = await createMappleProvider(client, () => now).resolve(episode, new AbortController().signal)
    expect(client.mock.calls[0]?.[0]).toBe('https://mapple.rip/watch/tv/2')
    const bodies = client.mock.calls.map(([, , , init]) => String(init?.body ?? ''))
    expect(bodies.some((body) => body.includes('"tv_slug":"3-4"'))).toBe(true)
    expect(bodies.some((body) => body.includes('"nonce":'))).toBe(true)
    expect(result).toMatchObject({ ok: true, sources: [{ key: 'mapple:auto', qualityHint: 'Auto' }] })
  })
  it('keeps Mapple missing tokens and non-manifests structured', async () => {
    const noToken = createMappleProvider(http({ text: '<html>nope</html>' }), () => now)
    expect(await noToken.resolve(input, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
    const notManifest = createMappleProvider(http(
      { text: `<html><script>window.__REQUEST_TOKEN__ = "t";</script></html>` },
      { text: JSON.stringify({ success: true, token: 'tok' }) },
      { text: JSON.stringify({ url: '/api/stream-encrypted?data=x' }) },
      { text: JSON.stringify({ success: true, data: { stream_url: 'https://cdn.example/tv.m3u8' } }) },
      { text: '<html>nope</html>' },
    ), () => now)
    expect(await notManifest.resolve(input, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
  })
  it('round-trips WeCollege payloads and rejects bad magic', async () => {
    const seed = 'test-seed-42'
    const doc = JSON.stringify({ sources: [{ quality: '1080p', url: 'https://cdn.example/x.m3u8' }] })
    const body = Buffer.concat([Buffer.from([109, 118, 109, 49]), Buffer.from(doc)])
    const ks = keystream(seed, 550, body.length)
    const sealed = Buffer.from(body.map((byte, index) => byte ^ ks[index]!)).toString('base64url')
    expect(decryptWecollegePayload(sealed, seed, 550)).toMatchObject({ sources: [{ quality: '1080p' }] })
    expect(() => decryptWecollegePayload(Buffer.from('not-encrypted').toString('base64url'), seed, 550)).toThrow()
  })
  it('resolves WeCollege movies through seed, cipher, and city fanout', async () => {
    const seed = 'city-seed-7'
    const seal = (payload: unknown) => {
      const body = Buffer.concat([Buffer.from([109, 118, 109, 49]), Buffer.from(JSON.stringify(payload))])
      const ks = keystream(seed, 550, body.length)
      return Buffer.from(body.map((byte, index) => byte ^ ks[index]!)).toString('base64url')
    };
    const client = http(
      { text: JSON.stringify({ seed, ttlMs: 30000 }) },
      { text: seal({ sources: [{ quality: '1080p', url: 'https://cdn.example/miami.m3u8' }], subtitles: [{ url: 'https://cdn.example/en.vtt', lang: 'English' }] }) },
      { text: mediaPlaylist },
    )
    const metadata = async () => ({ title: 'Fight Club', year: 1999, imdbId: 'tt0137523' })
    const result = await createWecollegeProvider(client, metadata, () => now)
      .resolve({ ...input, ref: { kind: 'movie' as const, id: 550 } }, new AbortController().signal)
    expect(client.mock.calls[0]?.[0]).toBe('https://api.wecollege.net/seed?mediaId=550')
    expect(client.mock.calls[1]?.[0]).toContain('https://api.wecollege.net/miami/sources?')
    expect(client.mock.calls[1]?.[0]).toContain('mediaType=movie')
    expect(client.mock.calls[1]?.[0]).not.toContain('seasonId')
    expect(result).toMatchObject({ ok: true, sources: [{ key: 'miami:1080p:0', type: 'hls', height: 1080, qualityHint: '1080p' }] })
    expect(result.ok && result.sources[0]?.subtitles).toMatchObject([{ id: 'wecollege-sub-0', format: 'vtt' }])
  })
  it('resolves WeCollege episodes with explicit season/episode identifiers', async () => {
    const seed = 'city-seed-9'
    const seal = (payload: unknown) => {
      const body = Buffer.concat([Buffer.from([109, 118, 109, 49]), Buffer.from(JSON.stringify(payload))])
      const ks = keystream(seed, 2, body.length)
      return Buffer.from(body.map((byte, index) => byte ^ ks[index]!)).toString('base64url')
    };
    const client = http(
      { text: JSON.stringify({ seed }) },
      { text: seal({ sources: [{ quality: '720p', url: 'https://cdn.example/ep.m3u8' }] }) },
      { text: mediaPlaylist },
    )
    const metadata = async () => ({ title: 'Show', year: 2020 })
    const result = await createWecollegeProvider(client, metadata, () => now).resolve(episode, new AbortController().signal)
    expect(client.mock.calls[1]?.[0]).toContain('seasonId=3&episodeId=4')
    expect(result).toMatchObject({ ok: true, sources: [{ url: 'https://cdn.example/ep.m3u8', height: 720 }] })
  })
  it('falls back to the VidLove backup host when the primary is blocked', async () => {
    const client = vi.fn<ProviderHttp>(async (url) => {
      if (url.startsWith('https://api.tungtungtungtungsahur.app')) return { status: 403, text: 'blocked', url }
      if (url.includes('sources=vidapi')) return { status: 200, text: JSON.stringify({
        source: { source: 'vidapi', label: 'Vidapi', url: 'https://cdn.example/backup.m3u8' }, subtitles: [],
      }), url }
      if (url.endsWith('.m3u8')) return { status: 200, text: mediaPlaylist, url }
      return { status: 404, text: '', url }
    })
    const result = await createVidloveProvider(client, () => now).resolve(input, new AbortController().signal)
    expect(client.mock.calls[0]?.[0]).toContain('api.tungtungtungtungsahur.app')
    expect(client.mock.calls.some(([url]) => url.includes('api.vidlove.cc'))).toBe(true)
    expect(result).toMatchObject({ ok: true, sources: [{ url: 'https://cdn.example/backup.m3u8' }] })
  })
  it('scopes WeCollege to configured cities with matching identities', async () => {
    const seed = 'split-seed-3'
    const seal = (payload: unknown, tmdb: number) => {
      const body = Buffer.concat([Buffer.from([109, 118, 109, 49]), Buffer.from(JSON.stringify(payload))])
      const ks = keystream(seed, tmdb, body.length)
      return Buffer.from(body.map((byte, index) => byte ^ ks[index]!)).toString('base64url')
    };
    const metadata = async () => ({ title: 'Fight Club', year: 1999, imdbId: 'tt0137523' })
    const manifest = { text: mediaPlaylist }
    const miamiPayload = { sources: [{ quality: '1080p', url: 'https://cdn.example/miami.m3u8' }] }
    const miami = createWecollegeProvider(
      http({ text: JSON.stringify({ seed }) }, { text: seal(miamiPayload, 550) }, manifest),
      metadata, () => now, { id: 'wecollege-miami', cities: ['miami'] })
    const result = await miami.resolve({ ...input, ref: { kind: 'movie' as const, id: 550 } }, new AbortController().signal)
    expect(miami.id).toBe('wecollege-miami')
    expect(result).toMatchObject({ ok: true, sources: [{ key: 'miami:1080p:0' }] })
    const boiseCalls = http({ text: JSON.stringify({ seed }) }, { text: seal(miamiPayload, 550) }, manifest)
    const boise = createWecollegeProvider(boiseCalls, metadata, () => now, { id: 'wecollege-boise', cities: ['boise'] })
    await boise.resolve({ ...input, ref: { kind: 'movie' as const, id: 550 } }, new AbortController().signal)
    expect(boiseCalls.mock.calls[1]?.[0]).toContain('/boise/sources?')
    expect(boiseCalls.mock.calls.some(([url]) => url.includes('/miami/'))).toBe(false)
  })
  it('keeps VidLove streams when subtitle lists overflow their bounds', async () => {
    const oversized = { file: `https://cdn.example/${'x'.repeat(5000)}.vtt`, label: 'Huge' };
    const subs = Array.from({ length: 40 }, (_, index) => ({ file: `https://cdn.example/${index}.vtt`, label: `Track ${index}` }));
    const client = vi.fn<ProviderHttp>(async (url) => {
      if (url.startsWith('https://api.vidlove.cc') && url.includes('sources=vidapi')) return { status: 200, text: JSON.stringify({
        source: { source: 'vidapi', url: 'https://cdn.example/big.m3u8' }, subtitles: [oversized, ...subs],
      }), url }
      if (url.endsWith('.m3u8')) return { status: 200, text: mediaPlaylist, url }
      return { status: 404, text: '', url }
    })
    // Primary host 404s so the backup-shape path is exercised too.
    const result = await createVidloveProvider(client, () => now).resolve(input, new AbortController().signal)
    expect(result).toMatchObject({ ok: true, sources: [{ url: 'https://cdn.example/big.m3u8' }] })
    expect(result.ok && result.sources[0]?.subtitles.length).toBeLessThanOrEqual(20)
    expect(result.ok && result.sources[0]?.subtitles.some((track) => track.label === 'Huge')).toBe(false)
  })
  it('resolves VidApi movies by tmdb id with file-name quality and filtered subs', async () => {
    const client = http({ text: JSON.stringify({
      status_code: '200',
      data: { file_name: 'Fight.Club.1999.1080p.WEB-DL', stream_urls: ['https://cdn.example/1080.mp4', 'https://cdn.example/auto.m3u8'] },
      default_subs: [
        { lang: 'English', code: 'en', url: 'https://cdn.example/en.vtt' },
        { lang: 'Arabic', code: 'ar', url: 'https://cdn.example/ar.ass' },
      ],
    }) })
    const result = await createVidapiProvider(client, () => now).resolve(input, new AbortController().signal)
    expect(client.mock.calls[0]?.[0]).toBe('https://streamdata.vaplayer.ru/api.php?tmdb=1&type=movie')
    expect(result).toMatchObject({ ok: true, sources: [
      { key: 'vidapi:1080p:0', type: 'native', qualityHint: '1080p' },
      { key: 'vidapi:1080p:1', type: 'hls', qualityHint: '1080p' },
    ] })
    expect(result.ok && result.sources[0]?.subtitles).toMatchObject([{ id: 'vidapi-sub-0', label: 'English', language: 'en', format: 'vtt' }])
  })
  it('resolves VidApi episodes and rejects failed handshakes', async () => {
    const client = http({ text: JSON.stringify({ status_code: '404', data: null, default_subs: [] }) })
    const result = await createVidapiProvider(client, () => now).resolve(episode, new AbortController().signal)
    expect(client.mock.calls[0]?.[0]).toContain('tmdb=2&type=tv&season=3&episode=4')
    expect(result).toMatchObject({ ok: false, code: 'empty' })
  })
  it('resolves VidLove movies across sub-sources with deduped tracks', async () => {
    const client = vi.fn<ProviderHttp>(async (url) => {
      if (url.includes('sources=vidapi')) return { status: 200, text: JSON.stringify({
        source: { source: 'vidapi', label: 'Vidapi', url: 'https://cdn.example/vidapi.m3u8' },
        subtitles: [{ file: 'https://cdn.example/en.vtt', label: 'English' }, { file: 'https://cdn.example/en.vtt', label: 'English dup' }],
      }), url }
      if (url.includes('sources=moviebox')) return { status: 200, text: JSON.stringify({
        source: { source: 'moviebox', label: 'Moviebox', url: 'https://cdn.example/box.mp4' }, subtitles: [],
      }), url }
      if (url.endsWith('.m3u8')) return { status: 200, text: mediaPlaylist, url }
      return { status: 404, text: '', url }
    })
    const result = await createVidloveProvider(client, () => now).resolve(input, new AbortController().signal)
    expect(result).toMatchObject({ ok: true, sources: [
      { key: 'vidlove:vidapi:0', type: 'hls' },
      { key: 'vidlove:moviebox:1', type: 'native' },
    ] })
    expect(result.ok && result.sources[0]?.subtitles).toMatchObject([{ id: 'vidlove-sub-0', format: 'vtt' }])
  })
  it('resolves Screenscape movies across qsply and moviebox2 with short TV params', async () => {
    const client = http(
      { text: JSON.stringify({ success: true, streams: [
        { name: 'ZetPly [Original]', url: 'https://screenscape.me/api/servers/qsply/proxy?url=https%3A%2F%2Fcdn.example%2Fmaster.m3u8' },
      ] }) },
      { text: JSON.stringify({ success: true, streams: [
        { name: 'MovieBox2 1080p', url: 'https://proxyes.kuronix.app/resource/abc.mp4?sign=x', quality: '1080p', type: 'mp4', language: 'Original Audio' },
        { name: 'MovieBox2 480p', url: 'https://proxyes.kuronix.app/resource/def.mp4?sign=y', quality: '480p', type: 'mp4' },
      ] }) },
    )
    const result = await createScreenscapeProvider(client, () => now).resolve(input, new AbortController().signal)
    expect(client.mock.calls[0]?.[0]).toBe('https://screenscape.me/api/servers/qsply?tmdbId=1&type=movie&id=1')
    expect(result).toMatchObject({ ok: true, sources: [
      { key: 'screenscape:qsply:0', type: 'hls', qualityHint: 'Auto' },
      { key: 'screenscape:moviebox2:0', type: 'native', qualityHint: '1080p' },
      { key: 'screenscape:moviebox2:1', type: 'native', qualityHint: '480p' },
    ] })
  })
  it('resolves Screenscape episodes with short season/episode params and empty fallthrough', async () => {
    const client = http(
      { text: JSON.stringify({ success: true, streams: [{ name: 'ZetPly', url: 'https://screenscape.me/api/servers/qsply/proxy?url=https%3A%2F%2Fcdn.example%2Ftv.m3u8' }] }) },
      { text: JSON.stringify({ success: false, streams: [] }) },
    )
    const result = await createScreenscapeProvider(client, () => now).resolve(episode, new AbortController().signal)
    expect(client.mock.calls[0]?.[0]).toBe('https://screenscape.me/api/servers/qsply?tmdbId=2&type=tv&id=2&s=3&e=4')
    expect(result).toMatchObject({ ok: true, sources: [{ key: 'screenscape:qsply:0', type: 'hls' }] })
    const empty = http({ text: JSON.stringify({ success: false, streams: [] }) }, { text: 'not json' })
    expect(await createScreenscapeProvider(empty, () => now).resolve(input, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
  })
  async function vidrockEncrypt(url: string): Promise<string> {
    const raw = Buffer.from('7f3e9c2a8b5d1f4e6a9c3b7d2e5f8a1c4b6d9e2f5a8c1b4d7e9f2a5c8b1d4e7f', 'hex')
    const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt'])
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(url)))
    const packed = new Uint8Array(12 + ct.length)
    packed.set(iv)
    packed.set(ct, 12)
    return Buffer.from(packed).toString('base64url')
  }
  it('resolves VidRock movies through encrypted server URLs with worker skips', async () => {
    const hls = await vidrockEncrypt('https://cdn.example/stream/master.m3u8')
    const mp4 = await vidrockEncrypt('https://cdn.example/stream/file.mp4')
    const worker = await vidrockEncrypt('https://x.workers.dev/stream.m3u8')
    const client = http({ text: JSON.stringify({
      Alpha: { url: hls, type: 'hls' }, Beta: { url: mp4 }, Gamma: { url: worker }, Delta: { url: '!!!' },
    }) })
    const result = await createVidrockProvider(client, () => now).resolve(input, new AbortController().signal)
    expect(client.mock.calls[0]?.[0]).toBe('https://vidrock.ru/api/movie/1')
    expect(result).toMatchObject({ ok: true, sources: [
      { key: 'vidrock:alpha:0', type: 'hls', qualityHint: '1080p', language: 'original' },
      { key: 'vidrock:beta:1', type: 'native' },
    ] })
    expect(result.ok && result.sources).toHaveLength(2)
  })
  it('resolves VidRock episodes with streamrk playlist expansion', async () => {
    const playlist = await vidrockEncrypt('https://streamrk.site/playlist/abc123')
    const client = http(
      { text: JSON.stringify({ Prime: { url: playlist } }) },
      { text: JSON.stringify([{ resolution: 1080, url: 'https://cdn.example/1080.m3u8' }, { resolution: '720', url: 'https://cdn.example/720.m3u8' }]) },
    )
    const result = await createVidrockProvider(client, () => now).resolve(episode, new AbortController().signal)
    expect(client.mock.calls[0]?.[0]).toBe('https://vidrock.ru/api/tv/2/3/4')
    expect(result).toMatchObject({ ok: true, sources: [
      { key: 'vidrock:prime:1080p:0', type: 'hls', qualityHint: '1080p' },
      { key: 'vidrock:prime:720p:1', type: 'hls', qualityHint: '720p' },
    ] })
    expect(await createVidrockProvider(http({ status: 404, text: '' }), () => now).resolve(input, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
  })
  it('round-trips VidNest payloads and resolves movies with subtitles', async () => {
    const alphabet = 'RB0fpH8ZEyVLkv7c2i6MAJ5u3IKFDxlS1NTsnGaqmXYdUrtzjwObCgQP94hoeW+/='
    const standard = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/='
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value), 'utf8').toString('base64')
      .split('').map((char) => alphabet[standard.indexOf(char)]).join('')
    expect(decipherPayload(encode({ url: 'https://cdn.example/a.m3u8', quality: '1080p' }))).toMatchObject({ url: 'https://cdn.example/a.m3u8' })
    const client = http(
      { text: JSON.stringify({ encrypted: true, data: encode({ url: 'https://cdn.example/a.m3u8', quality: '1080p' }) }) },
      { text: JSON.stringify({ encrypted: true, data: encode({ streams: [{ url: 'https://cdn.example/b.mp4', language: 'English' }] }) }) },
      { text: JSON.stringify({ encrypted: true, data: encode({}) }) },
      { text: JSON.stringify({ encrypted: true, data: encode({}) }) },
      { text: JSON.stringify({ encrypted: true, data: encode({}) }) },
      { text: JSON.stringify({ encrypted: true, data: encode({}) }) },
      { text: JSON.stringify({ encrypted: true, data: encode({}) }) },
      { text: JSON.stringify({ encrypted: true, data: encode({}) }) },
      { text: JSON.stringify({ encrypted: true, data: encode({}) }) },
      { text: JSON.stringify([{ file: 'https://cdn.example/en.vtt', label: 'English' }, { label: 'NoFile' }]) },
    )
    const result = await createVidnestProvider(client, () => now).resolve(input, new AbortController().signal)
    expect(client.mock.calls[0]?.[0]).toBe('https://new.vidnest.fun/yflix/movie/1')
    expect(result).toMatchObject({ ok: true, sources: [
      { key: 'vidnest:catflix:0', type: 'hls', qualityHint: '1080p' },
      { key: 'vidnest:filxer:1', type: 'native', qualityHint: 'English' },
    ] })
    expect(result.ok && result.sources[0]?.subtitles).toMatchObject([{ id: 'vidnest-sub-0', label: 'English', format: 'vtt' }])
  })
  it('resolves VidNest episodes with per-server paths and structured empties', async () => {
    const client = http({ text: JSON.stringify({ encrypted: false, data: null }) })
    const result = await createVidnestProvider(client, () => now).resolve(episode, new AbortController().signal)
    expect(client.mock.calls[0]?.[0]).toBe('https://new.vidnest.fun/yflix/tv/2/3/4')
    expect(result).toMatchObject({ ok: false, code: 'empty' })
  })
  it('resolves NetMirror movies through the Netflix-direct lookup with captions', async () => {
    const client = http({ text: JSON.stringify({ ok: true,
      streams: [{ url: 'https://cdn.example/nf.m3u8', resolution: 1080 }],
      mp4: 'https://cdn.example/nf.mp4',
      captions: [
        { url: '/subs/en.vtt', name: 'English', lang: 'en' },
        { url: 'https://cdn.example/es.vtt', name: 'Spanish' },
        { url: 'http://cdn.example/bad.vtt', name: 'Bad' },
      ],
    }) })
    const result = await createNetmirrorProvider(client, () => now).resolve(input, new AbortController().signal)
    expect(client.mock.calls[0]?.[0]).toBe('https://net27.cc/api/embed-tmdb/1')
    expect(result).toMatchObject({ ok: true, sources: [
      { key: 'netmirror:netflix:1080p:0', type: 'hls', qualityHint: '1080p' },
      { key: 'netmirror:netflix:mp4', type: 'native', qualityHint: 'Auto' },
    ] })
    expect(result.ok && result.sources[0]?.subtitles).toMatchObject([
      { id: 'netmirror-sub-0', label: 'English', language: 'en', url: 'https://net27.cc/subs/en.vtt', format: 'vtt' },
      { id: 'netmirror-sub-1', label: 'Spanish' },
    ])
  })
  it('resolves NetMirror episodes with season/episode params and failed flags', async () => {
    const client = http({ text: JSON.stringify({ ok: true, streams: [{ url: 'https://cdn.example/ep.m3u8' }] }) })
    const result = await createNetmirrorProvider(client, () => now).resolve(episode, new AbortController().signal)
    expect(client.mock.calls[0]?.[0]).toBe('https://net27.cc/api/embed-tmdb/2?type=tv&se=3&ep=4')
    expect(result).toMatchObject({ ok: true, sources: [{ key: 'netmirror:netflix:auto:0', type: 'hls' }] })
    expect(await createNetmirrorProvider(http({ text: JSON.stringify({ ok: false }) }), () => now).resolve(input, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
  })
  it('resolves VidStorm movies through encrypted ids with probed quality levels', async () => {
    const client = vi.fn<ProviderHttp>(async (url) => {
      if (url.startsWith('https://vidstorm.ru/api/movie/')) return { status: 200,
        text: JSON.stringify({
          alpha: { url: 'https://cdn.example/direct.m3u8', language: 'Original' },
          beta: { url: 'https://cdn.example/list', language: 'Hindi' },
        }), url }
      if (url === 'https://cdn.example/direct.m3u8') return { status: 200, headers: new Headers({ 'content-type': 'application/vnd.apple.mpegurl' }),
        text: '#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\nseg.ts', url }
      if (url === 'https://cdn.example/list') return { status: 200, headers: new Headers({ 'content-type': 'application/json' }),
        text: JSON.stringify([{ resolution: 720, url: 'https://cdn.example/720.m3u8' }]), url }
      if (url === 'https://sub.vdrk.site/v2/movie/1') return { status: 200,
        text: JSON.stringify([{ file: 'https://cdn.example/en.vtt', label: 'English' }]), url }
      return { status: 404, text: '', url }
    })
    const result = await createVidstormProvider(client, () => now).resolve(input, new AbortController().signal)
    expect(client.mock.calls[0]?.[0]).toMatch(/^https:\/\/vidstorm\.ru\/api\/movie\/[A-Za-z0-9_-]+$/)
    expect(result).toMatchObject({ ok: true, sources: [
      { type: 'hls', qualityHint: 'Auto Original' },
      { type: 'hls', qualityHint: '720p Hindi' },
    ] })
    expect(result.ok && result.sources[0]?.subtitles).toMatchObject([{ id: 'vidstorm-sub-0', format: 'vtt' }])
  })
  it('resolves VidStorm episodes with exact tv identifiers and structured empties', async () => {
    const client = vi.fn<ProviderHttp>(async (url) => {
      if (url.startsWith('https://vidstorm.ru/api/tv/')) return { status: 200, text: JSON.stringify({}), url }
      return { status: 404, text: '', url }
    })
    const result = await createVidstormProvider(client, () => now).resolve(episode, new AbortController().signal)
    expect(client.mock.calls[0]?.[0]).toMatch(/^https:\/\/vidstorm\.ru\/api\/tv\/[A-Za-z0-9_-]+$/)
    expect(result).toMatchObject({ ok: false, code: 'empty' })
  })
  it('resolves VidLink movies through the token handshake with retry and captions', async () => {
    let calls = 0
    const client = vi.fn<ProviderHttp>(async (url) => {
      calls++
      if (url.startsWith('https://enc-dec.app/api/enc-vidlink')) {
        if (calls === 1) return { status: 200, text: 'null', url }
        return { status: 200, text: JSON.stringify({ result: 'tok123' }), url }
      }
      return { status: 200, text: JSON.stringify({ stream: {
        playlist: 'https://cdn.example/master.m3u8?headers=x&host=y',
        qualities: { '1080': { url: 'https://cdn.example/1080.mp4' }, '720': { url: 'https://cdn.example/720.m3u8' } },
        captions: [{ url: 'https://cdn.example/en.vtt', language: 'English' }, { url: 'https://cdn.example/dup.vtt' }],
      } }), url }
    })
    const result = await createVidlinkProvider(client, () => now).resolve(input, new AbortController().signal)
    expect(client.mock.calls[2]?.[0]).toBe('https://vidlink.pro/api/b/movie/tok123?multiLang=0')
    expect(result).toMatchObject({ ok: true, sources: [
      { key: 'vidlink:auto:0', type: 'hls' },
      { key: 'vidlink:1080p:1', type: 'native', qualityHint: '1080p' },
      { key: 'vidlink:720p:2', type: 'hls' },
    ] })
    expect(result.ok && result.sources[0]?.url).toBe('https://cdn.example/master.m3u8')
    expect(result.ok && result.sources[0]?.subtitles).toMatchObject([{ id: 'vidlink-sub-0', format: 'vtt' }])
  })
  it('resolves VidLink episodes and rejects missing streams', async () => {
    const client = http(
      { text: JSON.stringify({ result: 'tok' }) },
      { text: JSON.stringify({ stream: { qualities: {} } }) },
    )
    const result = await createVidlinkProvider(client, () => now).resolve(episode, new AbortController().signal)
    expect(client.mock.calls[1]?.[0]).toBe('https://vidlink.pro/api/b/tv/tok/3/4?multiLang=0')
    expect(result).toMatchObject({ ok: false, code: 'empty' })
  })
  it('resolves VidVault movies through the token handshake with VIP skips', async () => {
    const client = vi.fn<ProviderHttp>(async (url, headers) => {
      if (url === 'https://vidvault.ru/api/get-token') return { status: 200, text: JSON.stringify({ t: 'tok' }), url }
      expect(headers['x-request-token']).toBe('tok')
      return { status: 200, text: JSON.stringify({
        mp4Data: { downloads: [
          { url: 'https://cdn.example/a.mp4', resolution: 1080 },
          { url: 'https://cdn.example/vip.mp4', resolution: 2160, vipLocked: true },
        ], captions: [{ url: 'https://cdn.example/cap.vtt', lanName: 'English' }] },
        mkvData: { downloads: [{ url: 'https://cdn.example/b.mkv', resolution: 720 }] },
      }), url }
    })
    const result = await createVidvaultProvider(client, () => now).resolve(input, new AbortController().signal)
    expect(result).toMatchObject({ ok: true, sources: [{ key: 'vidvault:mp4:1080p:0', type: 'native', qualityHint: '1080p' }] })
    expect(result.ok && result.sources).toHaveLength(1)
    expect(result.ok && result.sources[0]?.subtitles).toMatchObject([{ id: 'vidvault-sub-0', format: 'vtt' }])
  })
  it('resolves VidVault episodes and structured failures', async () => {
    const client = http({ text: JSON.stringify({}) }, { text: JSON.stringify({}) })
    const result = await createVidvaultProvider(client, () => now).resolve(episode, new AbortController().signal)
    expect(result).toMatchObject({ ok: false, code: 'empty' })
  })
  it('resolves Modiplay movies through the two-hop static scrape with tracks', async () => {
    const client = http(
      { text: '<html><iframe src="/proxy.php?p=streamhg&c=abc"></iframe></html>' },
      { text: '<html><script>var src="/proxy.php?serve_m3u8=1&url=x";</script><track src="/subs/en.vtt" label="English"><track src="https://cdn.example/es.srt" label="Spanish"></html>' },
    )
    const result = await createModiplayProvider(client, () => now).resolve(input, new AbortController().signal)
    expect(client.mock.calls[0]?.[0]).toBe('https://rozgarlelo.modiplay.xyz/embed/tmdb/movie?id=1')
    expect(result).toMatchObject({ ok: true, sources: [{ key: 'modiplay:streamhg:0', type: 'hls' }] })
    expect(result.ok && result.sources[0]?.subtitles).toMatchObject([
      { id: 'modiplay-sub-0', label: 'English', format: 'vtt' },
      { id: 'modiplay-sub-1', label: 'Spanish', format: 'srt' },
    ])
  })
  it('resolves Modiplay episodes and structured misses', async () => {
    const client = http({ text: '<html>no player here</html>' })
    const result = await createModiplayProvider(client, () => now).resolve(episode, new AbortController().signal)
    expect(client.mock.calls[0]?.[0]).toBe('https://rozgarlelo.modiplay.xyz/embed/tmdb/tv?id=2&s=3&e=4')
    expect(result).toMatchObject({ ok: false, code: 'empty' })
  })
  it('resolves CineHD movies through the playlist chain with IMDb identity', async () => {
    const identity = () => Promise.resolve({ imdbId: 'tt1234567' })
    const client = http(
      { text: '<html><iframe src="https://play.example/play/1"></iframe></html>' },
      { text: '{"file":"\\/playlist\\/tok","key":"csrf123"}' },
      { text: JSON.stringify([{ title: 'Hindi', file: '~tok2' }]) },
      { text: 'https://cdn.example/hindi.m3u8 https://cdn.example/hindi2.m3u8' },
    )
    const result = await createCinehdProvider(client, identity, () => now).resolve(input, new AbortController().signal)
    expect(client.mock.calls[0]?.[0]).toBe('https://cinehd.vc/api/hdmovies/embed?type=movie&id=tt1234567')
    expect(result).toMatchObject({ ok: true, sources: [
      { type: 'hls', qualityHint: 'Hindi' },
      { type: 'hls', qualityHint: 'Hindi' },
    ] })
    expect(result.ok && result.sources).toHaveLength(2)
  })
  it('resolves CineHD episodes and coverage gaps', async () => {
    const identity = () => Promise.resolve({})
    const client = http({ text: '<html><iframe src="https://play.example/play/2"></iframe></html>' }, { status: 404, text: '' })
    const result = await createCinehdProvider(client, identity, () => now).resolve(episode, new AbortController().signal)
    expect(client.mock.calls[0]?.[0]).toBe('https://cinehd.vc/api/hdmovies/embed?type=tv&id=2')
    expect(result).toMatchObject({ ok: false, code: 'empty' })
  })
  it('resolves Nxsha movies through enveloped servers with robust ordering', async () => {
    const wrap = (value: unknown) => JSON.stringify({ _hash: encodeNxshaPayload(value as Record<string, unknown>) })
    const servers = { servers: [
      { scraper: 'weak', position: 5 },
      { scraper: 'castle', position: 9 },
      { scraper: 'off', status: 'offline' },
    ] }
    const client = vi.fn<ProviderHttp>(async (url) => {
      if (url.includes('/api/servers?')) return { status: 200, text: wrap(servers), url }
      if (url.includes('/api/sources?')) return { status: 200, text: wrap({ sources: [
        { url: 'https://cdn.example/castle.m3u8', quality: '1080p' },
      ] }), url }
      if (url.includes('/api/subtitles?')) return { status: 200, text: wrap({ subtitles: [
        { uri: 'https://cdn.example/en.vtt', title: 'English' },
      ] }), url }
      return { status: 404, text: '', url }
    })
    const result = await createNxshaProvider(client, () => now).resolve(input, new AbortController().signal)
    expect(result).toMatchObject({ ok: true, sources: [{ key: 'nxsha:castle:0', type: 'hls' }] })
    expect(result.ok && result.sources[0]?.subtitles).toMatchObject([{ id: 'nxsha-sub-0', format: 'vtt' }])
  })
  it('resolves direct Stellar and Aphrodite movie streams with Natsuki subtitles', async () => {
    const client = vi.fn<ProviderHttp>(async (url) => {
      if (url.includes('stellar.maybeoneday.ch/resolve?tmdbId=1&type=movie')) {
        return { status: 200, text: JSON.stringify({ found: true, source: 'Orbit', url: 'https://cdn.example/orbit.m3u8' }), url }
      }
      if (url.includes('cdn.maybeoneday.ch/content/movie/1')) {
        return { status: 200, text: JSON.stringify({ found: true, url: 'https://cdn.example/aphrodite.m3u8', type: 'hls' }), url }
      }
      if (url.includes('natsuki.maybeoneday.ch/subs?tmdbId=1')) {
        return { status: 200, text: JSON.stringify({ subtitles: [{ url: 'https://cdn.example/en.srt', fileName: 'English' }] }), url }
      }
      return { status: 404, text: '', url }
    })
    const result = await createStellarProvider(client, () => now).resolve(input, new AbortController().signal)
    expect(result).toMatchObject({
      ok: true,
      sources: [
        {
          key: 'stellar:orbit:0',
          type: 'hls',
          url: 'https://cdn.example/orbit.m3u8',
          headers: { referer: 'https://atlantic.st/', origin: 'https://atlantic.st' },
          subtitles: [{ id: 'stellar-sub-0', label: 'English', format: 'srt' }],
        },
        {
          key: 'stellar:aphrodite:1',
          type: 'hls',
          url: 'https://cdn.example/aphrodite.m3u8',
          headers: { referer: 'https://atlantic.st/', origin: 'https://atlantic.st' },
          subtitles: [{ id: 'stellar-sub-0', label: 'English', format: 'srt' }],
        },
      ],
    })
  })
  it('resolves direct Stellar episode streams and falls back to VDRK subtitles', async () => {
    const client = vi.fn<ProviderHttp>(async (url) => {
      if (url.includes('stellar.maybeoneday.ch/resolve?tmdbId=2&type=tv&season=3&episode=4')) {
        return { status: 200, text: JSON.stringify({ found: true, source: 'Nova', url: 'https://cdn.example/nova.m3u8' }), url }
      }
      if (url.includes('cdn.maybeoneday.ch/content/tv/2/3/4')) {
        return { status: 404, text: '', url }
      }
      if (url.includes('natsuki.maybeoneday.ch/subs')) {
        return { status: 500, text: 'Internal Server Error', url }
      }
      if (url.includes('sub.vdrk.site/v1/tv/2/3/4')) {
        return { status: 200, text: JSON.stringify([{ file: 'https://cdn.example/fallback.vtt', label: 'English' }]), url }
      }
      return { status: 404, text: '', url }
    })
    const result = await createStellarProvider(client, () => now).resolve(episode, new AbortController().signal)
    expect(result).toMatchObject({
      ok: true,
      sources: [
        {
          key: 'stellar:nova:0',
          type: 'hls',
          subtitles: [{ id: 'stellar-sub-0', label: 'English', format: 'vtt' }],
        },
      ],
    })
  })
  it('returns empty when Stellar and Aphrodite both return no streams', async () => {
    const client = vi.fn<ProviderHttp>(async (url) => ({ status: 404, text: '', url }))
    const result = await createStellarProvider(client, () => now).resolve(input, new AbortController().signal)
    expect(result).toMatchObject({ ok: false, code: 'empty' })
  })
  it('resolves direct Aphrodite streams scoped exclusively to the CDN mirror', async () => {
    const client = vi.fn<ProviderHttp>(async (url) => {
      if (url.includes('cdn.maybeoneday.ch/content/movie/1')) {
        return { status: 200, text: JSON.stringify({ found: true, url: 'https://cdn.example/aphrodite.m3u8', type: 'hls' }), url }
      }
      if (url.includes('natsuki.maybeoneday.ch/subs?tmdbId=1')) {
        return { status: 200, text: JSON.stringify({ subtitles: [{ url: 'https://cdn.example/en.vtt', fileName: 'English' }] }), url }
      }
      return { status: 404, text: '', url }
    })
    const result = await createAphroditeProvider(client, () => now).resolve(input, new AbortController().signal)
    expect(result).toMatchObject({
      ok: true,
      sources: [{ key: 'aphrodite:aphrodite:0', type: 'hls', url: 'https://cdn.example/aphrodite.m3u8' }],
    })
    expect(client).not.toHaveBeenCalledWith(expect.stringContaining('stellar.maybeoneday.ch/resolve'), expect.anything(), expect.anything())
  })
  it('keeps missing IMDb identities and malformed VidCore responses structured', async () => {    const missing = createVaPlayerProvider(http(), async () => ({}))
    expect(await missing.resolve(input, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty', retryable: false })
    expect(await createVidcoreProvider(http({ text: '{"sources":[{"url":"not a url"}]}' })).resolve(input, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
  })
  it('honors signed expire deadlines in seconds and milliseconds', () => {
    const seconds = Math.floor(now / 1000) + 600
    expect(accessDeadline(`https://cdn.example/x.m3u8?expire=${seconds}`, now)).toBe(new Date(seconds * 1000).toISOString())
    expect(accessDeadline(`https://cdn.example/x.m3u8?expire=${now + 600_000}`, now)).toBe(new Date(now + 600_000).toISOString())
    expect(accessDeadline('https://cdn.example/x.m3u8', now)).toBe(new Date(now + 300_000).toISOString())
    expect(() => accessDeadline(`https://cdn.example/x.m3u8?expire=${Math.floor(now / 1000) - 60}`, now)).toThrow()
  })
  it('limits CDN suffixes to true subdomains and retains HTTPS, port, and credential protections', () => {
    const hosts = ['vixsrc.to', '*.vix-content.net']
    expect(allowedMediaUrl('https://sc-b2-24.vix-content.net/file.ts', hosts)).toBe(true)
    for (const url of ['https://vix-content.net.evil.example/file', 'https://evilvix-content.net/file', 'https://vix-content.net/file', 'https://user@sc.vix-content.net/file', 'http://sc.vix-content.net/file', 'https://sc.vix-content.net:444/file']) expect(allowedMediaUrl(url, hosts)).toBe(false)
  })
})
