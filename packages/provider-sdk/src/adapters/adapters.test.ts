import { Buffer } from 'node:buffer'
import { createCipheriv } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { allowedMediaUrl, createVixsrcProvider, createNhdapiProvider, createVaPlayerProvider, createMappleProvider, createWecollegeProvider, createPersesProvider, createRivestreamProvider, createVidapiProvider, createScreenscapeProvider, createVidrockProvider, createVidnestProvider, createPoseidonProvider, createNetmirrorProvider, createVidstormProvider, createVidlinkProvider, createCinehdProvider, createNxshaProvider, createStellarProvider, createAphroditeProvider, createAnixoProvider, createKyrenProvider, createNagareProvider, createVidcoreProvider, createFilmuProvider, createVidzenProvider, createStigstreamProvider, createCastletvProvider, createAnime123Provider, createZokoProvider, createAnimeParadiseProvider, createAnimeKaiProvider, createAnimeKitsuProvider, solvePow, createVidsrcProvider, type ProviderHttp } from '../index.ts'
import { encodeNxshaPayload } from './nxsha.ts'
import { decipherPayload } from './vidnest.ts'
import { decryptWecollegePayload, keystream } from './wecollege-cipher.ts'
import { accessDeadline, sourceAccess, verifiedPlaybackSources } from './http.ts'
import type { ProviderSource } from '../index.ts'

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
    ['vixsrc-it', (client: ProviderHttp) => createVixsrcProvider(client, Date.now, { id: 'vixsrc-it' })],
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
  it('resolves VidCore direct sources while dropping relays and embeds', async () => {
    const client = vi.fn<ProviderHttp>(async (url) => {
      if (url.includes('/api/sources/movy')) {
        return { status: 200, text: JSON.stringify({ sources: [
          { url: 'https://cdn.example/vidcore.m3u8', quality: '1080p' },
          { url: 'https://relay.example/proxy?url=https%3A%2F%2Fcdn.example%2Fx.m3u8', quality: '720p' },
          { url: 'https://cdn.example/film.mkv', quality: '1080p' },
        ] }), url }
      }
      return { status: 404, text: '', url }
    })
    const result = await createVidcoreProvider(client, () => now).resolve(input, new AbortController().signal)
    expect(result).toMatchObject({ ok: true, sources: [{ key: 'vidcore:movy:0', type: 'hls', url: 'https://cdn.example/vidcore.m3u8', language: 'original' }] })
    expect(result.ok && result.sources).toHaveLength(1)
  })
  it('resolves VidCore episodes through per-title TV query params', async () => {
    const client = vi.fn<ProviderHttp>(async (url) => {
      if (url.includes('/api/sources/movy') && url.includes('season=3') && url.includes('episode=4')) {
        return { status: 200, text: JSON.stringify({ sources: [{ url: 'https://cdn.example/ep.m3u8' }] }), url }
      }
      return { status: 404, text: '', url }
    })
    const result = await createVidcoreProvider(client, () => now).resolve(episode, new AbortController().signal)
    expect(result).toMatchObject({ ok: true, sources: [{ type: 'hls' }] })
  })
  it('returns empty when VidCore servers answer nothing direct', async () => {
    const client = vi.fn<ProviderHttp>(async (url) => ({ status: 404, text: '', url }))
    expect(await createVidcoreProvider(client, () => now).resolve(input, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
  })
  it('scopes VidCore aliases to a single server', async () => {
    const client = vi.fn<ProviderHttp>(async (url) => {
      if (url.includes('/api/sources/movy')) {
        return { status: 200, text: JSON.stringify({ sources: [{ url: 'https://cdn.example/movy.m3u8' }] }), url }
      }
      if (url.includes('/api/sources/nova') || url.includes('/api/source/')) {
        return { status: 200, text: JSON.stringify({ sources: [{ url: 'https://cdn.example/nova.m3u8' }] }), url }
      }
      return { status: 404, text: '', url }
    })
    const scoped = createVidcoreProvider(client, () => now, { id: 'vidcore-nova', servers: ['nova'] })
    expect(scoped.id).toBe('vidcore-nova')
    const result = await scoped.resolve(input, new AbortController().signal)
    expect(result).toMatchObject({ ok: true, sources: [{ url: 'https://cdn.example/nova.m3u8' }] })
    expect(result.ok && result.sources).toHaveLength(1)
    expect(client.mock.calls.map(([url]) => String(url)).some((url) => url.includes('/api/sources/movy'))).toBe(false)
  })
  it('resolves FilmU three qualities through the Ainary extractor', async () => {
    const identity = () => Promise.resolve({ imdbId: 'tt15239678' })
    const client = vi.fn<ProviderHttp>(async (url) => {
      if (url.includes('/scrape/Ainary/')) {
        return { status: 200, text: JSON.stringify({ sources: [
          { url: 'https://cdn.example/a1080.m3u8', quality: '1080p' },
          { url: 'https://cdn.example/a720.m3u8', quality: '720p' },
          { url: 'https://cdn.example/a480.m3u8', quality: '480p' },
        ], subtitles: [{ url: 'https://cdn.example/en.vtt', label: 'English' }] }), url }
      }
      return { status: 404, text: '', url }
    })
    const result = await createFilmuProvider(client, identity, () => now).resolve(input, new AbortController().signal)
    // Every labeled rendition becomes its own stream: the resolver
    // top-picks the best while the lab surfaces the full quality ladder.
    expect(result).toMatchObject({ ok: true, sources: [
      { key: 'filmu:ainary:0', type: 'hls', qualityHint: '1080p' },
      { key: 'filmu:ainary:1', type: 'hls', qualityHint: '720p' },
      { key: 'filmu:ainary:2', type: 'hls', qualityHint: '480p' },
    ] })
    expect(result.ok && result.sources).toHaveLength(3)
    expect(result.ok && result.sources[0]?.subtitles).toMatchObject([{ format: 'vtt' }])
  })
  it('prefers FilmU singularity direct sources over the extractor fallback', async () => {
    const identity = () => Promise.resolve({ imdbId: 'tt15239678' })
    const client = vi.fn<ProviderHttp>(async (url) => {
      if (url.includes('/api/singularity-movie')) {
        return { status: 200, text: JSON.stringify({ sources: [{ url: 'https://img.rousav.tech/media/abc/index.m3u8', quality: '1080p', type: 'm3u8' }] }), url }
      }
      return { status: 404, text: '', url }
    })
    const result = await createFilmuProvider(client, identity, () => now).resolve(input, new AbortController().signal)
    expect(result).toMatchObject({ ok: true, sources: [{ key: 'filmu:singularity:0', type: 'hls', qualityHint: '1080p' }] })
    expect(result.ok && result.sources).toHaveLength(1)
    expect(client.mock.calls.map(([url]) => String(url)).some((url) => url.includes('/scrape/'))).toBe(false)
  })
  it('falls back to the META endpoint when FilmU has no IMDb identity', async () => {
    const identity = () => Promise.resolve({})
    const client = vi.fn<ProviderHttp>(async (url) => {
      if (url.includes('/api/tmdb/movie/1')) {
        return { status: 200, text: JSON.stringify({ external_ids: { imdb_id: 'tt0000001' }, title: 'Test', release_date: '2020-01-01' }), url }
      }
      if (url.includes('/scrape/Ainary/')) {
        return { status: 200, text: JSON.stringify({ sources: [{ url: 'https://cdn.example/a.m3u8', quality: 'Auto' }] }), url }
      }
      return { status: 404, text: '', url }
    })
    const result = await createFilmuProvider(client, identity, () => now).resolve(input, new AbortController().signal)
    expect(result).toMatchObject({ ok: true, sources: [{ key: 'filmu:ainary:0' }] })
  })
  it('returns empty when FilmU extractors answer nothing direct', async () => {
    const identity = () => Promise.resolve({ imdbId: 'tt15239678' })
    // Relay-shaped URL must not survive as a source.
    const relayOnly = vi.fn<ProviderHttp>(async (url) => {
      if (url.includes('/scrape/Ainary/')) {
        return { status: 200, text: JSON.stringify({ sources: [{ url: 'https://relay.example/embed/movie/1', quality: '1080p' }] }), url }
      }
      return { status: 404, text: '', url }
    })
    expect(await createFilmuProvider(relayOnly, identity, () => now).resolve(input, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
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
      { key: 'citadel:1080p:0', type: 'hls', language: 'en', headers: {}, height: 1080, qualityHint: '1080p' },
      { key: 'citadel:720p:1', headers: { referer: 'https://example.com/' } },
    ] })
    expect(result.ok && result.sources[1]?.headers).not.toHaveProperty('Cookie')
    expect(result.ok && result.sources[1]?.headers).not.toHaveProperty('X-Evil')
  })
  it('scopes VidRock aliases to one server', async () => {
    const novaUrl = await vidrockEncrypt('https://cdn.example/nova.m3u8')
    const orionUrl = await vidrockEncrypt('https://cdn.example/orion.m3u8')
    const client = http({ text: JSON.stringify({ Nova: { url: novaUrl }, Orion: { url: orionUrl } }) })
    const scoped = createVidrockProvider(client, () => now, { id: 'vidrock-nova', servers: ['nova'] })
    expect(scoped.id).toBe('vidrock-nova')
    const result = await scoped.resolve(input, new AbortController().signal)
    expect(result).toMatchObject({ ok: true, sources: [{ key: 'vidrock:nova:0', url: 'https://cdn.example/nova.m3u8' }] })
    expect(result.ok && result.sources).toHaveLength(1)
    // Unknown scopes answer empty, never wide.
    const unknown = createVidrockProvider(client, () => now, { id: 'vidrock-zzz', servers: ['zzz'] })
    expect(await unknown.resolve(input, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
  })
  it('scopes RiveStream aliases to one sub-provider', async () => {
    const client = vi.fn<ProviderHttp>(async (url, _headers, signal) => {
      signal.throwIfAborted()
      if (url.includes('scrapper.rivestream.app')) {
        return { status: 200, text: JSON.stringify({ data: { sources: [{ url: 'https://cdn.example/cit.m3u8', quality: '720p' }] } }), url }
      }
      if (url.endsWith('.m3u8')) return { status: 200, text: mediaPlaylist, url }
      throw new Error(`Unexpected ${url}`)
    })
    const scoped = createRivestreamProvider(client, () => now, { id: 'rivestream-citadel', subs: ['citadel'] })
    expect(scoped.id).toBe('rivestream-citadel')
    const result = await scoped.resolve(input, new AbortController().signal)
    expect(result).toMatchObject({ ok: true, sources: [{ key: 'citadel:720p:0' }] })
    const requested = client.mock.calls.map(([url]) => String(url))
    expect(requested.some((url) => url.includes('provider=citadel'))).toBe(true)
    expect(requested.some((url) => url.includes('provider=apex'))).toBe(false)
  })
  it('groups Citadel 720p and 480p under one server with a Quality menu', async () => {
    const client = vi.fn<ProviderHttp>(async (url, _headers, signal) => {
      signal.throwIfAborted()
      if (url.includes('scrapper.rivestream.app')) {
        return { status: 200, text: JSON.stringify({ data: { sources: [
          { url: 'https://cdn.example/cit720.m3u8', quality: '720p | English', format: 'hls' },
          { url: 'https://cdn.example/cit480.m3u8', quality: '480p | English', format: 'hls' },
        ] } }), url }
      }
      if (url.endsWith('.m3u8')) return { status: 200, text: mediaPlaylist, url }
      throw new Error(`Unexpected ${url}`)
    })
    const scoped = createRivestreamProvider(client, () => now, { id: 'rivecitadel', subs: ['citadel'] })
    const result = await scoped.resolve(input, new AbortController().signal)
    expect(result).toMatchObject({ ok: true, sources: [
      { key: 'citadel:720p:0', height: 720, qualityGroup: 'citadel', qualityHint: '720p', language: 'en' },
      { key: 'citadel:480p:1', height: 480, qualityGroup: 'citadel', qualityHint: '480p', language: 'en' },
    ] })
  })
  for (const [id, sub] of [['riveapex', 'apex'], ['rivevanguard', 'vanguard'], ['riveaura', 'aura'], ['riveapogee', 'apogee'], ['rivecitadel', 'citadel'], ['riverigel', 'rigel']] as const) {
    it(`scopes the ${id} single-sub provider to ${sub} only`, async () => {
      const client = vi.fn<ProviderHttp>(async (url, _headers, signal) => {
        signal.throwIfAborted()
        if (url.includes('scrapper.rivestream.app')) {
          return { status: 200, text: JSON.stringify({ data: { sources: [{ url: 'https://cdn.example/solo.m3u8', quality: '1080p' }] } }), url }
        }
        if (url.endsWith('.m3u8')) return { status: 200, text: mediaPlaylist, url }
        throw new Error(`Unexpected ${url}`)
      })
      const scoped = createRivestreamProvider(client, () => now, { id, subs: [sub] })
      expect(scoped.id).toBe(id)
      const result = await scoped.resolve(input, new AbortController().signal)
      expect(result).toMatchObject({ ok: true, sources: [{ key: `${sub}:1080p:0` }] })
      const requested = client.mock.calls.map(([url]) => String(url))
      expect(requested.some((url) => url.includes(`provider=${sub}`))).toBe(true)
      expect(requested.filter((url) => url.includes('scrapper.rivestream.app'))).toHaveLength(1)
    })
  }
  it('resolves Poseidon movies through the haha search slice', async () => {
    const client = vi.fn<ProviderHttp>(async (url, _headers, signal) => {
      signal.throwIfAborted()
      if (url.includes('hahaevilcraft.site/api/search')) {
        return { status: 200, text: JSON.stringify({ results: [
          { providerName: 'Athena', streams: [{ url: 'https://cdn.example/other.m3u8' }] },
          { providerName: 'Poseidon', streams: [
            { url: 'https://cdn.example/poseidon.m3u8', quality: '1080p' },
            { url: 'https://proxy.example/watch?u=https%3A%2F%2Fcdn.example%2Fwrapped.m3u8&h=%7B%22Referer%22%3A%22https%3A%2F%2Fvidcore.org%2F%22%7D', quality: '720p' },
            { url: 'https://cdn.example/poseidon.m3u8', quality: '1080p' },
          ] },
        ] }), url }
      }
      throw new Error(`Unexpected ${url}`)
    })
    const result = await createPoseidonProvider(client, () => now).resolve(input, new AbortController().signal)
    expect(client.mock.calls[0]?.[0]).toBe('https://hahaevilcraft.site/api/search?q=1&type=movie')
    expect(result).toMatchObject({ ok: true, sources: [
      { key: 'poseidon:1080p:0', type: 'hls', qualityHint: '1080p', language: 'original', headers: { referer: 'https://vidcore.org/' } },
      { key: 'poseidon:720p:1', type: 'hls', qualityHint: '720p' },
    ] })
    expect(result.ok && result.sources).toHaveLength(2)
  })
  it('resolves Poseidon episodes and answers empty on misses', async () => {
    const client = vi.fn<ProviderHttp>(async (url, _headers, signal) => {
      signal.throwIfAborted()
      if (url.includes('hahaevilcraft.site/api/search')) {
        return { status: 200, text: JSON.stringify({ results: [{ providerName: 'Poseidon', streams: [{ url: 'https://cdn.example/ep.m3u8' }] }] }), url }
      }
      throw new Error(`Unexpected ${url}`)
    })
    const result = await createPoseidonProvider(client, () => now).resolve(episode, new AbortController().signal)
    expect(client.mock.calls[0]?.[0]).toBe('https://hahaevilcraft.site/api/search?q=2&type=tv&season=3&episode=4')
    expect(result).toMatchObject({ ok: true, sources: [{ key: 'poseidon:auto:0', qualityHint: 'Auto' }] })
    expect(await createPoseidonProvider(http({ status: 404, text: '' }), () => now).resolve(input, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
  })
  it('scopes Vidnest to one server for the Catflix row', async () => {
    const client = vi.fn<ProviderHttp>(async (url, _headers, signal) => {
      signal.throwIfAborted()
      if (url.includes('/yflix/movie/1')) {
        return { status: 200, text: JSON.stringify({ encrypted: true, data: 'unused' }), url }
      }
      if (url.includes('/rogflix/')) throw new Error('must not query other servers')
      throw new Error(`Unexpected ${url}`)
    })
    const scoped = createVidnestProvider(client, () => now, { id: 'catflix', servers: ['catflix'] })
    expect(scoped.id).toBe('catflix')
    // Encrypted blob undecodable here: the scope is proven by the single
    // yflix request and no rogflix traffic; empty (not malformed) surfaces.
    const result = await scoped.resolve(input, new AbortController().signal)
    expect(result).toMatchObject({ ok: false, code: 'empty' })
    expect(client.mock.calls.map(([url]) => String(url)).some((url) => url.includes('/yflix/movie/1'))).toBe(true)
  })
  it('rejects anime refs in RiveStream before any upstream work', async () => {
    const client = vi.fn<ProviderHttp>(async () => { throw new Error('must not fetch') })
    const animeInput = { ...input, ref: { kind: 'anime' as const, id: 793, episode: 1 } }
    expect(await createRivestreamProvider(client, () => now).resolve(animeInput, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
    expect(client).not.toHaveBeenCalled()
  })
  it('rejects anime refs in Vidnest before any upstream work', async () => {
    const client = vi.fn<ProviderHttp>(async () => { throw new Error('must not fetch') })
    const animeInput = { ...input, ref: { kind: 'anime' as const, id: 793, episode: 1 } }
    expect(await createVidnestProvider(client, () => now).resolve(animeInput, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
    expect(await createVidnestProvider(client, () => now, { id: 'catflix', servers: ['catflix'] }).resolve(animeInput, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
    expect(client).not.toHaveBeenCalled()
  })
  it('restricts kind-scoped RiveStream rows before any upstream work', async () => {
    const client = vi.fn<ProviderHttp>(async (url, _headers, signal) => {
      signal.throwIfAborted()
      if (url.includes('scrapper.rivestream.app')) {
        return { status: 200, text: JSON.stringify({ data: { sources: [{ url: 'https://cdn.example/film.m3u8', quality: '1080p' }] } }), url }
      }
      if (url.endsWith('.m3u8')) return { status: 200, text: mediaPlaylist, url }
      throw new Error(`Unexpected ${url}`)
    })
    const moviesOnly = createRivestreamProvider(client, () => now, { id: 'riveapex', subs: ['apex'], kinds: ['movie'] })
    expect(await moviesOnly.resolve(input, new AbortController().signal)).toMatchObject({ ok: true })
    expect(await moviesOnly.resolve(episode, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
    expect(client.mock.calls.map(([url]) => String(url)).some((url) => url.includes('season=3'))).toBe(false)
  })
  it('keeps extensionless RiveStream sources that declare an hls format', async () => {
    const client = vi.fn<ProviderHttp>(async (url, _headers, signal) => {
      signal.throwIfAborted()
      if (url.includes('scrapper.rivestream.app')) {
        return { status: 200, text: JSON.stringify({ data: { sources: [
          { url: 'https://cdn.example/content?v=abc', quality: 'HLS', format: 'hls' },
          { url: 'https://cdn.example/blob', quality: 'Auto' },
        ] } }), url }
      }
      if (url.endsWith('.m3u8')) return { status: 200, text: mediaPlaylist, url }
      throw new Error(`Unexpected ${url}`)
    })
    const result = await createRivestreamProvider(client, () => now).resolve(input, new AbortController().signal)
    expect(result).toMatchObject({ ok: true, sources: [{ type: 'hls', qualityHint: 'HLS' }] })
    expect(result.ok && result.sources).toHaveLength(1)
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
  it('resolves RiveStream Hindi first for Hindi audio across new sub-providers', async () => {
    const hindi = { ...episode, audioLanguage: 'hi' }
    const client = vi.fn<ProviderHttp>(async (url, _headers, signal) => {
      signal.throwIfAborted()
      const body = (sources: unknown) => ({ status: 200, text: JSON.stringify({ data: { sources } }), url })
      if (url.includes('provider=apex')) return body([{ url: 'https://cdn.example/apex.m3u8', quality: '1080p' }])
      if (url.includes('provider=hindicast')) return body([{ url: 'https://cdn.example/hindi.m3u8', quality: '720p' }])
      if (url.includes('provider=citadel')) return body([{ url: 'https://cdn.example/en.m3u8', quality: '1080p' }])
      return body([])
    })
    const result = await createRivestreamProvider(client, () => now).resolve(hindi, new AbortController().signal)
    expect(result).toMatchObject({ ok: true, sources: [{ language: 'hi' }, { language: 'en' }, { language: 'en' }] })
    expect(client.mock.calls.some((call) => String(call[0]).includes('provider=apex'))).toBe(true)
  })
  it('resolves RiveStream episodes and prefers the requested audio', async () => {
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
    expect(result).toMatchObject({ ok: true, sources: [{ language: 'en' }, { language: 'fr' }] })
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
  for (const [label, request] of [
    ['movie', input],
    ['episode', episode],
  ] as const) {
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
    const result = await createWecollegeProvider(client, metadata, () => now, { id: 'wecollege-miami', cities: ['miami'] })
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
    const result = await createWecollegeProvider(client, metadata, () => now, { id: 'wecollege-miami', cities: ['miami'] }).resolve(episode, new AbortController().signal)
    expect(client.mock.calls[1]?.[0]).toContain('seasonId=3&episodeId=4')
    expect(result).toMatchObject({ ok: true, sources: [{ url: 'https://cdn.example/ep.m3u8', height: 720 }] })
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
    expect(result).toMatchObject({ ok: true, sources: [{ key: 'miami:1080p:0', qualityGroup: 'miami' }] })
    const boiseCalls = http({ text: JSON.stringify({ seed }) }, { text: seal(miamiPayload, 550) }, manifest)
    const boise = createWecollegeProvider(boiseCalls, metadata, () => now, { id: 'wecollege-boise', cities: ['boise'] })
    await boise.resolve({ ...input, ref: { kind: 'movie' as const, id: 550 } }, new AbortController().signal)
    expect(boiseCalls.mock.calls[1]?.[0]).toContain('/boise/sources?')
    expect(boiseCalls.mock.calls.some(([url]) => url.includes('/miami/'))).toBe(false)
  })
  it('prefers explicit WeCollege heights over a first-city Auto instead of locking to low quality', async () => {
    const seed = 'quality-seed-11'
    const seal = (payload: unknown, tmdb: number) => {
      const body = Buffer.concat([Buffer.from([109, 118, 109, 49]), Buffer.from(JSON.stringify(payload))])
      const ks = keystream(seed, tmdb, body.length)
      return Buffer.from(body.map((byte, index) => byte ^ ks[index]!)).toString('base64url')
    };
    const metadata = async () => ({ title: 'Fight Club', year: 1999, imdbId: 'tt0137523' })
    // Route by URL so the test holds under sequential and fanout fetching alike.
    const client = vi.fn<ProviderHttp>(async (url, _headers, signal) => {
      signal.throwIfAborted()
      if (url.includes('/seed?')) return { status: 200, text: JSON.stringify({ seed }), url }
      if (url.includes('/lowcity/sources?')) return { status: 200, text: seal({ sources: [{ quality: 'Auto', url: 'https://cdn.example/low.m3u8' }] }, 550), url }
      if (url.includes('/hicity/sources?')) return { status: 200, text: seal({ sources: [
        { quality: '2160p', url: 'https://cdn.example/hi2160.m3u8' },
        { quality: '1080p', url: 'https://cdn.example/hi1080.m3u8' },
      ] }, 550), url }
      if (url.endsWith('.m3u8')) return { status: 200, text: mediaPlaylist, url }
      throw new Error(`Unexpected request ${url}`)
    })
    const result = await createWecollegeProvider(client, metadata, () => now, { id: 'wecollege-miami', cities: ['lowcity', 'hicity'] })
      .resolve({ ...input, ref: { kind: 'movie' as const, id: 550 } }, new AbortController().signal)
    expect(result).toMatchObject({ ok: true })
    expect(result.ok && result.sources.map((source) => source.height)).toEqual([2160, 1080])
    expect(result.ok && result.sources[0]).toMatchObject({ qualityHint: '2160p' })
  })
  it('sinks browser-gated WeCollege hosts below playable ones instead of leading with a dead 1080p', async () => {
    const seed = 'gated-host-seed-2'
    const seal = (payload: unknown, tmdb: number) => {
      const body = Buffer.concat([Buffer.from([109, 118, 109, 49]), Buffer.from(JSON.stringify(payload))])
      const ks = keystream(seed, tmdb, body.length)
      return Buffer.from(body.map((byte, index) => byte ^ ks[index]!)).toString('base64url')
    };
    const metadata = async () => ({ title: 'Fight Club', year: 1999, imdbId: 'tt0137523' })
    const client = vi.fn<ProviderHttp>(async (url, _headers, signal) => {
      signal.throwIfAborted()
      if (url.includes('/seed?')) return { status: 200, text: JSON.stringify({ seed }), url }
      if (url.includes('/miami/sources?')) return { status: 200, text: seal({ sources: [{ quality: '1080p', url: 'https://moon.peakstorm.top/vd/x/index.m3u8' }] }, 550), url }
      if (url.includes('/boise/sources?')) return { status: 200, text: seal({ sources: [{ quality: '720p', url: 'https://cdn.example/boise.m3u8' }] }, 550), url }
      if (url.endsWith('.m3u8')) return { status: 200, text: mediaPlaylist, url }
      throw new Error(`Unexpected request ${url}`)
    })
    const result = await createWecollegeProvider(client, metadata, () => now, { cities: ['miami', 'boise'] })
      .resolve({ ...input, ref: { kind: 'movie' as const, id: 550 } }, new AbortController().signal)
    expect(result).toMatchObject({ ok: true })
    expect(result.ok && result.sources.map((source) => source.url)).toEqual([
      'https://cdn.example/boise.m3u8',
      'https://moon.peakstorm.top/vd/x/index.m3u8',
    ])
  })
  it('measures WeCollege master ceilings instead of trusting inflated quality labels', async () => {
    const seed = 'ceiling-seed-5'
    const seal = (payload: unknown, tmdb: number) => {
      const body = Buffer.concat([Buffer.from([109, 118, 109, 49]), Buffer.from(JSON.stringify(payload))])
      const ks = keystream(seed, tmdb, body.length)
      return Buffer.from(body.map((byte, index) => byte ^ ks[index]!)).toString('base64url')
    };
    const metadata = async () => ({ title: 'Show', year: 2026 })
    // Labeled 1080p upstream, but the master tops at 800p with 266/534/800
    // renditions; the genuine 2160p media playlist must win the ranking.
    const inflatedMaster = '#EXTM3U\n'
      + '#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x266\nlow.m3u8\n'
      + '#EXT-X-STREAM-INF:BANDWIDTH=2800000,RESOLUTION=960x534\nmid.m3u8\n'
      + '#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1440x800\nhi.m3u8\n'
    const client = vi.fn<ProviderHttp>(async (url, _headers, signal) => {
      signal.throwIfAborted()
      if (url.includes('/seed?')) return { status: 200, text: JSON.stringify({ seed }), url }
      if (url.includes('/phoenix/sources?')) return { status: 200, text: seal({ sources: [{ quality: '1080p', url: 'https://cdn.example/phoenix.m3u8' }] }, 9), url }
      if (url.includes('/miami/sources?')) return { status: 200, text: seal({ sources: [{ quality: '2160p', url: 'https://cdn.example/miami-2160.m3u8' }] }, 9), url }
      if (url === 'https://cdn.example/phoenix.m3u8') return { status: 200, text: inflatedMaster, url }
      if (url === 'https://cdn.example/miami-2160.m3u8') return { status: 200, text: mediaPlaylist, url }
      throw new Error(`Unexpected request ${url}`)
    })
    const result = await createWecollegeProvider(client, metadata, () => now, { id: 'wecollege-miami', cities: ['phoenix', 'miami'] })
      .resolve({ ...input, ref: { kind: 'movie' as const, id: 9 } }, new AbortController().signal)
    expect(result).toMatchObject({ ok: true })
    expect(result.ok && result.sources.map((source) => [source.height, source.qualityHint])).toEqual([[2160, '2160p'], [800, '800p']])
  })
  it('drops WeCollege split-host playlists whose segments live outside the configured media set', async () => {
    const seed = 'split-host-seed-8'
    const seal = (payload: unknown, tmdb: number) => {
      const body = Buffer.concat([Buffer.from([109, 118, 109, 49]), Buffer.from(JSON.stringify(payload))])
      const ks = keystream(seed, tmdb, body.length)
      return Buffer.from(body.map((byte, index) => byte ^ ks[index]!)).toString('base64url')
    };
    const metadata = async () => ({ title: 'Show', year: 2026 })
    // Same-host relative segments play browser-direct; absolute segments on
    // a hotlink-guarded foreign host 403 without provider referers, and no
    // relay exists — so the entry must fail closed even at a higher label.
    const splitManifest = '#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXT-X-MEDIA-SEQUENCE:0\n'
      + '#EXT-X-MAP:URI="https://guard.example/init-s2160p.mp4"\n#EXTINF:6,\nhttps://guard.example/seg-1-s2160p.m4s\n'
    const client = vi.fn<ProviderHttp>(async (url, _headers, signal) => {
      signal.throwIfAborted()
      if (url.includes('/seed?')) return { status: 200, text: JSON.stringify({ seed }), url }
      if (url.includes('/metro/sources?')) return { status: 200, text: seal({ sources: [
        { quality: '1080p', url: 'https://cdn.example/good.m3u8' },
        { quality: '2160p', url: 'https://cdn.example/split.m3u8' },
      ] }, 7), url }
      if (url === 'https://cdn.example/good.m3u8') return { status: 200, text: mediaPlaylist, url }
      if (url === 'https://cdn.example/split.m3u8') return { status: 200, text: splitManifest, url }
      throw new Error(`Unexpected request ${url}`)
    })
    const result = await createWecollegeProvider(client, metadata, () => now, { id: 'wecollege', cities: ['metro'], mediaHosts: ['cdn.example'] })
      .resolve({ ...input, ref: { kind: 'movie' as const, id: 7 } }, new AbortController().signal)
    expect(result).toMatchObject({ ok: true })
    expect(result.ok && result.sources.map((source) => source.url)).toEqual(['https://cdn.example/good.m3u8'])
  })
  it('lists only absolute playlist hosts for containment checks', async () => {
    const { playlistAbsoluteHosts } = await import('./http.ts')
    expect(playlistAbsoluteHosts(mediaPlaylist)).toEqual([])
    expect(playlistAbsoluteHosts(
      '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1,RESOLUTION=640x360\nlow.m3u8\n'
      + '#EXT-X-STREAM-INF:BANDWIDTH=2,RESOLUTION=1280x720\nhttps://other.example/hi.m3u8\n',
    )).toEqual(['other.example'])
    expect(playlistAbsoluteHosts(
      '#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXT-X-MEDIA-SEQUENCE:0\n'
      + '#EXT-X-MAP:URI="https://guard.example/init.mp4"\n#EXTINF:6,\nhttps://guard.example/seg.m4s\n',
    )).toEqual(['guard.example'])
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
    expect(client.mock.calls[0]?.[0]).toBe('https://vidrock.to/api/movie/1')
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
    expect(client.mock.calls[0]?.[0]).toBe('https://vidrock.to/api/tv/2/3/4')
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
    const client = vi.fn<ProviderHttp>(async url => {
      const body = new URL(url).hostname === 'sub.vdrk.site'
        ? [{ file: 'https://cdn.example/en.vtt', label: 'English' }, { label: 'NoFile' }]
        : { encrypted: true, data: encode(url.includes('/yflix/') ? { url: 'https://cdn.example/a.m3u8', quality: '1080p' }
          : url.includes('/rogflix/') ? { streams: [{ url: 'https://cdn.example/b.mp4', language: 'English' }] } : {}) }
      return { status: 200, url, text: JSON.stringify(body) }
    })
    const result = await createVidnestProvider(client, () => now).resolve(input, new AbortController().signal)
    expect(client.mock.calls[0]?.[0]).toBe('https://new.vidnest.fun/yflix/movie/1')
    expect(result).toMatchObject({ ok: true, sources: [
      { key: 'vidnest:catflix:0', type: 'hls', qualityHint: '1080p' },
      { key: 'vidnest:filxer:1', type: 'native', qualityHint: 'Auto' },
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
      { type: 'hls', qualityHint: 'Hindi', language: 'hi' },
      { type: 'hls', qualityHint: 'Hindi', language: 'hi' },
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
  it('prefers the requested audio language across CineHD leaves', async () => {
    const leaves = [{ title: 'Hindi', file: '~h' }, { title: 'English', file: '~e' }]
    const identity = () => Promise.resolve({ imdbId: 'tt1375666' })
    const client = vi.fn<ProviderHttp>(async (url) => {
      if (url.includes('/api/hdmovies/embed')) return { status: 200, text: '<html><iframe src="https://play.example/play/1"></iframe></html>', url }
      if (url.includes('/play/1')) return { status: 200, text: '{"file":"/playlist/x","key":"k"}', url }
      if (url.includes('/playlist/x')) return { status: 200, text: JSON.stringify(leaves), url }
      if (url.includes('/playlist/h.txt')) return { status: 200, text: 'https://cdn.example/hindi.m3u8', url }
      if (url.includes('/playlist/e.txt')) return { status: 200, text: 'https://cdn.example/english.m3u8', url }
      return { status: 404, text: '', url }
    })
    const hindi = await createCinehdProvider(client, identity, () => now).resolve({ ...input, audioLanguage: 'hi' }, new AbortController().signal)
    expect(hindi).toMatchObject({ ok: true, sources: [{ language: 'hi' }, { language: 'en' }] })
    const english = await createCinehdProvider(client, identity, () => now).resolve(input, new AbortController().signal)
    expect(english).toMatchObject({ ok: true, sources: [{ language: 'en' }, { language: 'hi' }] })
  })
  it('keeps only matching audio on CineHD alias rows and stays honest when absent', async () => {
    const leaves = [{ title: 'Hindi', file: '~h' }, { title: 'English', file: '~e' }]
    const identity = () => Promise.resolve({ imdbId: 'tt1375666' })
    const client = vi.fn<ProviderHttp>(async (url) => {
      if (url.includes('/api/hdmovies/embed')) return { status: 200, text: '<html><iframe src="https://play.example/play/1"></iframe></html>', url }
      if (url.includes('/play/1')) return { status: 200, text: '{"file":"/playlist/x","key":"k"}', url }
      if (url.includes('/playlist/x')) return { status: 200, text: JSON.stringify(leaves), url }
      if (url.includes('/playlist/h.txt')) return { status: 200, text: 'https://cdn.example/hindi.m3u8', url }
      if (url.includes('/playlist/e.txt')) return { status: 200, text: 'https://cdn.example/english.m3u8', url }
      return { status: 404, text: '', url }
    })
    const hindi = await createCinehdProvider(client, identity, () => now, { id: 'cinehd-hindi', audio: 'hi' }).resolve(input, new AbortController().signal)
    expect(hindi).toMatchObject({ ok: true, sources: [{ key: 'cinehd-hindi:hi:0', language: 'hi' }] })
    expect(hindi.ok && hindi.sources).toHaveLength(1)
    const english = await createCinehdProvider(client, identity, () => now, { id: 'cinehd-english', audio: 'en' }).resolve(input, new AbortController().signal)
    expect(english).toMatchObject({ ok: true, sources: [{ key: 'cinehd-english:en:0', language: 'en' }] })
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
  it('resolves Stellar movie streams with proof-of-work and merged subtitles', async () => {
    const client = vi.fn<ProviderHttp>(async (url) => {
      if (url.includes('/api/challenge')) {
        return { status: 200, text: JSON.stringify({ challenge: 'abc123', difficulty: 1, expiresIn: 90 }), url }
      }
      if (url.includes('/api/resolve')) {
        return { status: 200, text: JSON.stringify({ url: 'https://cdn.example/orbit.m3u8', format: 'hls', source: 'Orbit', availableSources: ['Orbit', 'Nova'], subtitles: [] }), url }
      }
      if (url.includes('/api/subtitles')) {
        return { status: 200, text: JSON.stringify({ subtitles: [{ url: 'https://cdn.example/en.srt', label: 'English', language: 'en' }] }), url }
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
          headers: { referer: 'https://stellar.gdn/' },
          subtitles: [{ id: 'stellar-sub-0', label: 'English', format: 'srt' }],
        },
      ],
    })
  })
  it('resolves Stellar episode streams and keeps resolve subtitles when the subtitle endpoint fails', async () => {
    const client = vi.fn<ProviderHttp>(async (url) => {
      if (url.includes('/api/challenge')) {
        return { status: 200, text: JSON.stringify({ challenge: 'abc123', difficulty: 1, expiresIn: 90 }), url }
      }
      if (url.includes('/api/resolve')) {
        return { status: 200, text: JSON.stringify({ url: 'https://cdn.example/nova.m3u8', format: 'hls', source: 'Nova', subtitles: [{ url: 'https://cdn.example/fallback.vtt', label: 'English' }] }), url }
      }
      if (url.includes('/api/subtitles')) {
        return { status: 500, text: 'Internal Server Error', url }
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
  it('returns empty when the Stellar challenge is unreachable', async () => {
    const client = vi.fn<ProviderHttp>(async (url) => ({ status: 404, text: '', url }))
    const result = await createStellarProvider(client, () => now).resolve(input, new AbortController().signal)
    expect(result).toMatchObject({ ok: false, code: 'empty' })
  })
  it('resolves Aphrodite streams through the signed hls.lol backend', async () => {
    const sign = { sign: vi.fn(async () => ({ 'X-A-Sid': 'sid-1' })), clear: vi.fn() }
    const client = vi.fn<ProviderHttp>(async (url) => {
      if (url.includes('/content/movie/1')) {
        return { status: 200, text: JSON.stringify({ found: true, hls: 'https://cdn.example/aphrodite.m3u8' }), url }
      }
      if (url.includes('/subs?')) {
        return { status: 200, text: JSON.stringify({ subtitles: [{ url: 'https://cdn.example/en.vtt', label: 'English' }] }), url }
      }
      if (url.includes('cdn.example/aphrodite.m3u8')) {
        return { status: 200, text: '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=1920x1080\nseg.m3u8', url }
      }
      return { status: 404, text: '', url }
    })
    const result = await createAphroditeProvider(client, () => now, { sign }).resolve(input, new AbortController().signal)
    expect(sign.sign).toHaveBeenCalledWith('https://cdn.hls.lol', '/content/movie/1')
    expect(result).toMatchObject({
      ok: true,
      sources: [{ key: 'aphrodite:auto:0', type: 'hls', url: 'https://cdn.example/aphrodite.m3u8', qualityHint: '1080p', subtitles: [{ id: 'aphrodite-sub-0', format: 'vtt' }] }],
    })
  })
  it('clears the Aphrodite session and retries once on 401', async () => {
    const sign = { sign: vi.fn(async () => ({})), clear: vi.fn() }
    let calls = 0
    const client = vi.fn<ProviderHttp>(async (url) => {
      if (url.includes('/content/movie/1')) {
        calls++
        if (calls === 1) return { status: 401, text: '', url }
        return { status: 200, text: JSON.stringify({ found: true, hls: 'https://cdn.example/retry.m3u8' }), url }
      }
      if (url.includes('cdn.example/retry.m3u8')) {
        return { status: 200, text: '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=1920x1080\nseg.m3u8', url }
      }
      return { status: 404, text: '', url }
    })
    const result = await createAphroditeProvider(client, () => now, { sign }).resolve(input, new AbortController().signal)
    expect(sign.clear).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ ok: true, sources: [{ url: 'https://cdn.example/retry.m3u8' }] })
  })
  // Mirror of the adapter's vendored Helios client key.
  async function encryptHelios(url: string): Promise<string> {
    const subtle = globalThis.crypto.subtle
    const key = await subtle.importKey(
      'raw',
      Uint8Array.from(Buffer.from('e4b8a1d6f2c9037b5a8e4d1c6f9b2085a7c3e9f6d1b4a8c2e5f7a0d3b6c9e2f5', 'hex')),
      { name: 'AES-GCM' },
      false,
      ['encrypt'],
    )
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12))
    const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(url)))
    return `ns_${Buffer.concat([Buffer.from(iv), Buffer.from(ct)]).toString('hex')}`
  }
  it('falls back to Helios when the cdn backend has no direct stream', async () => {
    const sign = { sign: vi.fn(async () => ({})), clear: vi.fn() }
    const payload = await encryptHelios('https://peraspera.nbsycfzrpa4.workers.dev/helios.m3u8')
    const client = vi.fn<ProviderHttp>(async (url) => {
      if (url.includes('/content/movie/1')) {
        return { status: 200, text: JSON.stringify({ found: false }), url }
      }
      if (url.includes('/helios?')) {
        return { status: 200, text: JSON.stringify({ sources: { Moscow: { url: payload } } }), url }
      }
      if (url.includes('peraspera.nbsycfzrpa4.workers.dev')) {
        return { status: 200, text: '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=1280x720\nseg.m3u8', url }
      }
      return { status: 404, text: '', url }
    })
    const result = await createAphroditeProvider(client, () => now, { sign }).resolve(input, new AbortController().signal)
    expect(result).toMatchObject({ ok: true, sources: [
      { key: 'aphrodite:auto:0', type: 'hls', url: 'https://peraspera.nbsycfzrpa4.workers.dev/helios.m3u8', qualityHint: '720p' },
    ] })
  })
  it('treats a non-playlist cdn answer as a miss and uses Helios', async () => {
    const sign = { sign: vi.fn(async () => ({})), clear: vi.fn() }
    const payload = await encryptHelios('https://peraspera.nbsycfzrpa4.workers.dev/helios.m3u8')
    const client = vi.fn<ProviderHttp>(async (url) => {
      if (url.includes('/content/movie/1')) {
        return { status: 200, text: JSON.stringify({ found: true, hls: 'https://cdn.example/homepage' }), url }
      }
      if (url.endsWith('/homepage')) {
        return { status: 200, text: '<html><body>atlantic.st</body></html>', url }
      }
      if (url.includes('/helios?')) {
        return { status: 200, text: JSON.stringify({ sources: { Moscow: { url: payload } } }), url }
      }
      if (url.includes('peraspera.nbsycfzrpa4.workers.dev')) {
        return { status: 200, text: '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=1280x720\nseg.m3u8', url }
      }
      return { status: 404, text: '', url }
    })
    const result = await createAphroditeProvider(client, () => now, { sign }).resolve(input, new AbortController().signal)
    expect(result).toMatchObject({ ok: true, sources: [
      { url: 'https://peraspera.nbsycfzrpa4.workers.dev/helios.m3u8', qualityHint: '720p' },
    ] })
  })
  it('resolves FilmU Ainary through the Ainary extractor only', async () => {
    const identity = () => Promise.resolve({ imdbId: 'tt15239678' })
    const client = vi.fn<ProviderHttp>(async (url) => {
      if (url.includes('/scrape/Ainary/')) {
        return { status: 200, text: JSON.stringify({ sources: [
          { url: 'https://cdn.example/a1080.m3u8', quality: '1080p' },
          { url: 'https://cdn.example/a720.m3u8', quality: '720p' },
          { url: 'https://cdn.example/a480.m3u8', quality: '480p' },
        ] }), url }
      }
      return { status: 404, text: '', url }
    })
    const result = await createFilmuProvider(client, identity, () => now, { id: 'filmuainary', extractors: ['Ainary'] })
      .resolve(input, new AbortController().signal)
    expect(result).toMatchObject({ ok: true, sources: [
      { key: 'filmuainary:ainary:0', type: 'hls', qualityHint: '1080p' },
      { key: 'filmuainary:ainary:1', type: 'hls', qualityHint: '720p' },
      { key: 'filmuainary:ainary:2', type: 'hls', qualityHint: '480p' },
    ] })
    const requested = client.mock.calls.map(([url]) => String(url))
    expect(requested.some((url) => url.includes('/scrape/Videasy/'))).toBe(false)
    expect(requested.some((url) => url.includes('/scrape/NoTorrent/'))).toBe(false)
  })
  it('resolves VidZen movies with relative URLs and pooled failover servers', async () => {
    const client = vi.fn<ProviderHttp>(async (url) => {
      if (url.includes('/api/sources?type=movie')) {
        return { status: 200, text: JSON.stringify({
          sources: [
            { url: 'https://free.finepulfe.xyz/vid/playlist.m3u8', label: '1080p', server: 'sv-ps' },
            { url: '/api/stream/abc/master.m3u8', label: 'Auto', server: 'sv-vn-l' },
            { url: 'https://cdn.example/film.mp4', label: '720p HD', server: 'sv-pi' },
            { url: 'https://free.finepulfe.xyz/vid/playlist.m3u8', label: '1080p', server: 'sv-ps' },
          ],
          sourcePool: { 'sv-ps': [{ url: 'https://free.finepulfe.xyz/vid/alt.m3u8', label: '480p' }] },
          subtitles: [
            { file: 'https://cdn.example/en.vtt', label: 'English' },
            { url: 'https://cdn.example/es.srt', lang: 'Spanish' },
          ],
        }), url }
      }
      return { status: 404, text: '', url }
    })
    const result = await createVidzenProvider(client, () => now).resolve(input, new AbortController().signal)
    expect(client.mock.calls[0]?.[0]).toBe('https://vidzen.fun/api/sources?type=movie&id=1')
    expect(result).toMatchObject({ ok: true, sources: [
      { key: 'vidzen:1080p:0', type: 'hls', url: 'https://free.finepulfe.xyz/vid/playlist.m3u8', qualityHint: '1080p', height: 1080, language: 'original' },
      { key: 'vidzen:auto:1', type: 'hls', url: 'https://vidzen.fun/api/stream/abc/master.m3u8', qualityHint: 'Auto' },
      { key: 'vidzen:720p:2', type: 'native', qualityHint: '720p', height: 720 },
      { key: 'vidzen:480p:4', type: 'hls', qualityHint: '480p' },
    ] })
    expect(result.ok && result.sources).toHaveLength(4)
    expect(result.ok && result.sources[0]?.subtitles).toMatchObject([
      { id: 'vidzen-sub-0', format: 'vtt' },
      { id: 'vidzen-sub-1', format: 'srt' },
    ])
  })
  it('resolves VidZen episodes with season/episode params and answers empty on misses', async () => {
    const client = vi.fn<ProviderHttp>(async (url) => {
      if (url.includes('/api/sources?type=tv')) {
        return { status: 200, text: JSON.stringify({ sources: [{ url: 'https://free.finepulfe.xyz/ep.m3u8', label: 'Auto' }] }), url }
      }
      return { status: 404, text: '', url }
    })
    const result = await createVidzenProvider(client, () => now).resolve(episode, new AbortController().signal)
    expect(client.mock.calls[0]?.[0]).toBe('https://vidzen.fun/api/sources?type=tv&id=2&season=3&episode=4')
    expect(result).toMatchObject({ ok: true, sources: [{ key: 'vidzen:auto:0' }] })
    expect(await createVidzenProvider(http({ status: 404, text: '' }), () => now).resolve(input, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
  })
  it('resolves Stig Nebula through the secure channel with one server scope', async () => {
    const client = vi.fn<ProviderHttp>(async (url) => {
      if (url.includes('/secure/handshake')) {
        // Real server-side ECDH half so the client derives a live session key.
        const subtle = globalThis.crypto.subtle
        const serverKeys = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
        const serverPub = new Uint8Array(await subtle.exportKey('raw', serverKeys.publicKey))
        const salt = globalThis.crypto.getRandomValues(new Uint8Array(16))
        const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64')
        return { status: 200, text: JSON.stringify({ sessionId: 'test-session', serverPublicKey: b64(serverPub), salt: b64(salt), ttl: 600000 }), url }
      }
      if (url.includes('/movie/Nebula/1')) {
        return { status: 200, text: JSON.stringify({ streams: [
          { url: 'https://proxy.stigstream.ru/content?v=neb2160', type: 'hls', quality: '2160p' },
          { url: 'https://proxy.yflix.ru/content?v=neb1080', type: 'hls', quality: '1080p' },
        ], subtitles: [{ url: 'https://proxy.stigstream.ru/subs/en.vtt', lang: 'English' }] }), url }
      }
      return { status: 404, text: '', url }
    })
    const result = await createStigstreamProvider(client, () => now, { id: 'stignebula', server: 'Nebula', audioLanguage: 'original' })
      .resolve(input, new AbortController().signal)
    expect(result).toMatchObject({ ok: true, sources: [
      { key: 'stignebula:2160p:0', type: 'hls', language: 'original', headers: { referer: 'https://stigstream.ru/' }, height: 2160 },
      { key: 'stignebula:1080p:1', type: 'hls', language: 'original', height: 1080 },
    ] })
    expect(result.ok && result.sources[0]?.subtitles).toMatchObject([{ id: 'stignebula-sub-0', format: 'vtt' }])
    expect(client.mock.calls.map(([url]) => String(url)).some((url) => url.includes('/movie/Orion/'))).toBe(false)
  })
  it('scopes Stig Orion to the Orion server with Turkish audio', async () => {
    const client = vi.fn<ProviderHttp>(async (url) => {
      if (url.includes('/secure/handshake')) {
        const subtle = globalThis.crypto.subtle
        const serverKeys = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])
        const serverPub = new Uint8Array(await subtle.exportKey('raw', serverKeys.publicKey))
        const salt = globalThis.crypto.getRandomValues(new Uint8Array(16))
        const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64')
        return { status: 200, text: JSON.stringify({ sessionId: 'orion-session', serverPublicKey: b64(serverPub), salt: b64(salt), ttl: 600000 }), url }
      }
      if (url.includes('/movie/Orion/1')) {
        return { status: 200, text: JSON.stringify({ streams: [{ url: 'https://one.82b6b2a6748f1e.click/sbfEF', type: 'hls', quality: 'Auto' }] }), url }
      }
      return { status: 404, text: '', url }
    })
    const result = await createStigstreamProvider(client, () => now, { id: 'stigorion', server: 'Orion', audioLanguage: 'tr' })
      .resolve(input, new AbortController().signal)
    expect(result).toMatchObject({ ok: true, sources: [{ key: 'stigorion:auto:0', type: 'hls', language: 'tr', qualityHint: 'Auto' }] })
    const noFetch = vi.fn<ProviderHttp>(async () => { throw new Error('must not fetch') })
    const animeInput = { ...input, ref: { kind: 'anime' as const, id: 793, episode: 1 } }
    expect(await createStigstreamProvider(noFetch, () => now, { id: 'stigorion', server: 'Orion', audioLanguage: 'tr' })
      .resolve(animeInput, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
    expect(noFetch).not.toHaveBeenCalled()
  })
  it('resolves CastleTV through search, details, and per-track video', async () => {
    const secKey = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]).toString('base64')
    const encrypt = (payload: unknown) => {
      const combined = Buffer.concat([Buffer.from(secKey, 'base64'), Buffer.from('T!BgJB', 'utf8')])
      const key = combined.length < 16 ? Buffer.concat([combined, Buffer.alloc(16 - combined.length, 0)]) : combined.subarray(0, 16)
      const cipher = createCipheriv('aes-128-cbc', key, key)
      return Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]).toString('base64')
    }
    const client = vi.fn<ProviderHttp>(async (url, _headers, _signal, init) => {
      if (url.includes('/getSecurityKey')) {
        return { status: 200, text: JSON.stringify({ code: 200, data: secKey }), url }
      }
      if (url.includes('/searchByKeyword')) {
        return { status: 200, text: JSON.stringify({ data: encrypt({ rows: [{ id: 99, title: 'Test Movie' }] }) }), url }
      }
      if (url.includes('/v1.9.9/movie')) {
        return { status: 200, text: JSON.stringify({ data: encrypt({ episodes: [{ id: 7, tracks: [{ languageId: '1', languageName: 'Original' }] }] }) }), url }
      }
      if (url.includes('/getVideo2')) {
        const body = JSON.parse(String(init?.body ?? '{}'))
        return { status: 200, text: JSON.stringify({ data: encrypt(body.resolution === '3'
          ? { videoUrl: 'https://img1.bwcly.com/hls/99/master.m3u8', subtitles: [{ url: 'https://img1.bwcly.com/sub/en.vtt', abbreviate: 'EN' }] }
          : { videos: [] }) }), url }
      }
      return { status: 404, text: '', url }
    })
    const metadata = async () => ({ title: 'Test Movie', year: 2020 })
    const result = await createCastletvProvider(client, metadata, () => now).resolve(input, new AbortController().signal)
    expect(result).toMatchObject({ ok: true, sources: [
      { key: 'castletv:1080p:0', type: 'hls', qualityHint: '1080p', height: 1080, language: 'Original' },
    ] })
    expect(result.ok && result.sources).toHaveLength(1)
    expect(result.ok && result.sources[0]?.subtitles).toMatchObject([{ id: 'castletv-sub-0', format: 'vtt' }])
  })
  it('drops non-https subtitle tracks instead of dropping the whole source', async () => {
    const client = vi.fn<ProviderHttp>(async (url) => {
      if (url.includes('/api/challenge')) {
        return { status: 200, text: JSON.stringify({ challenge: 'abc123', difficulty: 1, expiresIn: 90 }), url }
      }
      if (url.includes('/api/resolve')) {
        return { status: 200, text: JSON.stringify({ url: 'https://cdn.example/orbit.m3u8', format: 'hls', source: 'Orbit', subtitles: [{ url: 'http://cdn.example/plain.srt', label: 'Plain' }] }), url }
      }
      if (url.includes('/api/subtitles')) {
        return { status: 200, text: JSON.stringify({ subtitles: [] }), url }
      }
      return { status: 404, text: '', url }
    })
    const result = await createStellarProvider(client, () => now).resolve(input, new AbortController().signal)
    expect(result).toMatchObject({
      ok: true,
      sources: [{ key: 'stellar:orbit:0', type: 'hls', url: 'https://cdn.example/orbit.m3u8', subtitles: [] }],
    })
  })
  it('keeps missing IMDb identities structured', async () => {    const missing = createVaPlayerProvider(http(), async () => ({}))
    expect(await missing.resolve(input, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty', retryable: false })
  })
  it('honors signed expire deadlines in seconds and milliseconds', () => {
    const seconds = Math.floor(now / 1000) + 600
    expect(accessDeadline(`https://cdn.example/x.m3u8?expire=${seconds}`, now)).toBe(new Date(seconds * 1000).toISOString())
    expect(accessDeadline(`https://cdn.example/x.m3u8?expire=${now + 600_000}`, now)).toBe(new Date(now + 600_000).toISOString())
    expect(accessDeadline('https://cdn.example/x.m3u8', now)).toBe(new Date(now + 300_000).toISOString())
    expect(sourceAccess('https://cdn.example/x.m3u8', now)).toEqual({ expiresAt: new Date(now + 300_000).toISOString(), expiryEstimated: true })
    expect(sourceAccess(`https://cdn.example/x.m3u8?expire=${seconds}`, now)).toEqual({ expiresAt: new Date(seconds * 1000).toISOString(), expiryEstimated: false })
    expect(sourceAccess('https://cdn.example/x.m3u8', now, now + 600_000)).toEqual({ expiresAt: new Date(now + 600_000).toISOString(), expiryEstimated: false })
    expect(() => accessDeadline(`https://cdn.example/x.m3u8?expire=${Math.floor(now / 1000) - 60}`, now)).toThrow()
  })
  it('resolves VidSrc movies through the gate chain with stamped tokens', async () => {
    const client = vi.fn<ProviderHttp>(async (url) => {
      if (url.includes('/embed/movie')) return { status: 200, text: `<html><body><iframe data-api="/vs_src.php?t=1"></iframe></body></html>`, url }
      if (url.includes('/vs_src.php')) return { status: 200, text: JSON.stringify({ src: 'https://inner.example/land' }), url }
      if (url.includes('inner.example/land')) return { status: 200, text: `<html><script>window.CFG={"playerUrl":"/player/1"};</script></html>`, url }
      if (url.includes('/player/1')) return { status: 200, text: `<html><script>window.CONFIG={"api":"https://data.example/api.php?x=1"};</script></html>`, url }
      if (url.includes('/api.php?x=1')) return { status: 200, text: JSON.stringify({ data: { stream_urls: ['https://cdn.example/a.m3u8', 'https://cdn.example/b.m3u8'] } }), url }
      if (url.includes('/generate.php')) return { status: 200, text: 'tok123', url }
      return { status: 404, text: '', url }
    })
    const result = await createVidsrcProvider(client, () => now).resolve(input, new AbortController().signal)
    expect(result).toMatchObject({ ok: true, sources: [
      { key: 'vidsrc:auto:0', type: 'hls', url: 'https://cdn.example/a.m3u8?token=tok123' },
      { key: 'vidsrc:auto:1', type: 'hls', url: 'https://cdn.example/b.m3u8?token=tok123' },
    ] })
  })
  it('rejects provider-supplied executable VidSrc decryptors', async () => {
    const client = vi.fn<ProviderHttp>(async (url) => {
      if (url.includes('/embed/movie')) return { status: 200, text: '<iframe data-api="/vs_src.php?t=1"></iframe>', url }
      if (url.includes('/vs_src.php')) return { status: 200, text: JSON.stringify({ src: 'https://inner.example/land' }), url }
      if (url.includes('inner.example/land')) return { status: 200, text: '<script>window.CFG={"playerUrl":"/player/1"};</script>', url }
      if (url.includes('/player/1')) return { status: 200, text: '<script>window.CONFIG={"api":"https://data.example/api.php?x=1"};</script>', url }
      if (url.includes('/api.php?x=1')) return { status: 200, text: JSON.stringify({ data: { stream_urls: 'encrypted' }, vs: { wasm_url: 'https://untrusted.example/decrypt.wasm' } }), url }
      return { status: 404, text: '', url }
    })
    const result = await createVidsrcProvider(client, () => now).resolve(input, new AbortController().signal)
    expect(result).toEqual({ ok: false, code: 'malformed', retryable: false })
    expect(client.mock.calls.some(([url]) => url.includes('decrypt.wasm'))).toBe(false)
  })
  it('matches flux host patterns without weakening exact allowlists', async () => {
    const patterns = [new RegExp('^srv[0-9]+\\.[a-z]+\\.site$', 'i')]
    expect(allowedMediaUrl('https://srv327.aggeosters.site/a.m3u8', ['*.boundescous.site'], patterns)).toBe(true)
    expect(allowedMediaUrl('https://srv327.aggeosters.site/a.m3u8', ['*.boundescous.site'])).toBe(false)
    expect(allowedMediaUrl('https://evil.example/a.m3u8', ['*.boundescous.site'], patterns)).toBe(false)
    expect(allowedMediaUrl('https://srv327.aggeosters.site.evil.example/a.m3u8', ['*.boundescous.site'], patterns)).toBe(false)
    expect(allowedMediaUrl('http://srv327.aggeosters.site/a.m3u8', ['*.boundescous.site'], patterns)).toBe(false)
  })
  it('matches flux CDN hosts against patterns without weakening exact rules', async () => {
    const flux = [/^srv[0-9]+\.[a-z]+\.site$/]
    expect(allowedMediaUrl('https://srv327.aggeosters.site/a.m3u8', ['cdn.example'], flux)).toBe(true)
    expect(allowedMediaUrl('https://evil.example/a.m3u8', ['cdn.example'], flux)).toBe(false)
    expect(allowedMediaUrl('https://srv327.aggeosters.site.evil.example/a.m3u8', ['cdn.example'], flux)).toBe(false)
    expect(allowedMediaUrl('http://srv327.aggeosters.site/a.m3u8', ['cdn.example'], flux)).toBe(false)
    expect(allowedMediaUrl('https://cdn.example/a.m3u8', ['cdn.example'], flux)).toBe(true)
  })
  it('matches flux CDN hosts by pattern without weakening exact rules', async () => {
    const flux = [/^srv[0-9]+\.[a-z]+\.site$/i]
    expect(allowedMediaUrl('https://srv327.aggeosters.site/a/b.m3u8', ['*.boundescous.site'], flux)).toBe(true)
    expect(allowedMediaUrl('https://srv327.aggeosters.site.evil.example/a.m3u8', ['*.boundescous.site'], flux)).toBe(false)
    expect(allowedMediaUrl('https://aggeosters.site/a.m3u8', ['*.boundescous.site'], flux)).toBe(false)
    expect(allowedMediaUrl('https://srv327.aggeosters.site/a.m3u8', ['*.boundescous.site'])).toBe(false)
  })
  it('limits CDN suffixes to true subdomains and retains HTTPS, port, and credential protections', async () => {
    const hosts = ['vixsrc.to', '*.vix-content.net']
    expect(allowedMediaUrl('https://sc-b2-24.vix-content.net/file.ts', hosts)).toBe(true)
    for (const url of ['https://vix-content.net.evil.example/file', 'https://evilvix-content.net/file', 'https://vix-content.net/file', 'https://user@sc.vix-content.net/file', 'http://sc.vix-content.net/file', 'https://sc.vix-content.net:444/file']) expect(allowedMediaUrl(url, hosts)).toBe(false)
  })
})

const animeTitle = async () => 'ONE PIECE'
const animeSub = { ref: { kind: 'anime' as const, id: 21, episode: 1 }, region: 'US', audioLanguage: 'ja' }
const animeDub = { ...animeSub, audioLanguage: 'en' }

function encryptedPlayback() {
  const key = Buffer.alloc(32, 7)
  const iv = Buffer.alloc(12, 3)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const plaintext = Buffer.from(JSON.stringify({
    sources: [{ url: 'https://edge1-frankfurt-sprintcdn.owphbf24.com/hls2/01/1/master.m3u8?t=abc', label: '720p' }],
    tracks: [{ file: 'https://edge1-frankfurt-sprintcdn.owphbf24.com/subs/en.vtt', label: 'English' }],
    expires_at: '2030-01-01T00:00:00.000Z',
  }))
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  return {
    iv: iv.toString('base64url'),
    payload: Buffer.concat([ciphertext, cipher.getAuthTag()]).toString('base64url'),
    key_parts: [key.toString('base64url')],
  }
}

const kaiServers = '<html><body>'
  + '<ul class="server-list" data-media="sub"><li data-url="https://mfw09.org/e/kaisub01" data-server="MGCLD" data-media="sub"></li></ul>'
  + '<ul class="server-list" data-media="dub"><li data-url="https://mfw09.org/e/kaidub01" data-server="MGCLD" data-media="dub"></li></ul>'
  + '</body></html>'

function kaiHttp(overrides: { search?: string; watch?: string; captcha?: string; playback?: string; playbackStatus?: number } = {}) {
  return vi.fn<ProviderHttp>(async (url) => {
    const respond = (text: string, status = 200) => ({ status, text, url })
    if (url.includes('search_live.php')) return respond(overrides.search ?? JSON.stringify({ ok: true, results: [{ slug: 'one-piece-81553', title: 'One Piece' }] }))
    if (url.includes('/watch/')) return respond(overrides.watch ?? kaiServers)
    if (url.includes('/access/challenge')) return respond(JSON.stringify({ challenge_id: 'ch1', nonce: 'nonce-1' }))
    if (url.includes('/access/attest')) return respond(JSON.stringify({ token: 'att-token', viewer_id: 'v1', device_id: 'd1' }))
    if (url.includes('/captcha/verify')) return respond(JSON.stringify({ token: 'verify-token' }))
    if (url.includes('/embed/captcha')) return respond(overrides.captcha ?? JSON.stringify({ pow_nonce: 'pow-nonce', pow_difficulty: 0, pow_token: 'pow-token' }))
    if (url.includes('/embed/playback')) return respond(overrides.playback ?? JSON.stringify({ playback: encryptedPlayback() }), overrides.playbackStatus ?? 200)
    return respond('', 404)
  })
}

function paradiseHttp(overrides: { search?: string; episodes?: string; detail?: string } = {}) {
  return vi.fn<ProviderHttp>(async (url) => {
    if (url.includes('/search?q=')) return { status: 200, text: overrides.search ?? JSON.stringify({ success: true, data: [{ _id: 'show-1', title: 'One Piece' }] }), url }
    if (url.includes('/anime/show-1/episode')) return { status: 200, text: overrides.episodes ?? JSON.stringify({ success: true, data: [{ uid: 'ep-uid-1', number: '1', origin: 'show-1' }] }), url }
    if (url.includes('/ep/ep-uid-1')) return { status: 200, text: overrides.detail ?? JSON.stringify({ success: true, data: { episode: { streamLink: 'stream-token', subData: [{ src: 'https://stream.animeparadise.moe/captions?url=x', label: 'English', type: 'vtt' }], skipData: { intro: { start: 0, end: 90 }, outro: { start: 1300, end: 1380 } } } } }), url }
    return { status: 404, text: '', url }
  })
}

describe('anime providers', () => {
  it('resolves Anixo sub streams from the embed initial state with subtitles', async () => {
    const html = `<html><script>window.__INITIAL_STREAM__ = {"success":true,"streamUrl":"https://cdn.example/ep1.m3u8","fallbackStreams":["https://cdn.example/ep1-fb.m3u8"],"subtitles":[{"url":"https://cdn.example/en.vtt","label":"English"}]};(async()=>{})</script></html>`
    const client = http({ text: html }, { text: html }, { text: html })
    const result = await createAnixoProvider(client, animeTitle, () => now).resolve(animeSub, new AbortController().signal)
    expect(client.mock.calls[0]?.[0]).toBe('https://anixo.buzz/embed/ani/21/1?track=sub&server=1')
    expect(result).toMatchObject({
      ok: true,
      sources: [
        { key: 'anixo:sora:sub:1', type: 'hls', url: 'https://cdn.example/ep1.m3u8', language: 'original', subtitles: [{ id: 'anixo-sub-0', label: 'English', format: 'vtt' }] },
        { key: 'anixo:fallback:sub:1:1', type: 'hls', url: 'https://cdn.example/ep1-fb.m3u8', language: 'original' },
      ],
    })
  })
  it('requests the Anixo dub track for English audio and rejects non-anime refs', async () => {
    const html = `<html><script>window.__INITIAL_STREAM__ = {"success":true,"streamUrl":"https://cdn.example/ep1-dub.m3u8"};(async()=>{})</script></html>`
    const client = http({ text: html }, { text: html }, { text: html })
    const result = await createAnixoProvider(client, animeTitle, () => now).resolve(animeDub, new AbortController().signal)
    expect(client.mock.calls[0]?.[0]).toContain('track=dub')
    expect(result).toMatchObject({ ok: true, sources: [{ language: 'en' }] })
    expect(await createAnixoProvider(client, animeTitle, () => now).resolve(input, new AbortController().signal)).toMatchObject({ code: 'empty' })
  })
  it('resolves Kyren streams from the JSON API and falls back across servers', async () => {
    const hit = () => ({ text: JSON.stringify({ ok: true, sources: [{ url: 'https://cdn.example/kyren.m3u8', quality: '1080p' }], subtitles: [{ url: 'https://cdn.example/kyren.vtt', label: 'English' }] }) })
    const client = vi.fn<ProviderHttp>(async (url) => {
      if (url.includes('server=neon')) return { status: 200, text: JSON.stringify({ ok: false }), url }
      if (url.includes('server=jett')) return { status: 200, text: hit().text, url }
      if (url.includes('cdn.example/kyren.m3u8')) return { status: 200, text: '#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\nseg0.ts', url }
      if (url.includes('seg0.ts')) return { status: 200, text: 'x'.repeat(2000), url }
      return { status: 404, text: '', url }
    })
    const result = await createKyrenProvider(client, animeTitle, () => now).resolve(animeSub, new AbortController().signal)
    expect(client.mock.calls[0]?.[0]).toContain('/api/stream/21/1?lang=sub')
    expect(client.mock.calls[0]?.[0]).toContain('server=neon')
    expect(result).toMatchObject({ ok: true, sources: [{ key: 'kyren:jett:sub:1:0', type: 'hls', language: 'original' }] })
  })
  it('rejects explicitly original Kyren audio returned for a dub request', async () => {
    const client = vi.fn<ProviderHttp>(async url => ({ status: 200, text: url.includes('/api/stream/')
      ? JSON.stringify({ ok: true, sources: [{ url: 'https://cdn.example/original.m3u8', language: 'original' }] })
      : url.endsWith('.m3u8') ? '#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\nseg0.ts' : 'x'.repeat(2000), url }))
    expect(await createKyrenProvider(client, animeTitle, () => now).resolve(animeDub, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
    expect(client.mock.calls.every(([url]) => url.includes('/api/stream/'))).toBe(true)
  })
  it('skips Kyren hits whose segments do not serve', async () => {
    const master = (seg: string) => `#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\n${seg}`
    const client = vi.fn<ProviderHttp>(async (url) => {
      if (url.includes('server=neon')) return { status: 200, text: JSON.stringify({ ok: true, sources: [{ url: 'https://cdn.example/dead.m3u8', quality: '1080p' }] }), url }
      if (url.includes('server=jett')) return { status: 200, text: JSON.stringify({ ok: true, sources: [{ url: 'https://cdn.example/live.m3u8', quality: '720p' }] }), url }
      if (url.includes('cdn.example/dead.m3u8')) return { status: 200, text: master('dead-seg.ts'), url }
      if (url.includes('cdn.example/live.m3u8')) return { status: 200, text: master('live-seg.ts'), url }
      if (url.includes('dead-seg.ts')) return { status: 403, text: 'Upstream returned 403', url }
      if (url.includes('live-seg.ts')) return { status: 200, text: 'x'.repeat(2000), url }
      return { status: 404, text: '', url }
    })
    const result = await createKyrenProvider(client, animeTitle, () => now).resolve(animeSub, new AbortController().signal)
    const requested = client.mock.calls.map(([url]) => String(url))
    expect(requested.some((url) => url.includes('dead-seg.ts'))).toBe(true)
    expect(result).toMatchObject({ ok: true, sources: [{ key: 'kyren:jett:sub:1:0', type: 'hls', qualityHint: '720p' }] })
  })
  it('returns empty when Kyren has no sources and skips unplayable containers', async () => {
    const client = http({ text: JSON.stringify({ ok: true, sources: [{ url: 'https://cdn.example/ep.mkv', quality: '1080p' }], subtitles: [] }) })
    expect(await createKyrenProvider(client, animeTitle, () => now).resolve(animeSub, new AbortController().signal)).toMatchObject({ code: 'empty' })
  })
  it('scopes Kyren alias rows to one server and answers empty for unknown scopes', async () => {
    const master = '#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\nseg0.ts'
    const client = vi.fn<ProviderHttp>(async (url) => {
      if (url.includes('server=jett')) return { status: 200, text: JSON.stringify({ ok: true, sources: [{ url: 'https://cdn.example/jett.m3u8', quality: '720p' }] }), url }
      if (url.includes('cdn.example/jett.m3u8')) return { status: 200, text: master, url }
      if (url.includes('seg0.ts')) return { status: 200, text: 'x'.repeat(2000), url }
      return { status: 404, text: '', url }
    })
    const result = await createKyrenProvider(client, animeTitle, () => now, { id: 'kyren-jett', servers: ['jett'] }).resolve(animeSub, new AbortController().signal)
    const requested = client.mock.calls.map(([url]) => String(url))
    expect(requested.some((url) => url.includes('server=jett'))).toBe(true)
    expect(requested.some((url) => url.includes('server=viper') || url.includes('server=gekko') || url.includes('server=kayo') || url.includes('server=neon'))).toBe(false)
    expect(result).toMatchObject({ ok: true, sources: [{ key: 'kyren:jett:sub:1:0', type: 'hls' }] })
    const unknown = await createKyrenProvider(client, animeTitle, () => now, { id: 'kyren-nope', servers: ['nope'] }).resolve(animeSub, new AbortController().signal)
    expect(unknown).toMatchObject({ code: 'empty' })
  })
  it('resolves Nagare Stremio streams with dub-first ordering and caches repeats', async () => {
    const body = JSON.stringify({ streams: [
      { url: 'https://cdn.example/sub.m3u8', name: 'SUB 1080p', subtitles: [{ url: 'https://cdn.example/sub.vtt', lang: 'English' }] },
      { url: 'https://cdn.example/dub.m3u8', name: 'DUB 1080p' },
    ] })
    const client = http({ text: body })
    const provider = createNagareProvider(client, () => now)
    const result = await provider.resolve(animeDub, new AbortController().signal)
    expect(client.mock.calls[0]?.[0]).toContain('/stream/anime/anilist:21:1.json')
    expect(result).toMatchObject({ ok: true, sources: [{ key: 'nagare:dub:1:1', language: 'en' }, { key: 'nagare:sub:1:0', language: 'original' }] })
    await provider.resolve(animeDub, new AbortController().signal)
    expect(client).toHaveBeenCalledTimes(1)
  })
  it('resolves 123Anime sub streams through search, info, and embed hops', async () => {
    const search = `<html><body><a href="/anime/one-piece/">One Piece</a></body></html>`
    const client = vi.fn<ProviderHttp>(async (url) => {
      if (url.includes('/search?')) return { status: 200, text: search, url }
      if (url.includes('/ajax/episode/info')) return { status: 200, text: JSON.stringify({ target: 'https://echovideo.ru/embed-3/abc' }), url }
      if (url.includes('/hs/getSources')) return { status: 200, text: JSON.stringify({ sources: 'https://cdn.example/nar.m3u8', intro: { start: 0, end: 80 }, outro: { start: 1300, end: 1380 } }), url }
      if (url.includes('/hs/')) return { status: 200, text: `<html><body data-id="data-1"></body></html>`, url }
      if (url.includes('echovideo.ru/embed')) return { status: 200, text: `<html><script>var zrpart2 = 'key-1';</script></html>`, url }
      return { status: 404, text: '', url }
    })
    const result = await createAnime123Provider(client, animeTitle, () => now).resolve(animeSub, new AbortController().signal)
    expect(client.mock.calls[0]?.[0]).toContain('/search?keyword=')
    expect(result).toMatchObject({ ok: true, sources: [{ key: 'anime123:sub:1:0', type: 'hls', url: 'https://cdn.example/nar.m3u8', language: 'original', skipSegments: [{ kind: 'intro', start: 0, end: 80 }, { kind: 'outro', start: 1300, end: 1380 }] }] })
  })
  it('resolves Zoko streams from the MAL-keyed obfuscated payload', async () => {
    const payload = { src: 'https://cdn.example/zoko.m3u8', subtitles: [{ src: 'https://cdn.example/zoko.vtt', label: 'English' }], skip: { intro: { start: 0, end: 85 }, outro: { start: 1400, end: 1440 }, bogus: { start: 9 } } }
    const text = JSON.stringify(payload)
    const key = 'otaku-embed-v1'
    let raw = ''
    for (let i = 0; i < text.length; i++) raw += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length))
    const blob = Buffer.from(raw, 'binary').toString('base64')
    const client = vi.fn<ProviderHttp>(async (url) => {
      if (url.includes('/stream/mal/1735/1/sub')) return { status: 200, text: `<html><script>window.__P="${blob}"</script></html>`, url }
      return { status: 404, text: '', url }
    })
    const meta = async () => ({ title: 'Naruto Shippuden', malId: 1735 })
    const result = await createZokoProvider(client, meta, () => now).resolve(animeSub, new AbortController().signal)
    expect(result).toMatchObject({ ok: true, sources: [{ key: 'zoko:sub:1:0', type: 'hls', url: 'https://cdn.example/zoko.m3u8', language: 'original', subtitles: [{ id: 'zoko-sub-0', format: 'vtt' }], skipSegments: [{ kind: 'intro', start: 0, end: 85 }, { kind: 'outro', start: 1400, end: 1440 }] }] })
  })
  it('sends the Nagare dub config prefix only for English audio', async () => {
    const subInput = { ...animeSub, ref: { ...animeSub.ref, id: 22 } }
    const dubInput = { ...animeDub, ref: { ...animeDub.ref, id: 22 } }
    const subClient = http({ text: JSON.stringify({ streams: [] }) })
    await createNagareProvider(subClient, () => now).resolve(subInput, new AbortController().signal)
    expect(subClient.mock.calls[0]?.[0]).toBe('https://nagare.nexioapp.org/stream/anime/anilist:22:1.json')
    const dubClient = http({ text: JSON.stringify({ streams: [] }) })
    await createNagareProvider(dubClient, () => now).resolve(dubInput, new AbortController().signal)
    expect(dubClient.mock.calls[0]?.[0]).toContain('/eyJwcmVmZXJEdWIiOnRydWV9/stream/anime/anilist:22:1.json')
  })
  it('resolves AnimeParadise from the JSON chain with captions and skip marks', async () => {
    const client = paradiseHttp()
    const result = await createAnimeParadiseProvider(client, animeTitle, () => now).resolve(animeSub, new AbortController().signal)
    expect(client.mock.calls.map((call) => call[0])).toEqual([
      'https://api.animeparadise.moe/search?q=ONE%20PIECE',
      'https://api.animeparadise.moe/anime/show-1/episode',
      'https://api.animeparadise.moe/ep/ep-uid-1?origin=show-1',
    ])
    expect(result).toMatchObject({
      ok: true,
      sources: [{
        key: 'animeparadise:sub:1',
        type: 'hls',
        url: 'https://stream.animeparadise.moe/m3u8?url=stream-token',
        language: 'original',
        qualityHint: 'auto',
        expiresAt: new Date(now + 300_000).toISOString(),
        subtitles: [{ id: 'animeparadise-sub-0', label: 'English', language: 'English', format: 'vtt' }],
        skipSegments: [{ kind: 'intro', start: 0, end: 90 }, { kind: 'outro', start: 1300, end: 1380 }],
      }],
    })
  })
  it('answers empty for AnimeParadise misses, serves only its sub track, and rejects non-anime refs', async () => {
    const mismatch = paradiseHttp({ search: JSON.stringify({ success: true, data: [{ _id: 'show-9', title: 'Bleach' }] }) })
    expect(await createAnimeParadiseProvider(mismatch, animeTitle, () => now).resolve(animeSub, new AbortController().signal)).toMatchObject({ code: 'empty' })
    expect(mismatch).toHaveBeenCalledTimes(1)
    const wrongEpisode = paradiseHttp({ episodes: JSON.stringify({ success: true, data: [{ uid: 'ep-uid-9', number: '9', origin: 'show-1' }] }) })
    expect(await createAnimeParadiseProvider(wrongEpisode, animeTitle, () => now).resolve(animeSub, new AbortController().signal)).toMatchObject({ code: 'empty' })
    expect(wrongEpisode).toHaveBeenCalledTimes(2)
    const dubClient = paradiseHttp()
    const dubResult = await createAnimeParadiseProvider(dubClient, animeTitle, () => now).resolve(animeDub, new AbortController().signal)
    expect(dubResult).toMatchObject({ ok: false, code: 'empty' })
    expect(dubClient).not.toHaveBeenCalled()
    const movieClient = paradiseHttp()
    expect(await createAnimeParadiseProvider(movieClient, animeTitle, () => now).resolve(input, new AbortController().signal)).toMatchObject({ code: 'empty' })
    expect(movieClient).not.toHaveBeenCalled()
  })
  it('resolves AnimeKai through attestation, native proof-of-work, and the decrypted edge config', async () => {
    const client = kaiHttp()
    const result = await createAnimeKaiProvider(client, animeTitle, () => now).resolve(animeSub, new AbortController().signal)
    expect(client.mock.calls.map((call) => call[0])).toEqual([
      'https://animekai.stream/api/search_live.php?q=ONE%20PIECE',
      'https://animekai.stream/watch/one-piece-81553/ep-1',
      'https://mfw09.org/api/videos/access/challenge',
      'https://mfw09.org/api/videos/access/attest',
      'https://mfw09.org/api/videos/kaisub01/embed/captcha',
      'https://mfw09.org/api/videos/kaisub01/embed/captcha/verify',
      'https://mfw09.org/api/videos/kaisub01/embed/playback',
    ])
    expect(result).toMatchObject({
      ok: true,
      sources: [{
        key: 'animekai:sub:1',
        type: 'hls',
        url: 'https://edge1-frankfurt-sprintcdn.owphbf24.com/hls2/01/1/master.m3u8?t=abc',
        language: 'original',
        qualityHint: '720p',
        expiresAt: '2029-12-31T23:59:00.000Z',
        subtitles: [{ id: 'animekai-sub-0', label: 'English', language: 'English', format: 'vtt' }],
      }],
    })
    const playbackCall = client.mock.calls[6]
    expect(playbackCall?.[1]['x-captcha-token']).toBe('verify-token')
    expect(playbackCall?.[3]?.method).toBe('POST')
    expect(playbackCall?.[3]?.body).toContain('"fingerprint"')
  })
  it('selects the dub server for English audio and rejects episodes without a dub', async () => {
    const dubClient = kaiHttp()
    const dubResult = await createAnimeKaiProvider(dubClient, animeTitle, () => now).resolve(animeDub, new AbortController().signal)
    expect(dubResult).toMatchObject({ ok: true, sources: [{ key: 'animekai:dub:1', language: 'en' }] })
    expect(dubClient.mock.calls[4]?.[0]).toContain('/kaidub01/embed/captcha')
    const subOnly = kaiHttp({ watch: '<html><body><ul class="server-list" data-media="sub"><li data-url="https://mfw09.org/e/kaisub01" data-server="MGCLD" data-media="sub"></li></ul></body></html>' })
    const fallbackResult = await createAnimeKaiProvider(subOnly, animeTitle, () => now).resolve(animeDub, new AbortController().signal)
    expect(fallbackResult).toMatchObject({ ok: false, code: 'empty' })
    expect(subOnly).toHaveBeenCalledTimes(2)
  })
  it('answers empty for AnimeKai search misses, unplayable servers, and stops non-anime refs early', async () => {
    const mismatch = kaiHttp({ search: JSON.stringify({ ok: true, results: [{ slug: 'bleach-1', title: 'Bleach' }] }) })
    expect(await createAnimeKaiProvider(mismatch, animeTitle, () => now).resolve(animeSub, new AbortController().signal)).toMatchObject({ code: 'empty' })
    expect(mismatch).toHaveBeenCalledTimes(1)
    const noServers = kaiHttp({ watch: '<html><body>no servers</body></html>' })
    expect(await createAnimeKaiProvider(noServers, animeTitle, () => now).resolve(animeSub, new AbortController().signal)).toMatchObject({ code: 'empty' })
    const gated = kaiHttp({ watch: '<html><body><ul class="server-list" data-media="sub"><li data-url="https://playmogo.com/e/gated01" data-server="BYFMS" data-media="sub"></li></ul></body></html>' })
    expect(await createAnimeKaiProvider(gated, animeTitle, () => now).resolve(animeSub, new AbortController().signal)).toMatchObject({ code: 'empty' })
    const movieClient = kaiHttp()
    expect(await createAnimeKaiProvider(movieClient, animeTitle, () => now).resolve(input, new AbortController().signal)).toMatchObject({ code: 'empty' })
    expect(movieClient).not.toHaveBeenCalled()
  })
  it('keeps malformed AnimeKai playback payloads and failed decryption structured', async () => {
    const missing = kaiHttp({ playback: JSON.stringify({ playback: {} }) })
    expect(await createAnimeKaiProvider(missing, animeTitle, () => now).resolve(animeSub, new AbortController().signal)).toMatchObject({ code: 'malformed' })
    const garbage = kaiHttp({ playback: JSON.stringify({ playback: { iv: Buffer.alloc(12, 1).toString('base64url'), payload: Buffer.alloc(48, 9).toString('base64url'), key_parts: [Buffer.alloc(32, 5).toString('base64url')] } }) })
    expect(await createAnimeKaiProvider(garbage, animeTitle, () => now).resolve(animeSub, new AbortController().signal)).toMatchObject({ code: 'malformed' })
  })
  it('matches the upstream mfw09 proof-of-work solver', async () => {
    expect(await solvePow('', 0, 1000)).toBe('0')
    expect(await solvePow('consumit-fixture-nonce', 8, 30_000)).toBe('38')
    expect(await solvePow('never-solves', 60, 1)).toBeNull()
  })
  const kitsuFile = Buffer.from('https://cdn.animekitsu.com/frieren-beyond-journeys-end-s2/ep01.mp4').toString('base64url')
  function kitsuHttp(overrides: { search?: string; page?: string; watch?: string; slug?: string } = {}) {
    const slug = overrides.slug ?? 'one-piece'
    return vi.fn<ProviderHttp>(async (url) => {
      if (url.includes('/live-search?q=')) return { status: 200, text: overrides.search ?? JSON.stringify({ data: [{ id: 42, title: 'ONE PIECE', slug: 'one-piece' }] }), url }
      if (url.includes(`/anime/${slug}`)) return { status: 200, text: overrides.page ?? `<html><script>const allEpisodes = [{"id":9,"episode_number":1,"video_url":"https://animekitsu.com/watch/${slug}/1"}];</script></html>`, url }
      if (url.includes(`/watch/${slug}/1`)) return { status: 200, text: overrides.watch ?? `<html><script>const source="/stream.php?file=${kitsuFile}";</script></html>`, url }
      return { status: 404, text: '', url }
    })
  }
  it('resolves AnimeKitsu from search, inline episodes, and the decoded CDN mp4', async () => {
    const client = kitsuHttp()
    const result = await createAnimeKitsuProvider(client, animeTitle, () => now).resolve(animeSub, new AbortController().signal)
    expect(client.mock.calls.map((call) => call[0])).toEqual([
      'https://animekitsu.com/live-search?q=ONE%20PIECE',
      'https://animekitsu.com/anime/one-piece',
      'https://animekitsu.com/watch/one-piece/1',
    ])
    expect(result).toMatchObject({
      ok: true,
      sources: [{
        key: 'animekitsu:sub:1',
        type: 'native',
        url: 'https://cdn.animekitsu.com/frieren-beyond-journeys-end-s2/ep01.mp4',
        language: 'original',
        qualityHint: 'auto',
        headers: {},
        expiresAt: new Date(now + 300_000).toISOString(),
        subtitles: [],
      }],
    })
  })
  it('parses bracketed titles in the inline episode list and follows a relative video_url2', async () => {
    const page = `<html><script>const allEpisodes = [{"id":9,"episode_number":1,"title":"[Rec] Road","video_url2":"/watch/one-piece/1"}];</script></html>`
    const client = kitsuHttp({ page })
    const result = await createAnimeKitsuProvider(client, animeTitle, () => now).resolve(animeSub, new AbortController().signal)
    expect(client.mock.calls.map((call) => call[0])).toEqual([
      'https://animekitsu.com/live-search?q=ONE%20PIECE',
      'https://animekitsu.com/anime/one-piece',
      'https://animekitsu.com/watch/one-piece/1',
    ])
    expect(result).toMatchObject({ ok: true, sources: [{ key: 'animekitsu:sub:1', type: 'native' }] })
  })
  it('searches AnimeKitsu with AniList title aliases when the preferred title misses its partial catalog', async () => {
    const client = kitsuHttp({
      slug: 'jujutsu-kaisen-season-3',
      search: JSON.stringify({ data: [{ title: 'Jujutsu Kaisen Season 3', slug: 'jujutsu-kaisen-season-3' }] }),
    })
    const title = async () => 'JUJUTSU KAISEN Season 3: The Culling Game Part 1'
    const variants = async () => ['Jujutsu Kaisen: Shimetsu Kaiyuu - Zenpen']
    const ref = { ...animeSub, ref: { ...animeSub.ref, id: 172463 } }
    const result = await createAnimeKitsuProvider(client, title, () => now, variants).resolve(ref, new AbortController().signal)
    expect(client.mock.calls.slice(0, 2).map((call) => call[0])).toEqual([
      'https://animekitsu.com/live-search?q=JUJUTSU%20KAISEN',
      'https://animekitsu.com/live-search?q=Jujutsu%20Kaisen%3A%20Shimetsu%20Kaiyuu%20-%20Zenpen',
    ])
    expect(result).toMatchObject({ ok: true, sources: [{ key: 'animekitsu:sub:1', type: 'native' }] })
  })
  it('answers empty for AnimeKitsu misses and stops dub and non-anime refs early', async () => {
    const mismatch = kitsuHttp({ search: JSON.stringify({ data: [{ title: 'Bleach', slug: 'bleach' }] }) })
    expect(await createAnimeKitsuProvider(mismatch, animeTitle, () => now).resolve(animeSub, new AbortController().signal)).toMatchObject({ code: 'empty' })
    expect(mismatch).toHaveBeenCalledTimes(1)
    const noEpisodes = kitsuHttp({ page: '<html><script>const allEpisodes = [];</script></html>' })
    expect(await createAnimeKitsuProvider(noEpisodes, animeTitle, () => now).resolve(animeSub, new AbortController().signal)).toMatchObject({ code: 'empty' })
    expect(noEpisodes).toHaveBeenCalledTimes(2)
    const wrongEpisode = kitsuHttp({ page: '<html><script>const allEpisodes = [{"id":9,"episode_number":9,"video_url":"https://animekitsu.com/watch/one-piece/9"}];</script></html>' })
    expect(await createAnimeKitsuProvider(wrongEpisode, animeTitle, () => now).resolve(animeSub, new AbortController().signal)).toMatchObject({ code: 'empty' })
    expect(wrongEpisode).toHaveBeenCalledTimes(2)
    const gatedWatch = kitsuHttp({ watch: '<html><script>const source="/stream.php?nope";</script></html>' })
    expect(await createAnimeKitsuProvider(gatedWatch, animeTitle, () => now).resolve(animeSub, new AbortController().signal)).toMatchObject({ code: 'empty' })
    expect(gatedWatch).toHaveBeenCalledTimes(3)
    const dubClient = kitsuHttp()
    const dubResult = await createAnimeKitsuProvider(dubClient, animeTitle, () => now).resolve(animeDub, new AbortController().signal)
    expect(dubResult).toMatchObject({ ok: false, code: 'empty' })
    expect(dubClient).not.toHaveBeenCalled()
    const movieClient = kitsuHttp()
    expect(await createAnimeKitsuProvider(movieClient, animeTitle, () => now).resolve(input, new AbortController().signal)).toMatchObject({ code: 'empty' })
    expect(movieClient).not.toHaveBeenCalled()
  })
})

describe('shared manifest verification seam', () => {
  const candidate = (key: string, url: string, type: ProviderSource['type'] = 'hls'): ProviderSource => ({
    key, url, type, language: 'original', expiresAt: '2099-01-01T00:00:00.000Z', headers: {}, subtitles: [],
  })
  const serving = (texts: Record<string, string>) => vi.fn<ProviderHttp>(async (url) => {
    const text = texts[url]
    if (text === undefined) return { status: 404, text: '', url }
    return { status: 200, text, url }
  })
  it('keeps strict-valid manifests, settles redirected URLs, and passes native through', async () => {
    const client = serving({
      'https://cdn.example/master.m3u8': '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000000\nvideo.m3u8',
      'https://cdn.example/media.m3u8': '#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\nseg.ts',
    })
    const verified = await verifiedPlaybackSources(client, [
      candidate('master', 'https://cdn.example/master.m3u8'),
      candidate('media', 'https://cdn.example/media.m3u8'),
      candidate('progressive', 'https://cdn.example/clip.mp4', 'native'),
    ], new AbortController().signal)
    expect(verified.map((source) => source.key)).toEqual(['master', 'media', 'progressive'])
  })
  it('fails closed on error pages, empty playlists, and unsupported manifest features', async () => {
    const client = serving({
      'https://cdn.example/good.m3u8': '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000000\nvideo.m3u8',
      'https://cdn.example/html.m3u8': '<html><body>upstream error</body></html>',
      'https://cdn.example/empty.m3u8': '#EXTM3U\n#EXT-X-VERSION:3\n',
      'https://cdn.example/steered.m3u8': '#EXTM3U\n#EXT-X-CONTENT-STEERING:SERVER-URI="https://steer.example"',
      'https://cdn.example/keyed.m3u8': '#EXTM3U\n#EXT-X-KEY:METHOD=AES-128,URI=key.bin\n#EXTINF:6,\nseg.ts',
    })
    const verified = await verifiedPlaybackSources(client, [
      candidate('good', 'https://cdn.example/good.m3u8'),
      candidate('html', 'https://cdn.example/html.m3u8'),
      candidate('empty', 'https://cdn.example/empty.m3u8'),
      candidate('steered', 'https://cdn.example/steered.m3u8'),
      candidate('keyed', 'https://cdn.example/keyed.m3u8'),
    ], new AbortController().signal)
    expect(verified.map((source) => source.key)).toEqual(['good'])
  })
  it('rejects VixSrc manifests that fail strict validation as malformed', async () => {
    const steered = http(
      { text: '{"src":"/player/title"}' },
      { text: vixPage() },
      { text: '#EXTM3U\n#EXT-X-CONTENT-STEERING:SERVER-URI="https://steer.example"' },
    )
    expect(await createVixsrcProvider(steered, () => now).resolve(input, new AbortController().signal)).toMatchObject({ code: 'malformed' })
  })
})
