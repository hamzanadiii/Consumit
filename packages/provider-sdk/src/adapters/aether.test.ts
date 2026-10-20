import { describe, expect, it, vi } from 'vitest'
import { createAetherProvider } from './aether.ts'
import { userAgent, type ProviderHttp } from './http.ts'

const now = () => Date.parse('2026-10-17T00:00:00Z')
const movie = { ref: { kind: 'movie' as const, id: 27205 }, region: 'US', audioLanguage: 'en' }
const series = { ref: { kind: 'series' as const, id: 1396, season: 1, episode: 3 }, region: 'US', audioLanguage: 'en' }
const workerUrl = 'https://cflul.bw1.workers.dev/vid/tok'
const masterUrl = 'https://cdn1018.cdn-tnmr.org/hls2/05/0/master.m3u8?t=hmac&s=1&e=28800'
const master = ['#EXTM3U', '#EXT-X-TARGETDURATION:10', '#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080', 'v_1080.m3u8'].join('\n')

type Options = { status?: number; body?: unknown; finalUrl?: string; finalBody?: string }
function fixture(options: Options = {}) {
  return vi.fn<ProviderHttp>(async url => {
    if (url.startsWith('https://lul.aether.cx/')) {
      const status = options.status ?? 200
      const text = status === 404
        ? JSON.stringify({ error: 'No LUL backup found' })
        : JSON.stringify(options.body ?? { stream: workerUrl })
      return { url, text, status, headers: new Headers() }
    }
    if (url === workerUrl) {
      // The transport follows the 302 and settles response.url on the master.
      return { url: options.finalUrl ?? masterUrl, text: options.finalBody ?? master, status: 200, headers: new Headers() }
    }
    if (url.startsWith('https://sub.vdrk.site/')) {
      return { url, text: JSON.stringify([{ label: 'English', file: 'https://sub.vdrk.site/en.vtt' }]), status: 200, headers: new Headers() }
    }
    return { url, text: '', status: 404, headers: new Headers() }
  })
}

describe('Aether adapter', () => {
  it('resolves a movie through the LUL API and ships the settled tnmr master', async () => {
    const http = fixture()
    expect(await createAetherProvider(http, now).resolve(movie, new AbortController().signal)).toMatchObject({
      ok: true,
      sources: [{
        key: 'aether:auto:0', url: masterUrl, type: 'hls', qualityHint: 'auto',
        headers: { 'user-agent': userAgent },
        relayRecipe: 'aether-v1', relayHosts: ['cdn1018.cdn-tnmr.org'],
        subtitles: [{ label: 'English', format: 'vtt' }],
      }],
    })
    expect(http.mock.calls[0]?.[0]).toBe('https://lul.aether.cx/movie/27205')
    expect(http.mock.calls[0]?.[1]).toMatchObject({ referer: 'https://aether.ist/', origin: 'https://aether.ist' })
  })
  it('resolves TV through the season/episode LUL path', async () => {
    const http = fixture()
    await createAetherProvider(http, now).resolve(series, new AbortController().signal)
    expect(http.mock.calls[0]?.[0]).toBe('https://lul.aether.cx/tv/1396/1/3')
  })
  it('marks the unrecognised tnmr expiry as estimated', async () => {
    const http = fixture()
    expect(await createAetherProvider(http, now).resolve(movie, new AbortController().signal)).toMatchObject({
      ok: true,
      sources: [{ expiryEstimated: true, expiresAt: new Date(now() + 300_000).toISOString() }],
    })
  })
  it('maps a 404 catalog gap to a non-retryable empty result', async () => {
    const http = fixture({ status: 404 })
    expect(await createAetherProvider(http, now).resolve(movie, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty', retryable: false })
  })
  it('rejects a settle on the worker host (no 302 fired)', async () => {
    const http = fixture({ finalUrl: workerUrl })
    expect(await createAetherProvider(http, now).resolve(movie, new AbortController().signal)).toMatchObject({ ok: false, code: 'malformed' })
  })
  it('rejects a settle on a foreign media host', async () => {
    const http = fixture({ finalUrl: 'https://evil.example/hls2/master.m3u8' })
    expect(await createAetherProvider(http, now).resolve(movie, new AbortController().signal)).toMatchObject({ ok: false, code: 'malformed' })
  })
  it('fails closed when the settled body is not a playlist', async () => {
    const http = fixture({ finalBody: '<html>interstitial</html>' })
    expect(await createAetherProvider(http, now).resolve(movie, new AbortController().signal)).toMatchObject({ ok: false, code: 'malformed' })
  })
  it('rejects a response without a stream field', async () => {
    const http = fixture({ body: {} })
    expect(await createAetherProvider(http, now).resolve(movie, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
  })
  it('rejects anime refs before any upstream call', async () => {
    const http = fixture()
    expect(await createAetherProvider(http, now).resolve({ ...movie, ref: { kind: 'anime' as const, id: 21, episode: 3 } }, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
    expect(http).not.toHaveBeenCalled()
  })
  it('maps upstream server errors to a retryable unavailable result', async () => {
    const http = fixture({ status: 500 })
    expect(await createAetherProvider(http, now).resolve(movie, new AbortController().signal)).toMatchObject({ ok: false, code: 'unavailable', retryable: true })
  })
})
