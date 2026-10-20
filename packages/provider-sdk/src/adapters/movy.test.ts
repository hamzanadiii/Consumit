import { describe, expect, it, vi } from 'vitest'
import { createMovyProvider } from './movy.ts'
import type { ProviderHttp } from './http.ts'

const now = () => Date.parse('2026-10-17T00:00:00Z')
const apiKey = '0f461eaa465bb2a7acd037425217f2f209ef540a3171e1ac'
const movie = { ref: { kind: 'movie' as const, id: 27205 }, region: 'US', audioLanguage: 'en' }
const series = { ref: { kind: 'series' as const, id: 1396, season: 1, episode: 3 }, region: 'US', audioLanguage: 'en' }
const mediaUrl = 'https://img.rousav.tech/media/abc/index.m3u8?api_key=k'
const master = [
  '#EXTM3U',
  '#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aac",LANGUAGE="en",NAME="English",DEFAULT=YES,AUTOSELECT=YES,URI="track_en.m3u8?api_key=k"',
  '#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080,AUDIO="aac"',
  'tiles_1080.m3u8?api_key=k',
].join('\n')

type Options = { status?: number; body?: unknown; source?: string; master?: string }
function fixture(options: Options = {}) {
  return vi.fn<ProviderHttp>(async url => {
    if (url.startsWith('https://api.movy.lol/')) {
      const status = options.status ?? 200
      const text = options.status
        ? JSON.stringify({ error: status === 404 ? 'Movie not found in database' : 'upstream failure' })
        : JSON.stringify(options.body ?? { source: 'h', m3u8_path: 'media/h/index.m3u8', sources: [{ url: options.source ?? mediaUrl, quality: '1080p', type: 'm3u8' }] })
      return { url, text, status, headers: new Headers() }
    }
    return { url, text: options.master ?? master, status: 200, headers: new Headers({ 'content-type': 'application/vnd.apple.mpegurl' }) }
  })
}

describe('Movy adapter', () => {
  it('resolves movies through the key-gated source endpoint and verifies the direct master with the provider origin', async () => {
    const http = fixture()
    expect(await createMovyProvider(http, now).resolve(movie, new AbortController().signal)).toMatchObject({
      ok: true,
      sources: [{
        key: 'movie:0', url: mediaUrl, type: 'hls', height: 1080, qualityHint: '1080p',
        language: 'original', headers: { origin: 'https://www.movy.sx' }, subtitles: [],
        expiresAt: new Date(now() + 300_000).toISOString(), expiryEstimated: true,
      }],
    })
    expect(http.mock.calls[0]?.[0]).toBe(`https://api.movy.lol/api/source/27205?api_key=${apiKey}`)
    expect(http.mock.calls[0]?.[1]).toMatchObject({ accept: 'application/json' })
    expect(http.mock.calls[0]?.[1]).not.toHaveProperty('origin')
    expect(http.mock.calls[1]?.[0]).toBe(mediaUrl)
    expect(http.mock.calls[1]?.[1]).toMatchObject({ origin: 'https://www.movy.sx' })
    expect(http.mock.calls).toHaveLength(2)
  })
  it('resolves TV through the exact tv endpoint', async () => {
    const http = fixture()
    expect(await createMovyProvider(http, now).resolve(series, new AbortController().signal)).toMatchObject({ ok: true, sources: [{ key: 'series:0' }] })
    expect(http.mock.calls[0]?.[0]).toBe(`https://api.movy.lol/api/tv/1396/1/3?api_key=${apiKey}`)
  })
  it('rejects anime refs before any upstream call', async () => {
    const http = fixture()
    expect(await createMovyProvider(http, now).resolve({ ...movie, ref: { kind: 'anime' as const, id: 21, episode: 3 } }, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
    expect(http).not.toHaveBeenCalled()
  })
  it('maps the 404 content gap to a non-retryable empty result', async () => {
    const http = fixture({ status: 404 })
    expect(await createMovyProvider(http, now).resolve(movie, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty', retryable: false })
    expect(http.mock.calls).toHaveLength(1)
  })
  it('maps upstream server errors to a retryable unavailable result', async () => {
    const http = fixture({ status: 500 })
    expect(await createMovyProvider(http, now).resolve(movie, new AbortController().signal)).toMatchObject({ ok: false, code: 'unavailable', retryable: true })
    expect(http.mock.calls).toHaveLength(1)
  })
  it.each([
    { label: 'a foreign host', source: 'https://evil.example/master.m3u8' },
    { label: 'an insecure scheme', source: 'http://img.rousav.tech/media/abc/index.m3u8' },
    { label: 'a relay-named path', source: 'https://img.rousav.tech/relay/media/abc/index.m3u8' },
    { label: 'a wrapped target', source: 'https://img.rousav.tech/index.m3u8?url=https://evil.example/f.mp4' },
  ])('drops sources on $label without fetching media', async ({ source }) => {
    const http = fixture({ source })
    expect(await createMovyProvider(http, now).resolve(movie, new AbortController().signal)).toMatchObject({ ok: false, code: 'malformed' })
    expect(http.mock.calls).toHaveLength(1)
  })
  it('fails closed when the root playlist is not a playable manifest', async () => {
    const http = fixture({ master: '<html>gone</html>' })
    expect(await createMovyProvider(http, now).resolve(movie, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
    expect(http.mock.calls).toHaveLength(2)
  })
  it('treats a sourceless response as a content gap', async () => {
    const http = fixture({ body: { sources: [] } })
    expect(await createMovyProvider(http, now).resolve(movie, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
    expect(http.mock.calls).toHaveLength(1)
  })
  it('rejects a malformed API payload', async () => {
    const http = fixture({ body: { sources: 'nope' } })
    expect(await createMovyProvider(http, now).resolve(movie, new AbortController().signal)).toMatchObject({ ok: false, code: 'malformed' })
    expect(http.mock.calls).toHaveLength(1)
  })
  it('keeps one source when upstream repeats the same rendition', async () => {
    const http = fixture({ body: { sources: [{ url: mediaUrl, quality: '1080p', type: 'm3u8' }, { url: mediaUrl, quality: 'Auto', type: 'm3u8' }] } })
    expect(await createMovyProvider(http, now).resolve(movie, new AbortController().signal)).toMatchObject({ ok: true, sources: [{ key: 'movie:0' }] })
    expect(http.mock.calls).toHaveLength(2)
  })
  it('declares a friendly audio label for separate-audio discovery', () => {
    expect(createMovyProvider(fixture()).separateAudio).toEqual({ label: 'Movy' })
  })
})
