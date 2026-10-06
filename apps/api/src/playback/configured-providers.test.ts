import { Readable } from 'node:stream'
import { readFile } from 'node:fs/promises'
import { describe, expect, it, vi } from 'vitest'
import { configuredProviders } from './configured-providers.ts'
import { createPlayback } from './playback.ts'
import { createMemoryPlaybackStore } from './state.ts'
import type { MediaTransport } from './transport.ts'
import { allowedMediaUrl } from '@consumit/provider-sdk'

const configuration = [{ id: 'vixsrc', adapter: 'vixsrc', regions: ['US'], mediaHosts: ['vixsrc.to', '*.vix-content.net'], upstreamGroup: 'vixsrc' }]

describe('configured real provider integration', () => {
  it('keeps LookMovie fixed resolutions in one server and switches through its approved current CDN', async () => {
    const rows: { id: string; enabled: boolean }[] = JSON.parse(await readFile(new URL('../../../../infra/playback/providers.example.json', import.meta.url), 'utf8'))
    const row = rows.find(row => row.id === 'lookmovie')!
    const transport = vi.fn<MediaTransport>(async url => {
      const payload = new URL(url).hostname === 'api.themoviedb.org'
        ? { title: 'Fight Club', release_date: '1999-10-15' }
        : new URL(url).pathname.endsWith('/view')
          ? { streams: Object.fromEntries([1080, 720, 480].map(height => [`${height}p`, `https://srv315.excentionses.cyou/movie/${height}.m3u8`])) }
          : { items: [{ id_movie: 'fight-club', title: 'Fight Club', year: 1999 }] }
      return { status: 200, url, headers: new Headers(), body: Readable.from([JSON.stringify(payload)]) }
    })
    const [provider] = configuredProviders([{ ...row, enabled: true }], { transport, tmdbToken: 'fixture-token' })
    expect(allowedMediaUrl('https://srv315.excentionses.cyou/movie/1080.m3u8', provider!.mediaHosts, provider!.mediaHostPatterns)).toBe(true)
    expect(allowedMediaUrl('https://srv315.tormisted.cyou/movie/720.m3u8', provider!.mediaHosts, provider!.mediaHostPatterns)).toBe(true)
    for (const host of ['excentionses.cyou', 'evil.excentionses.cyou', 'srv315.excentionses.cyou.evil.example', 'srv315.unrelated.cyou']) {
      expect(allowedMediaUrl(`https://${host}/movie.m3u8`, provider!.mediaHosts, provider!.mediaHostPatterns)).toBe(false)
    }
    const playback = createPlayback({ providers: [provider!], store: createMemoryPlaybackStore(), region: 'US' })
    const input = { ref: { kind: 'movie' as const, id: 550 }, audioLanguage: 'en', capabilities: { hls: true, native: true, dash: true, nativeHls: false } }
    const signal = new AbortController().signal
    expect((await playback.listProviders(input, signal)).map(p => p.id)).toEqual(['lookmovie'])
    const session = await playback.resolve('guest', input, signal)
    expect(session.source).toMatchObject({ providerId: 'lookmovie', delivery: 'direct', qualityHint: '1080p', qualityHeights: [1080, 720, 480] })
    expect(session.source).not.toHaveProperty('qualitySources')
    for (const height of [720, 480, 1080]) {
      const switched = await playback.switchProvider('guest', session.id, 'lookmovie', signal, { qualityHeight: height })
      expect(switched.source).toMatchObject({ providerId: 'lookmovie', qualityHint: `${height}p`, qualityHeights: [1080, 720, 480] })
      expect(switched.id).toBe(session.id)
      expect(switched.source.src).toContain(`/${height}.m3u8`)
    }
  })
  it('registers the requested PROVE relay roster with independent anime, movie and TV namespaces', async () => {
    const raw: unknown = JSON.parse(await readFile(new URL('../../../../infra/playback/providers.example.json', import.meta.url), 'utf8'))
    const providers = configuredProviders(raw, { tmdbToken: 'fixture-token', animeTitleResolver: async () => 'One Piece', animeTitleVariantsResolver: async () => ['One Piece'], animeMetaResolver: async () => ({ title: 'One Piece', malId: 21 }) })
    const animeIds = ['megavid', '9anime', 'anixo', 'zoko', 'aniwave']
    const movieIds = ['bingebangymovies', 'stormboron', 'zeta', 'rivenebula', 'rivezephyr', 'wecollege-miami', 'wecollege-boise']
    for (const id of [...animeIds, ...movieIds]) {
      const provider = providers.find(row => row.adapter.id === id)
      expect(provider).toMatchObject({ enabled: false, role: 'video', deliveryMode: 'relay', mediaKinds: animeIds.includes(id) ? ['anime'] : ['movie', 'series'] })
    }
    expect(providers.find(row => row.adapter.id === 'vixsrc')?.deliveryMode).toBe('direct')
    expect(providers.find(row => row.adapter.id === '9anime')?.mediaHosts).not.toContain('ru-ri-cdn3.echovideo.to')
    expect(providers.find(row => row.adapter.id === 'zoko')?.mediaHosts).toContain('hls1.drama1.cfd')
  })
  it('registers Evion for TV video and keeps Apogee audio out of video attempts', async () => {
    const evion = { id: 'evion', adapter: 'evion', regions: ['US'], mediaHosts: ['img.animecurx.tech'], upstreamGroup: 'riveapogee', mediaKinds: ['series'], role: 'video' }
    const apogee = { ...evion, id: 'riveapogee', adapter: 'riveapogee', mediaKinds: ['movie', 'series'], role: 'audio' }
    const transport = vi.fn<MediaTransport>(async url => ({ status: 200, url, headers: new Headers(), body: Readable.from(['{}']) }))
    const providers = configuredProviders([evion, apogee], { transport })
    expect(providers.map(p => ({ id: p.adapter.id, role: p.role, kinds: p.mediaKinds }))).toEqual([{ id: 'evion', role: 'video', kinds: ['series'] }, { id: 'riveapogee', role: 'audio', kinds: ['movie', 'series'] }])
    const playback = createPlayback({ providers, store: createMemoryPlaybackStore(), region: 'US' })
    const input = { ref: { kind: 'movie' as const, id: 550 }, audioLanguage: 'en', capabilities: { hls: true, native: true, dash: true, nativeHls: false } }
    expect(await playback.listProviders(input, new AbortController().signal)).toEqual([])
    expect((await playback.listProviders({ ...input, ref: { kind: 'series', id: 1399, season: 1, episode: 1 } }, new AbortController().signal)).map(p => p.id)).toEqual(['evion'])
    expect(await providers[0]!.adapter.resolve({ ...input, region: 'US' }, new AbortController().signal)).toMatchObject({ ok: false })
    expect(transport).not.toHaveBeenCalled()
    expect(() => configuredProviders([{ ...evion, mediaKinds: ['movie', 'series'] }])).toThrow('series-only')
  })
  it('allows Apogee movie and TV video plus separate audio through the Both role', async () => {
    const row = { id: 'riveapogee', adapter: 'riveapogee', regions: ['US'], mediaHosts: ['img.animecurx.tech'], upstreamGroup: 'riveapogee', mediaKinds: ['movie', 'series'] }
    const transport = vi.fn<MediaTransport>(async url => ({ status: 200, url, headers: new Headers(), body: Readable.from([JSON.stringify({ data: { sources: [{ url: 'https://img.animecurx.tech/master.m3u8', format: 'hls' }] } })]) }))
    const [video] = configuredProviders([{ ...row, role: 'both' }], { transport })
    expect(video?.mediaKinds).toEqual(['movie', 'series'])
    expect(video?.role).toBe('both')
    expect(video?.adapter.separateAudio).toEqual({ label: 'Apogee' })
    const input = { ref: { kind: 'movie' as const, id: 550 }, region: 'US', audioLanguage: 'en' }
    expect(await video!.adapter.resolve(input, new AbortController().signal)).toMatchObject({ ok: true })
    expect(transport.mock.calls[0]?.[0]).toBe('https://scrapper.rivestream.app/api/provider?provider=apogee&id=550')
    const playback = createPlayback({ providers: [video!], store: createMemoryPlaybackStore(), region: 'US' })
    expect((await playback.listProviders({ ...input, capabilities: { hls: true, native: true, dash: true, nativeHls: false } }, new AbortController().signal)).map(p => p.id)).toEqual(['riveapogee'])
  })
  it('defaults to video and validates all configured roles', () => {
    expect(configuredProviders(configuration)[0]?.role).toBe('video')
    expect(configuredProviders([{ ...configuration[0], role: 'audio' }])[0]?.role).toBe('audio')
    expect(configuredProviders([{ ...configuration[0], role: 'both' }])[0]?.role).toBe('both')
    expect(() => configuredProviders([{ ...configuration[0], role: 'verified' }])).toThrow()
  })
  it('registers Recloud as AniList-native anime SUB/DUB without a title resolver', () => {
    const row = { id: 'recloud', adapter: 'recloud', regions: ['US'], mediaHosts: ['cdn.4animo.xyz'], upstreamGroup: 'recloud', mediaKinds: ['anime'] }
    const [provider] = configuredProviders([row])
    expect(provider?.adapter.id).toBe('recloud')
    expect(provider?.mediaKinds).toEqual(['anime'])
    expect(provider?.adapter.audioLanguages).toEqual(['ja', 'en'])
    expect(() => configuredProviders([{ ...row, mediaKinds: ['anime', 'movie'] }])).toThrow('anime-only')
    expect(() => configuredProviders([{ ...row, id: 'recloud-unknown' }])).toThrow('anime-only')
  })
  it('registers CineJoy for both kinds and Apogee for exact series episodes', async () => {
    const transport = vi.fn<MediaTransport>(async url => ({ status: 200, url, headers: new Headers(), body: Readable.from([JSON.stringify({ data: { sources: [{ url: 'https://img.animecurx.tech/series/master.m3u8', format: 'hls' }] } })]) }))
    const registrations = configuredProviders([
      { id: 'cinejoylisbon', adapter: 'cinejoylisbon', regions: ['US'], mediaHosts: ['api.wing.st', '*.cheaptruckrepairs.cc'], upstreamGroup: 'cinejoylisbon', mediaKinds: ['movie', 'series'] },
      { id: 'riveapogee', adapter: 'riveapogee', regions: ['US'], mediaHosts: ['img.rousav.tech', 'img.animecurx.tech'], upstreamGroup: 'riveapogee', mediaKinds: ['movie', 'series'] },
    ], { tmdbToken: 'fixture-token', transport })
    expect(registrations.map(provider => ({ id: provider.adapter.id, kinds: provider.mediaKinds }))).toEqual([
      { id: 'cinejoylisbon', kinds: ['movie', 'series'] }, { id: 'riveapogee', kinds: ['movie', 'series'] },
    ])
    expect(await registrations[1]!.adapter.resolve({ ref: { kind: 'series', id: 1399, season: 3, episode: 4 }, region: 'US', audioLanguage: 'en' }, new AbortController().signal)).toMatchObject({ ok: true, sources: [{ url: 'https://img.animecurx.tech/series/master.m3u8', type: 'hls' }] })
    expect(transport.mock.calls[0]?.[0]).toBe('https://scrapper.rivestream.app/api/provider?provider=apogee&id=1399&season=3&episode=4')
  })
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
  it('defaults to direct playback and rejects removed delivery settings', () => {
    const config = { id: 'vixsrc', adapter: 'vixsrc', regions: ['US'], mediaHosts: ['vixsrc.to'], upstreamGroup: 'vixsrc' }
    const [direct] = configuredProviders([config])
    expect(direct).not.toHaveProperty('proxy')
    expect(() => configuredProviders([{ ...config, proxy: true }])).toThrow()
    expect(() => configuredProviders([{ ...config, deliveryMode: 'proxy-required' }])).toThrow()
  })
  it('keeps configured and runtime IDs identical for Anixo', () => {
    const [provider] = configuredProviders([{ id: 'anixo', adapter: 'anixo', regions: ['US'], mediaHosts: ['media.example'], upstreamGroup: 'anixo', mediaKinds: ['anime'] }], { animeTitleResolver: async () => 'One Piece' })
    expect(provider!.adapter.id).toBe('anixo')
  })
  it('registers disabled adapters for Admin while leaving them ineligible for playback', () => {
    const [disabled] = configuredProviders([{ ...configuration[0], enabled: false }])
    expect(disabled?.adapter.id).toBe('vixsrc')
    expect(disabled?.enabled).toBe(false)
    expect(() => configuredProviders([...configuration, ...configuration])).toThrow('Duplicate')
    expect(() => configuredProviders([{ ...configuration[0], id: 'other', adapter: 'other' }])).toThrow()
  })
  it('makes an enabled configured adapter eligible without a review record', () => {
    expect(configuredProviders(configuration)).toMatchObject([{ enabled: true, adapter: { id: 'vixsrc' } }])
  })
  it('validates provider-specific probe fixtures against configured media kinds', () => {
    const probe = { ref: { kind: 'anime' as const, id: 172463, episode: 1 } }
    const [registration] = configuredProviders([{
      id: 'animekitsu', adapter: 'animekitsu', regions: ['US'], mediaHosts: ['cdn.animekitsu.com'],
      mediaKinds: ['anime'], upstreamGroup: 'animekitsu', probes: { anime: probe },
    }], { animeTitleResolver: async () => 'Jujutsu Kaisen' })
    expect(registration!.probes?.anime).toEqual({ ...probe, audioLanguage: 'ja' })
    expect(() => configuredProviders([{
      id: 'animekitsu', adapter: 'animekitsu', regions: ['US'], mediaHosts: ['cdn.animekitsu.com'],
      mediaKinds: ['anime'], upstreamGroup: 'animekitsu', probes: { anime: { ref: { kind: 'anime' as const, id: 172463, episode: 1 }, audioLanguage: 'en' } },
    }], { animeTitleResolver: async () => 'Jujutsu Kaisen' })).not.toThrow()
    expect(() => configuredProviders([{
      id: 'animekitsu', adapter: 'animekitsu', regions: ['US'], mediaHosts: ['cdn.animekitsu.com'],
      mediaKinds: ['anime'], upstreamGroup: 'animekitsu', probes: { anime: { ref: { kind: 'movie' as const, id: 550 }, audioLanguage: 'ja' } },
    }], { animeTitleResolver: async () => 'Jujutsu Kaisen' })).toThrow('probe must match')
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
  it('scopes kyren alias rows to one server each', () => {
    const registrations = configuredProviders(
      [
        { id: 'kyren', adapter: 'kyren', regions: ['US'], mediaHosts: ['kyren.moe'], mediaKinds: ['anime'], upstreamGroup: 'kyren' },
        { id: 'kyren-jett', adapter: 'kyren', regions: ['US'], mediaHosts: ['kyren.moe'], mediaKinds: ['anime'], upstreamGroup: 'kyren-jett' },
        { id: 'kyren-neon', adapter: 'kyren', regions: ['US'], mediaHosts: ['kyren.moe'], mediaKinds: ['anime'], upstreamGroup: 'kyren-neon' },
      ],
      { animeTitleResolver: async () => 'ONE PIECE' },
    )
    expect(registrations.map((registration) => registration.adapter.id)).toEqual(['kyren', 'kyren-jett', 'kyren-neon'])
    expect(registrations.map((registration) => registration.upstreamGroup)).toEqual(['kyren', 'kyren-jett', 'kyren-neon'])
  })
  it('wires PROVE server rows for filmuainary, stignebula, stigorion, and castletv', () => {
    const registrations = configuredProviders(
      [
        { id: 'filmuainary', adapter: 'filmuainary', regions: ['US'], mediaHosts: ['srv327.oximmobiturn.site'], mediaHostPatterns: ['^srv[0-9]+\\.oximmobiturn\\.site$'], upstreamGroup: 'filmuainary' },
        { id: 'vidzen', adapter: 'vidzen', regions: ['US'], mediaHosts: ['vidzen.fun'], upstreamGroup: 'vidzen' },
        { id: 'stignebula', adapter: 'stignebula', regions: ['US'], mediaHosts: ['proxy.stigstream.ru'], upstreamGroup: 'stignebula' },
        { id: 'stigorion', adapter: 'stigorion', regions: ['US'], mediaHosts: ['one.82b6b2a6748f1e.click'], mediaHostPatterns: ['^one\\.[a-z0-9]+\\.click$'], upstreamGroup: 'stigorion' },
        { id: 'castletv', adapter: 'castletv', regions: ['US'], mediaHosts: ['img1.bwcly.com'], upstreamGroup: 'castletv' },
      ],
      { tmdbToken: 'token' },
    )
    expect(registrations.map((registration) => registration.adapter.id)).toEqual(['filmuainary', 'vidzen', 'stignebula', 'stigorion', 'castletv'])
    expect(registrations.map((registration) => registration.upstreamGroup)).toEqual(['filmuainary', 'vidzen', 'stignebula', 'stigorion', 'castletv'])
  })
  it('compiles flux host patterns and rejects invalid regex', () => {
    const [registration] = configuredProviders(
      [{ id: 'vixsrc', adapter: 'vixsrc', regions: ['US'], mediaHosts: ['vixsrc.to'], mediaHostPatterns: ['^srv[0-9]+\\.media\\.example\\.site$'], upstreamGroup: 'vixsrc' }],
    )
    expect(registration!.mediaHostPatterns).toHaveLength(1)
    expect(registration!.mediaHostPatterns![0]).toBeInstanceOf(RegExp)
    expect(() => configuredProviders(
      [{ id: 'vixsrc', adapter: 'vixsrc', regions: ['US'], mediaHosts: ['vixsrc.to'], mediaHostPatterns: ['([invalid'], upstreamGroup: 'vixsrc' }],
    )).toThrow('Invalid media host pattern')
  })
  it('rejects wildcard allowlists for shared hosting tenants', () => {
    expect(() => configuredProviders([
      { id: 'vixsrc', adapter: 'vixsrc', regions: ['US'], mediaHosts: ['*.workers.dev'], upstreamGroup: 'vixsrc' },
    ])).toThrow('shared hosting domain')
    expect(() => configuredProviders([
      { id: 'vixsrc', adapter: 'vixsrc', regions: ['US'], mediaHosts: ['vixsrc.to'], mediaHostPatterns: ['^.+\\.workers\\.dev$'], upstreamGroup: 'vixsrc' },
    ])).toThrow('shared hosting domains')
    expect(() => configuredProviders([
      { id: 'vixsrc', adapter: 'vixsrc', regions: ['US'], mediaHosts: ['vixsrc.to'], mediaHostPatterns: ['^[a-z]+\\.site$'], upstreamGroup: 'vixsrc' },
    ])).toThrow('provider-owned hostname')
    expect(configuredProviders([
      { id: 'vixsrc', adapter: 'vixsrc', regions: ['US'], mediaHosts: ['tenant.workers.dev'], upstreamGroup: 'vixsrc' },
    ])).toHaveLength(1)
    expect(configuredProviders([
      { id: 'animekai', adapter: 'animekai', regions: ['US'], mediaHosts: ['edge1-frankfurt-sprintcdn.owphbf24.com'], mediaHostPatterns: ['^edge[0-9]+-[a-z0-9-]+-sprintcdn\\.[a-z0-9]+\\.[a-z0-9]+$'], mediaKinds: ['anime'], upstreamGroup: 'animekai' },
    ], { animeTitleResolver: async () => 'One Piece' })).toHaveLength(1)
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
  it('requires an anime title resolver and anime media kinds for AnimeParadise, AnimeKai, and AnimeKitsu rows', () => {
    const animeTitleResolver = async () => 'One Piece'
    const paradise = { id: 'animeparadise', adapter: 'animeparadise', regions: ['US'], mediaHosts: ['stream.animeparadise.moe'], mediaKinds: ['anime'], upstreamGroup: 'animeparadise' }
    const kai = { id: 'animekai', adapter: 'animekai', regions: ['US'], mediaHosts: ['edge.example'], mediaKinds: ['anime'], upstreamGroup: 'animekai' }
    const kitsu = { id: 'animekitsu', adapter: 'animekitsu', regions: ['US'], mediaHosts: ['cdn.animekitsu.com'], mediaKinds: ['anime'], upstreamGroup: 'animekitsu' }
    expect(() => configuredProviders([paradise])).toThrow('anime title resolver')
    expect(() => configuredProviders([kai])).toThrow('anime title resolver')
    expect(() => configuredProviders([kitsu])).toThrow('anime title resolver')
    expect(() => configuredProviders([{ ...paradise, mediaKinds: ['movie'] }], { animeTitleResolver })).toThrow('must include "anime"')
    expect(() => configuredProviders([{ ...kitsu, mediaKinds: ['movie'] }], { animeTitleResolver })).toThrow('must include "anime"')
    const [paradiseRegistration] = configuredProviders([paradise], { animeTitleResolver })
    expect(paradiseRegistration!.adapter.id).toBe('animeparadise')
    expect(paradiseRegistration!.mediaKinds).toEqual(['anime'])
    expect(paradiseRegistration!.mediaHostPatterns).toEqual([])
    const [kaiRegistration] = configuredProviders([{ ...kai, mediaHostPatterns: ['^edge[0-9]+-[a-z0-9-]+-sprintcdn\\.[a-z0-9]+\\.[a-z0-9]+$'] }], { animeTitleResolver })
    expect(kaiRegistration!.mediaHostPatterns![0]!.test('edge1-frankfurt-sprintcdn.owphbf24.com')).toBe(true)
    expect(kaiRegistration!.mediaHostPatterns![0]!.test('sprintcdn.owphbf24.com')).toBe(false)
    const [kitsuRegistration] = configuredProviders([kitsu], { animeTitleResolver })
    expect(kitsuRegistration!.adapter.id).toBe('animekitsu')
    expect(kitsuRegistration!.mediaKinds).toEqual(['anime'])
  })
})
