import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { configuredProviders } from './configured-providers.ts'
import { createPlayback } from './playback.ts'
import { createMemoryPlaybackStore } from './state.ts'
import type { MediaTransport } from './transport.ts'

const configuration = [{ id: 'vixsrc', adapter: 'vixsrc', regions: ['US'], mediaHosts: ['vixsrc.to', '*.vix-content.net'], upstreamGroup: 'vixsrc', proxy: false }]
describe('configured real provider integration', () => {
  it('connects canonical resolution and renews direct access', async () => {
    let token = 0
    const transport = vi.fn<MediaTransport>(async (url) => {
      const path = new URL(url).pathname
      const text = path.startsWith('/api/') ? '{"src":"/page"}' : path === '/page'
        ? `var master = {url: 'https://vixsrc.to/master.m3u8', 'token': '${++token}', 'expires': '${Math.floor(Date.now() / 1000) + 3600}'};`
        : path === '/master.m3u8' ? '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000000\nvideo.m3u8'
        : '#EXTM3U\n#EXT-X-TARGETDURATION:6\nhttps://sc.vix-content.net/segment.ts'
      return { status: 200, url, headers: new Headers({ 'content-type': path.endsWith('m3u8') ? 'application/vnd.apple.mpegurl' : 'text/html' }), body: Readable.from([text]) }
    })
    const store = createMemoryPlaybackStore()
    const playback = createPlayback({ providers: configuredProviders(configuration, { transport }), store, region: 'US' })
    const signal = new AbortController().signal
    const session = await playback.resolve('guest', { ref: { kind: 'series', id: 2, season: 3, episode: 4 }, capabilities: { hls: true, native: true, dash: false, nativeHls: true }, audioLanguage: 'en' }, signal)
    expect(session.source.providerId).toBe('vixsrc')
    expect(session.source.src).toContain('https://vixsrc.to/master.m3u8')
    expect(session.source.src).toContain('token=1')
    const renewed = await playback.recover('guest', session.id, { sourceId: session.source.id, reason: 'expired' }, true, signal)
    expect(renewed.source.id).toBe(session.source.id)
    expect(renewed.source.src).not.toBe(session.source.src)
    expect(token).toBe(2)
    expect(renewed.source.src).toContain('token=2')
    expect(transport.mock.calls[0]?.[0]).toBe('https://vixsrc.to/api/tv/2/3/4')
  })
  it('keeps disabled adapters inactive and rejects duplicate identities', () => {
    expect(configuredProviders([{ ...configuration[0], enabled: false }])).toEqual([])
    expect(() => configuredProviders([...configuration, ...configuration])).toThrow('Duplicate')
    expect(() => configuredProviders([{ ...configuration[0], id: 'other', adapter: 'other' }])).toThrow()
  })
  it('wires one unified WeCollege provider covering every city with best-first ranking', async () => {
    const [registration] = configuredProviders(
      [{ id: 'wecollege', adapter: 'wecollege', regions: ['US'], mediaHosts: ['media.example'], upstreamGroup: 'wecollege' }],
      { tmdbToken: 'token' },
    )
    expect(registration!.adapter.id).toBe('wecollege')
    expect(registration!.upstreamGroup).toBe('wecollege')
    expect(() => configuredProviders(
      [{ id: 'wecollege-miami', adapter: 'wecollege-miami' as never, regions: ['US'], mediaHosts: ['media.example'], upstreamGroup: 'wecollege-miami' }],
      { tmdbToken: 'token' },
    )).toThrow()
  })
  it('supports alias rows that scope one adapter by city or audio', async () => {
    const [phoenix] = configuredProviders(
      [{ id: 'wecollege-phoenix', adapter: 'wecollege', regions: ['US'], mediaHosts: ['media.example'], upstreamGroup: 'wecollege-phoenix' }],
      { tmdbToken: 'token' },
    )
    expect(phoenix!.adapter.id).toBe('wecollege-phoenix')
    expect(phoenix!.upstreamGroup).toBe('wecollege-phoenix')
    const [hindi] = configuredProviders(
      [{ id: 'cinehd-hindi', adapter: 'cinehd', regions: ['IN', 'US'], mediaHosts: ['media.example'], upstreamGroup: 'cinehd-hindi' }],
      { tmdbToken: 'token' },
    )
    expect(hindi!.adapter.id).toBe('cinehd-hindi')
    expect(() => configuredProviders(
      [{ id: 'unrelated', adapter: 'wecollege', regions: ['US'], mediaHosts: ['media.example'], upstreamGroup: 'unrelated' }],
      { tmdbToken: 'token' },
    )).toThrow('must match its adapter')
  })
  it('compiles flux host patterns and rejects invalid regex', () => {
    const [registration] = configuredProviders(
      [{ id: 'vixsrc', adapter: 'vixsrc', regions: ['US'], mediaHosts: ['vixsrc.to'], mediaHostPatterns: ['^srv[0-9]+\\.[a-z]+\\.site$'], upstreamGroup: 'vixsrc' }],
    )
    expect(registration!.mediaHostPatterns).toHaveLength(1)
    expect(registration!.mediaHostPatterns![0]).toBeInstanceOf(RegExp)
    expect(() => configuredProviders(
      [{ id: 'vixsrc', adapter: 'vixsrc', regions: ['US'], mediaHosts: ['vixsrc.to'], mediaHostPatterns: ['([invalid'], upstreamGroup: 'vixsrc' }],
    )).toThrow('Invalid media host pattern')
  })
  it('wires VAPlayer through trusted TMDB identity and caps the pilot at three active providers', async () => {
    const transport = vi.fn<MediaTransport>(async (url) => ({
      status: 200, url, headers: new Headers(), body: Readable.from([url.includes('themoviedb')
        ? '{"imdb_id":"tt1234567"}'
        : url.includes('master.m3u8')
          ? '#EXTM3U\n#EXT-X-TARGETDURATION:6\nsegment-0.ts'
          : '{"status_code":200,"data":{"stream_urls":["https://media.example/master.m3u8"]}}']),
    }))
    const [registration] = configuredProviders([{ id: 'vaplayer', adapter: 'vaplayer', regions: ['US'], mediaHosts: ['media.example'], upstreamGroup: 'vaplayer' }], { tmdbToken: 'token', transport })
    const result = await registration!.adapter.resolve({ ref: { kind: 'series', id: 2, season: 3, episode: 4 }, region: 'US', audioLanguage: 'en' }, new AbortController().signal)
    expect(result).toMatchObject({ ok: true, sources: [{ headers: { referer: 'https://nextgencloudfabric.com/' } }] })
    expect(transport.mock.calls.map(([url]) => url)).toEqual([
      'https://api.themoviedb.org/3/tv/2/external_ids',
      'https://streamdata.vaplayer.ru/api.php?imdb=tt1234567&type=tv&season=3&episode=4',
      'https://media.example/master.m3u8',
    ])
    const active = Array.from({ length: 4 }, (_, index) => ({ id: `owned-${index}`, adapter: 'static' as const, regions: ['US'], mediaHosts: ['media.example'], entries: [] }))
    expect(configuredProviders(active)).toHaveLength(4)
    const [pinned] = configuredProviders([{ id: 'vixsrc', adapter: 'vixsrc', regions: ['US'], mediaHosts: ['vixsrc.to'], upstreamGroup: 'vixsrc', priority: 100 }])
    expect(pinned!.adapter.id).toBe('vixsrc')
    const [patient] = configuredProviders([{ id: 'vixsrc', adapter: 'vixsrc', regions: ['US'], mediaHosts: ['vixsrc.to'], upstreamGroup: 'vixsrc', attemptMs: 8000 }])
    expect(patient!.attemptMs).toBe(8000)
    expect(pinned).not.toHaveProperty('attemptMs')
    expect(() => configuredProviders([{ id: 'vixsrc', adapter: 'vixsrc', regions: ['US'], mediaHosts: ['vixsrc.to'], upstreamGroup: 'vixsrc', attemptMs: 500 }])).toThrow()
    expect(() => configuredProviders([{ id: 'vixsrc', adapter: 'vixsrc', regions: ['US'], mediaHosts: ['vixsrc.to'], upstreamGroup: 'vixsrc', mediaHostPatterns: ['([invalid'] }])).toThrow('Invalid media host pattern')
    expect(configuredProviders([{ id: 'vixsrc', adapter: 'vixsrc', regions: ['US'], mediaHosts: ['vixsrc.to'], upstreamGroup: 'vixsrc' }])[0]).not.toHaveProperty('priority')
  })
})
