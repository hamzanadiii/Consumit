import { describe, expect, it, vi } from 'vitest'
import { createCinecatProvider, type CinecatSign } from './cinecat.ts'
import type { ProviderHttp } from './http.ts'

const now = () => Date.parse('2026-10-17T00:00:00Z')
const movie = { ref: { kind: 'movie' as const, id: 27205 }, region: 'US', audioLanguage: 'en' }
const series = { ref: { kind: 'series' as const, id: 1396, season: 1, episode: 3 }, region: 'US', audioLanguage: 'en' }
const streamUrl = 'https://totallyacdn.org/cdn-m3u8?payload=abc'
const sign: CinecatSign = { sign: vi.fn(async () => ({ 'x-az-id': 'i', 'x-az-ts': '1', 'x-az-nonce': 'n', 'x-az-tag': 't' })), clear: vi.fn() }

function playlist(durationSeconds: number) {
  const lines = ['#EXTM3U', '#EXT-X-TARGETDURATION:10', '#EXT-X-PLAYLIST-TYPE:VOD', '#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080']
  if (durationSeconds >= 600) {
    lines.push('v_1080.m3u8')
    return lines.join('\n')
  }
  // media playlist shape for a decoy: segments with EXTINF summing below the floor
  return ['#EXTM3U', '#EXT-X-TARGETDURATION:8', ...Array.from({ length: 8 }, (_, i) => `#EXTINF:8.0,\nseg${i}.ts`)].join('\n')
}

type Options = { status?: number; body?: unknown; title?: string | null; variant?: string }
function fixture(options: Options = {}) {
  const variant = options.variant ?? ['#EXTM3U', '#EXT-X-TARGETDURATION:10', '#EXT-X-PLAYLIST-TYPE:VOD', ...Array.from({ length: 80 }, (_, i) => `#EXTINF:10.0,\nseg${i}.ts`)].join('\n')
  return vi.fn<ProviderHttp>(async url => {
    if (url.startsWith('https://cdn.hls.lol/content/')) {
      const status = options.status ?? 200
      const title = options.title === undefined ? 'Inception' : options.title
      const text = status >= 400
        ? JSON.stringify({ error: 'not found' })
        : JSON.stringify({ found: true, ...(title === null ? {} : { title }), type: 'hls', url: streamUrl })
      return { url, text, status, headers: new Headers() }
    }
    if (url.startsWith('https://sub.vdrk.site/')) {
      return { url, text: JSON.stringify([{ label: 'English', file: 'https://sub.vdrk.site/en.vtt' }]), status: 200, headers: new Headers() }
    }
    if (url.startsWith('https://totallyacdn.org/')) {
      return { url, text: variant, status: 200, headers: new Headers({ 'content-type': 'application/vnd.apple.mpegurl' }) }
    }
    return { url, text: '#EXTM3U\n#EXT-X-TARGETDURATION:10\nv_1080.m3u8', status: 200, headers: new Headers() }
  })
}

describe('Cinecat adapter', () => {
  it('resolves a cataloged movie through the x-az gate and ships the titled payload', async () => {
    const http = fixture()
    const result = await createCinecatProvider(http, now, { sign }).resolve(movie, new AbortController().signal)
    expect(result).toMatchObject({
      ok: true,
      sources: [{
        key: 'cinecat:auto:0', url: streamUrl, type: 'hls', qualityHint: 'auto',
        headers: { referer: 'https://cinecat.eu/' },
        subtitles: [{ label: 'English', format: 'vtt' }],
        expiresAt: new Date(now() + 300_000).toISOString(), expiryEstimated: true,
      }],
    })
    expect(sign.sign).toHaveBeenCalledWith('https://cdn.hls.lol', '/content/movie/27205')
    expect(http.mock.calls.some(([url]) => url.startsWith('https://sub.vdrk.site/v1/movie/27205'))).toBe(true)
  })
  it('signs the TV content path with season and episode numbers', async () => {
    const http = fixture()
    await createCinecatProvider(http, now, { sign }).resolve(series, new AbortController().signal)
    expect(sign.sign).toHaveBeenCalledWith('https://cdn.hls.lol', '/content/tv/1396/1/3')
  })
  it('fails closed when the response carries a fallback stream but no title', async () => {
    const http = fixture({ title: null })
    expect(await createCinecatProvider(http, now, { sign }).resolve(movie, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
  })
  it('rejects the 64-second decoy ladder by duration floor', async () => {
    const http = fixture({ variant: playlist(64) })
    expect(await createCinecatProvider(http, now, { sign }).resolve(movie, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
  })
  it('clears a stale signing session and retries once on a 401', async () => {
    const base = fixture()
    let contentCalls = 0
    const http = vi.fn<ProviderHttp>(async (url, headers, signal) => {
      if (url.startsWith('https://cdn.hls.lol/content/')) {
        contentCalls += 1
        if (contentCalls === 1) return { url, text: JSON.stringify({ error: 'stale tag' }), status: 401, headers: new Headers() }
      }
      return base(url, headers, signal)
    })
    const stale: CinecatSign = {
      sign: vi.fn()
        .mockResolvedValueOnce({ 'x-az-id': 'stale' })
        .mockResolvedValue({ 'x-az-id': 'fresh' }),
      clear: vi.fn(),
    }
    expect(await createCinecatProvider(http, now, { sign: stale }).resolve(movie, new AbortController().signal)).toMatchObject({ ok: true })
    expect(stale.clear).toHaveBeenCalledTimes(1)
    expect(contentCalls).toBe(2)
  })
  it('maps a 404 catalog gap to a non-retryable empty result', async () => {
    const http = fixture({ status: 404 })
    expect(await createCinecatProvider(http, now, { sign }).resolve(movie, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty', retryable: false })
  })
  it('maps upstream server errors to a retryable unavailable result', async () => {
    const http = fixture({ status: 500 })
    expect(await createCinecatProvider(http, now, { sign }).resolve(movie, new AbortController().signal)).toMatchObject({ ok: false, code: 'unavailable', retryable: true })
  })
  it('rejects anime refs before any upstream call', async () => {
    const http = fixture()
    expect(await createCinecatProvider(http, now, { sign }).resolve({ ...movie, ref: { kind: 'anime' as const, id: 21, episode: 3 } }, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
    expect(http).not.toHaveBeenCalled()
  })
  it('treats a failed signing attempt as unavailable', async () => {
    const http = fixture()
    const broken: CinecatSign = { sign: vi.fn(async () => { throw new Error('challenge failed') }), clear: vi.fn() }
    expect(await createCinecatProvider(http, now, { sign: broken }).resolve(movie, new AbortController().signal)).toMatchObject({ ok: false, code: 'unavailable' })
    expect(http).not.toHaveBeenCalled()
  })
})
