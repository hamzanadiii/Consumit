import { describe, expect, it, vi } from 'vitest'
import { createFmfauProvider } from './fmfau.ts'
import type { ProviderHttp } from './http.ts'

const now = () => Date.parse('2026-10-17T00:00:00Z')
const movie = { ref: { kind: 'movie' as const, id: 27205 }, region: 'US', audioLanguage: 'en' }
const series = { ref: { kind: 'series' as const, id: 1396, season: 1, episode: 3 }, region: 'US', audioLanguage: 'en' }
const streamUrl = 'https://hahaevilcraft.site/proxy?u=aHR0cHM&h=eyJy'
const master = ['#EXTM3U', '#EXT-X-TARGETDURATION:10', '#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080', 'v_1080.m3u8'].join('\n')

type Options = { status?: number; body?: unknown; streams?: unknown[]; master?: string }
function fixture(options: Options = {}) {
  return vi.fn<ProviderHttp>(async url => {
    if (url.startsWith('https://fmfau.com/api/sources/moovie')) {
      const status = options.status ?? 200
      const text = status >= 400
        ? JSON.stringify({ error: 'upstream failure' })
        : JSON.stringify(options.body ?? { ok: true, provider: 'moovie', streams: options.streams ?? [
          { url: streamUrl, quality: 1080, type: 'hls', name: 'Moovie vaplayer' },
        ] })
      return { url, text, status, headers: new Headers() }
    }
    if (url.startsWith('https://hahaevilcraft.site/proxy')) {
      return { url, text: options.master ?? master, status: 200, headers: new Headers({ 'content-type': 'application/vnd.apple.mpegurl', 'access-control-allow-origin': '*' }) }
    }
    return { url, text: '', status: 404, headers: new Headers() }
  })
}

describe('Fmfau adapter', () => {
  it('resolves a movie through the ungated moovie API and verifies the proxy master', async () => {
    const http = fixture()
    expect(await createFmfauProvider(http, now).resolve(movie, new AbortController().signal)).toMatchObject({
      ok: true,
      sources: [{
        key: 'fmfau:0', url: streamUrl, type: 'hls', height: 1080, qualityHint: '1080p',
        headers: {}, subtitles: [],
      }],
    })
    const apiUrl = String(http.mock.calls[0]?.[0])
    expect(apiUrl).toContain('https://fmfau.com/api/sources/moovie?')
    expect(apiUrl).toContain('tmdbId=27205')
    expect(apiUrl).toContain('mediaType=movie')
    expect(apiUrl).toContain('sub=vaplayer')
  })
  it('resolves TV with the show media type and season/episode params', async () => {
    const http = fixture()
    await createFmfauProvider(http, now).resolve(series, new AbortController().signal)
    const apiUrl = String(http.mock.calls[0]?.[0])
    expect(apiUrl).toContain('mediaType=show')
    expect(apiUrl).toContain('season=1')
    expect(apiUrl).toContain('episode=3')
  })
  it('keeps multiple distinct streams and dedupes repeats', async () => {
    const http = fixture({
      streams: [
        { url: streamUrl, quality: 1080, type: 'hls' },
        { url: streamUrl, quality: 720, type: 'hls' },
        { url: 'https://hahaevilcraft.site/proxy?u=ZGFzaA&h=e', quality: 720, type: 'dash' },
      ],
    })
    expect(await createFmfauProvider(http, now).resolve(movie, new AbortController().signal)).toMatchObject({
      ok: true,
      sources: [{ key: 'fmfau:0' }, { key: 'fmfau:2', type: 'dash' }],
    })
  })
  it('maps an empty stream list to a non-retryable empty result', async () => {
    const http = fixture({ streams: [] })
    expect(await createFmfauProvider(http, now).resolve(movie, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty', retryable: false })
  })
  it.each([
    { label: 'a foreign host', url: 'https://evil.example/proxy?u=x', code: 'malformed', calls: 1 },
    { label: 'an insecure scheme', url: 'http://hahaevilcraft.site/proxy?u=x', code: 'malformed', calls: 1 },
    { label: 'a dead wrapped path', url: 'https://hahaevilcraft.site/relay/proxy?u=x', code: 'empty', calls: 2 },
  ])('drops sources on $label', async ({ url, code, calls }) => {
    const http = fixture({ streams: [{ url, quality: 1080, type: 'hls' }] })
    expect(await createFmfauProvider(http, now).resolve(movie, new AbortController().signal)).toMatchObject({ ok: false, code })
    expect(http.mock.calls).toHaveLength(calls)
  })
  it('fails closed when the proxy root is not a playable manifest', async () => {
    const http = fixture({ master: '<html>gone</html>' })
    expect(await createFmfauProvider(http, now).resolve(movie, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
  })
  it('maps upstream server errors to a retryable unavailable result', async () => {
    const http = fixture({ status: 500 })
    expect(await createFmfauProvider(http, now).resolve(movie, new AbortController().signal)).toMatchObject({ ok: false, code: 'unavailable', retryable: true })
  })
  it('rejects anime refs before any upstream call', async () => {
    const http = fixture()
    expect(await createFmfauProvider(http, now).resolve({ ...movie, ref: { kind: 'anime' as const, id: 21, episode: 3 } }, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
    expect(http).not.toHaveBeenCalled()
  })
})
