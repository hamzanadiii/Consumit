import { createHash } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createAnimeRelayProvider, createBingeBangYMoviesProvider, createStormBoronProvider, createRivestreamProvider, createVidnestProvider, validatedSources, type ProviderHttp, type ProviderRegistration } from '../index.ts'

const now = Date.UTC(2026, 9, 3)
const anime = { ref: { kind: 'anime' as const, id: 21, episode: 7 }, region: 'US', audioLanguage: 'ja' }
const movie = { ref: { kind: 'movie' as const, id: 550 }, region: 'US', audioLanguage: 'en' }
const series = { ...movie, ref: { kind: 'series' as const, id: 1396, season: 3, episode: 4 } }
const signal = () => new AbortController().signal
function client(...responses: unknown[]) {
  return vi.fn<ProviderHttp>(async url => ({ status: 200, url, text: typeof responses[0] === 'string' ? String(responses.shift()) : JSON.stringify(responses.shift()) }))
}
function encrypt(data: unknown, ticket: string) {
  const key = createHash('sha256').update('9e2b7c41a0f6d85b3c1e7a94f25d0b86' + ticket).digest()
  const iv = Buffer.alloc(16, 7), body = Buffer.from(JSON.stringify(data)), output = Buffer.alloc(body.length)
  for (let offset = 0; offset < body.length; offset += 32) {
    const counter = Buffer.alloc(4); counter.writeUInt32BE(offset / 32)
    const stream = createHash('sha256').update(Buffer.concat([key, iv, counter])).digest()
    for (let i = 0; i < Math.min(32, body.length - offset); i++) output[offset + i] = body[offset + i]! ^ stream[i]!
  }
  return { enc: Buffer.concat([iv, output]).toString('base64url') }
}
function page() {
  const text = Buffer.from('window.__BB_PLAYER__={ticket:"test-ticket"};')
  return `<script>k=[7];d=[${[...text].map(byte => byte ^ 7).join(',')}];</script>`
}
function registration(adapter: ProviderRegistration['adapter'], hosts: string[]): ProviderRegistration {
  return { adapter, enabled: true, role: 'video', deliveryMode: 'relay', mediaKinds: ['anime'], mediaHosts: hosts, approvedRegions: ['US'], upstreamGroup: adapter.id, concurrency: 1, requestsPerMinute: 20 }
}

