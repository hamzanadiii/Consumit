import { describe, expect, it, vi } from 'vitest'
import { createRigelProvider } from './rigel.ts'
import type { ProviderHttp } from './http.ts'

const now = () => Date.parse('2026-10-20T00:00:00Z')
const movie = { ref: { kind: 'movie' as const, id: 550 }, region: 'US', audioLanguage: 'en' }
const series = { ref: { kind: 'series' as const, id: 1399, season: 1, episode: 1 }, region: 'US', audioLanguage: 'en' }

const apiMovie = 'https://movish.to/player-sources/rigel/movie/550'
const apiSeries = 'https://movish.to/player-sources/rigel/tv/1399/1/1'
const vsUrl = 'https://api.dlproxy.com/v1/vs/AQZtb3Zpc2hJ'
const playUrl = 'https://api.dlproxy.com/v1/play/AQZtb3Zpc2hK'
const variantUrl = 'https://api.dlproxy.com/v1/variant.m3u8'
const segmentUrl = 'https://api.dlproxy.com/v1/seg-0.ts'
const keyUrl = 'https://api.dlproxy.com/key/AQZtb3Zpc2iEPk'

const MASTER = `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-STREAM-INF:BANDWIDTH=2000000,RESOLUTION=1920x1080\n${variantUrl}\n`
const MEDIA = '#EXTM3U\n#EXT-X-TARGETDURATION:4\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:4.0,\nseg-0.ts\n'
const ENCRYPTED_MEDIA = `#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-KEY:METHOD=AES-128,URI="${keyUrl}"\n#EXT-X-TARGETDURATION:4\n#EXT-X-MEDIA-SEQUENCE:0\n#EXTINF:4.0,\nseg-0.ts\n`
const SEGMENT = 'not-a-real-video-payload'

type Call = { url: string; headers: Record<string, string>; init?: { readPrefixBytes?: number } | undefined }

function fixture(options: { api?: { status: number; body?: unknown }; streams?: { vs: boolean; play: boolean }; media?: { status: number; encrypted?: boolean } } = {}) {
  const calls: Call[] = []
  const streams = options.streams ?? { vs: true, play: true }
  const apiBody = { source: 'rigel', label: 'Rigel', streams: [
    ...(streams.vs ? [{ url: vsUrl, label: 'Rigel', type: 'hls', quality: '1080p' }] : []),
    ...(streams.play ? [{ url: playUrl, label: 'Lyra', type: 'hls', quality: null }] : []),
  ], subtitles: [], success: true }
  const http = vi.fn<ProviderHttp>(async (url, headers, _signal, init) => {
    calls.push({ url, headers, init })
    if (url.startsWith('https://movish.to/player-sources/rigel')) {
      const entry = options.api ?? { status: 200, body: apiBody }
      return { url, status: entry.status, text: JSON.stringify(entry.body ?? {}), headers: new Headers() }
    }
    if (url === vsUrl) return { url, status: 200, text: MASTER, headers: new Headers() }
    if (url === variantUrl) return { url, status: options.media?.status ?? 200, text: options.media?.encrypted ? ENCRYPTED_MEDIA : MEDIA, headers: new Headers() }
    if (url === keyUrl) return { url, status: 403, text: 'proof required', headers: new Headers() }
    if (url === segmentUrl) return { url, status: options.media?.status ?? 200, text: '', bytes: new TextEncoder().encode(SEGMENT), headers: new Headers() }
    return { url, status: 404, text: '', headers: new Headers() }
  })
  return { http, calls }
}

describe('Rigel adapter', () => {
  it('identifies the lookup and proves the surviving lane before returning it', async () => {
    const { http, calls } = fixture()
    const result = await createRigelProvider(http, now).resolve(movie, new AbortController().signal)
    const api = calls.find((call) => call.url === apiMovie)
    expect(api?.headers).toMatchObject({ referer: 'https://movish.to/', 'user-agent': expect.any(String) })
    expect(calls.some((call) => call.url.startsWith('https://movish.to/player-sources/rigel/movie/550'))).toBe(true)
    expect(result).toMatchObject({ ok: true })
    expect(result.ok && result.sources[0]).toMatchObject({
      key: 'rigel-0',
      url: vsUrl,
      type: 'hls',
      language: 'original',
      qualityHint: '1080p',
      height: 1080,
      expiresAt: '2026-10-20T00:05:00.000Z',
      subtitles: [],
      headers: {},
    })
  })

  it('builds the series path for an exact episode', async () => {
    const { http, calls } = fixture()
    await createRigelProvider(http, now).resolve(series, new AbortController().signal)
    expect(calls.some((call) => call.url === apiSeries)).toBe(true)
  })

  it('never fetches the proof-gated lanes', async () => {
    const { http, calls } = fixture()
    const result = await createRigelProvider(http, now).resolve(movie, new AbortController().signal)
    expect(result.ok).toBe(true)
    expect(calls.some((call) => call.url.startsWith('https://api.dlproxy.com/v1/play/'))).toBe(false)
  })

  it('reports empty when only proof-gated lanes remain', async () => {
    const { http, calls } = fixture({ streams: { vs: false, play: true } })
    const result = await createRigelProvider(http, now).resolve(movie, new AbortController().signal)
    expect(result).toMatchObject({ ok: false, code: 'empty' })
    expect(calls.some((call) => call.url.startsWith('https://api.dlproxy.com/v1/play/'))).toBe(false)
  })

  it('drops a lane whose chain never reaches a media playlist', async () => {
    const { http, calls } = fixture({ media: { status: 404 } })
    const result = await createRigelProvider(http, now).resolve(movie, new AbortController().signal)
    expect(result).toMatchObject({ ok: false, code: 'empty' })
    expect(calls.some((call) => call.url === variantUrl)).toBe(true)
  })

  it('rejects an encrypted lane whose key endpoint is proof-gated', async () => {
    const { http, calls } = fixture({ media: { status: 200, encrypted: true } })
    const result = await createRigelProvider(http, now).resolve(movie, new AbortController().signal)
    expect(result).toMatchObject({ ok: false, code: 'empty' })
    expect(calls.some((call) => call.url === keyUrl)).toBe(false)
    expect(calls.some((call) => call.url === segmentUrl)).toBe(false)
  })

  it('reports unavailable when the lookup answers a server error', async () => {
    const { http } = fixture({ api: { status: 403, body: { success: false } } })
    expect(await createRigelProvider(http, now).resolve(movie, new AbortController().signal)).toMatchObject({ ok: false, code: 'unavailable' })
  })

  it('rejects a ref Rigel cannot address', async () => {
    const { http } = fixture()
    expect(await createRigelProvider(http, now).resolve({ ...movie, ref: { kind: 'anime', id: 21, episode: 1 } }, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
    expect(http).not.toHaveBeenCalled()
  })
})