describe('PROVE relay provider routes', () => {
  it('keeps only hd-2 in 9Anime and requests the exact episode/audio once', async () => {
    const http = client({ sources: [{ file: 'https://megap.shiora.top/episode.m3u8' }], intro: { start: 5, end: 90 } })
    const provider = createAnimeRelayProvider(http, '9anime', () => now)
    expect(await provider.resolve({ ...anime, audioLanguage: 'en' }, signal())).toMatchObject({ ok: true, sources: [{ language: 'en', skipSegments: [{ kind: 'intro', start: 5, end: 90 }] }] })
    expect(http).toHaveBeenCalledTimes(1)
    expect(http.mock.calls[0]?.[0]).toBe('https://new.vidnest.fun/hianime/anime/21/7/dub/hd-2')
    expect(http.mock.calls.some(call => call[0].includes('aniwave_hls'))).toBe(false)
  })
  it('keeps AniWave in its own route and refuses another media namespace', async () => {
    const http = client({ sources: [{ url: 'https://ru-ri-cdn3.echovideo.to/a.m3u8' }] })
    const provider = createAnimeRelayProvider(http, 'aniwave', () => now)
    expect(await provider.resolve(anime, signal())).toMatchObject({ ok: true, sources: [{ language: 'original' }] })
    expect(http.mock.calls[0]?.[0]).toBe('https://new.vidnest.fun/aniwave_hls/21/7/sub')
    expect(await provider.resolve(movie, signal())).toMatchObject({ ok: false, code: 'empty' })
    expect(http).toHaveBeenCalledTimes(1)
  })
  it('does not substitute sub for a missing dub and rejects malformed/cancelled responses', async () => {
    const http = client({ sources: [] })
    expect(await createAnimeRelayProvider(http, '9anime').resolve({ ...anime, audioLanguage: 'en' }, signal())).toMatchObject({ code: 'empty' })
    expect(http).toHaveBeenCalledTimes(1)
    expect(await createAnimeRelayProvider(client('<html>'), '9anime').resolve(anime, signal())).toMatchObject({ code: 'malformed' })
    const cancelled = client()
    expect(await createAnimeRelayProvider(cancelled, 'megavid').resolve(anime, AbortSignal.abort())).toMatchObject({ code: 'cancelled' })
    expect(cancelled).not.toHaveBeenCalled()
  })
  it('retains validated Megavid subtitles and fails closed on unapproved media', async () => {
    const http = client({ status: 'ok', source: 'https://cdnx.aniwatchtv.site/a.m3u8', tracks: [{ file: 'https://hls.dramahot.top/en.vtt', label: 'English', srclang: 'en', kind: 'captions' }] })
    const provider = createAnimeRelayProvider(http, 'megavid', () => now)
    const result = await provider.resolve(anime, signal())
    expect(validatedSources(result, registration(provider, ['cdnx.aniwatchtv.site','hls.dramahot.top']), now)).toHaveLength(1)
    expect(validatedSources(result, registration(provider, ['unrelated.example']), now)).toEqual([])
    expect(http.mock.calls[0]?.[0]).toContain('/ani/21/7/sub/source')
  })
  it('selects Boron alone through the exact TV route', async () => {
    const http = client({ lithium: { url: 'https://evil.example/a.m3u8' }, boron: { url: 'https://celestialdreamer.lol/a.m3u8', language: 'English' } })
    expect(await createStormBoronProvider(http, () => now).resolve(series, signal())).toMatchObject({ ok: true, sources: [{ url: 'https://celestialdreamer.lol/a.m3u8', language: 'en' }] })
    expect(http.mock.calls[0]?.[0]).toBe('https://vidstorm.to/api/tv/1396/3/4')
    expect(await createStormBoronProvider(client()).resolve(anime, signal())).toMatchObject({ code: 'empty' })
  })
  it('scopes Zeta and preserves playback hints without using the movie title as an audio language', async () => {
    const http = client({ all_urls: ['https://remoteconsultinggroup.site/a.m3u8'], label: 'Fight Club 1999', headers: { Referer: 'https://nextgencloudfabric.com/', Cookie: 'secret' } }, [])
    expect(await createVidnestProvider(http, () => now, { id: 'zeta', servers: ['zeta'] }).resolve(series, signal())).toMatchObject({ ok: true, sources: [{ language: 'original', headers: { referer: 'https://nextgencloudfabric.com/' } }] })
    expect(http.mock.calls[0]?.[0]).toBe('https://new.vidnest.fun/nextgencloudfabric/tv/1396/3/4')
  })
  it.each(['nebula','zephyr'])('scopes Rive %s and retains required Origin without credentials', async sub => {
    const inner = 'https://nebula.bright67.online/a.m3u8'
    const wrapper = new URL('https://proxy.valhallastream.com/m3u8-proxy')
    wrapper.searchParams.set('url', inner)
    wrapper.searchParams.set('headers', JSON.stringify({ Origin: 'https://cinejoy.pk', Referer: 'https://cinejoy.pk/', Cookie: 'secret' }))
    const http = client({ data: { sources: [{ url: wrapper.href, format: 'hls', quality: '4K HDR' }] } })
    const result = await createRivestreamProvider(http, () => now, { id: `rive${sub}`, subs: [sub], relay: true }).resolve(series, signal())
    expect(result).toMatchObject({ ok: true, sources: [{ url: inner, height: 2160, headers: { origin: 'https://cinejoy.pk', referer: 'https://cinejoy.pk/' } }] })
    expect(result.ok && result.sources[0]?.headers.cookie).toBeUndefined()
    expect(http).toHaveBeenCalledTimes(1)
    expect(http.mock.calls[0]?.[0]).toBe(`https://scrapper.rivestream.app/api/provider?provider=${sub}&id=1396&season=3&episode=4`)
  })
  it('selects only YMovies and overwrites a search result episode with the requested episode', async () => {
    const http = client({ results: [{ title: 'Breaking Bad', year: 2008, play_url: '/tv/play/breaking-bad/1/1' }] }, page(),
      encrypt({ servers: [{ id: 'premium-cinejoy-1', source_url: 'wrong' }, { id: 'premium-ymovies-2', source_url: 'right' }] }, 'test-ticket'),
      encrypt({ ok: true, url: 'https://os.bingebangstream.online/title.m3u8', type: 'hls', quality: '2160p' }, 'test-ticket'))
    expect(await createBingeBangYMoviesProvider(http, async () => ({ title: 'Breaking Bad', year: 2008 }), () => now).resolve(series, signal())).toMatchObject({ ok: true, sources: [{ type: 'hls', height: 2160 }] })
    expect(http.mock.calls[1]?.[0]).toBe('https://bingebang.st/tv/play/breaking-bad/3/4')
    expect(http.mock.calls[3]?.[0]).toBe('https://bingebang.st/api/player/resolve?src=right')
  })
  it('never guesses a mismatching BingeBang title/year or follows an external play page', async () => {
    for (const result of [
      { title: 'Different Title', year: 1999, play_url: '/movie/play/wrong' },
      { title: 'Fight Club', year: 2000, play_url: '/movie/play/wrong' },
      { title: 'Fight Club', year: 1999, play_url: 'https://evil.example/movie/play/wrong' },
    ]) {
      const http = client({ results: [result] })
      expect((await createBingeBangYMoviesProvider(http, async () => ({ title: 'Fight Club', year: 1999 })).resolve(movie, signal())).ok).toBe(false)
      expect(http).toHaveBeenCalledTimes(1)
    }
  })
})
