import { describe, expect, it, vi } from 'vitest'
import { createVidriftProvider } from './vidrift.ts'
import type { ProviderHttp } from './http.ts'

const movie = { ref: { kind: 'movie' as const, id: 550 }, region: 'US', audioLanguage: 'en' }
const series = { ref: { kind: 'series' as const, id: 1396, season: 1, episode: 1 }, region: 'US', audioLanguage: 'en' }
const now = () => Date.parse('2026-10-03T00:00:00Z')

function fixture(options: { meta?: unknown; status?: number; text?: string } = {}) {
  const meta = options.meta ?? {
    orionStreams: [
      { type: 'hls', url: '/api/mb/abc123/master.m3u8', name: 'Orion - Original', rungs: [{ width: 1154, height: 480 }] },
      { type: 'hls', url: 'https://mb.vidrift.net/api/mb/def456/master.m3u8', name: 'Orion - Hindi', rungs: [{ width: 2592, height: 1080 }, { width: 1728, height: 720 }] },
      { type: 'mp4', url: 'https://mb.vidrift.net/x.mp4', name: 'Orion' },
      { type: 'hls', url: 'http://mb.vidrift.net/insecure.m3u8', name: 'Orion' },
      { type: 'hls', url: '/api/mb/broken.m3u8' },
    ],
    evionUrl: 'https://img.animecurx.tech/tvshows/abc/index.m3u8',
  }
  return vi.fn<ProviderHttp>(async (url) => ({
    url,
    status: options.status ?? 200,
    text: options.text ?? JSON.stringify({ meta }),
  }))
}

describe('Vidrift adapter', () => {
  it('calls the open boot endpoint and returns Orion lanes plus the Evion lane', async () => {
    const http = fixture()
    const result = await createVidriftProvider(http, now).resolve(movie, new AbortController().signal)
    expect(http.mock.calls[0]?.[0]).toBe('https://embed.vidrift.net/api/boot/movie/550?shell=1')
    expect(result).toMatchObject({ ok: true, sources: [
      { url: 'https://mb.vidrift.net/api/mb/abc123/master.m3u8', type: 'hls', headers: { origin: 'https://embed.vidrift.net' }, language: 'original', qualityHint: '480p', height: 480 },
      { url: 'https://mb.vidrift.net/api/mb/def456/master.m3u8', language: 'hi', qualityHint: '1080p', height: 1080 },
      { url: 'https://mb.vidrift.net/api/mb/broken.m3u8', language: 'original', qualityHint: 'Auto' },
      { url: 'https://img.animecurx.tech/tvshows/abc/index.m3u8', headers: {}, language: 'original' },
    ] })
    expect(result.ok && result.sources).toHaveLength(4)
  })
  it('accepts the keyed lanes object some boot responses return', async () => {
    const http = fixture({ meta: { orionStreams: {
      a: { type: 'hls', url: 'https://mb.vidrift.net/api/mb/aaa/master.m3u8', name: 'Orion - French', rungs: [{ height: 720 }] },
      b: { type: 'hls' },
    } } })
    const result = await createVidriftProvider(http, now).resolve(movie, new AbortController().signal)
    expect(result).toMatchObject({ ok: true, sources: [
      { url: 'https://mb.vidrift.net/api/mb/aaa/master.m3u8', language: 'fr', qualityHint: '720p', height: 720 },
    ] })
  })
  it('calls the TV boot endpoint with season and episode', async () => {
    const http = fixture()
    await createVidriftProvider(http, now).resolve(series, new AbortController().signal)
    expect(http.mock.calls[0]?.[0]).toBe('https://embed.vidrift.net/api/boot/tv/1396/1/1?shell=1')
  })
  it.each([
    { meta: { unreleased: true } },
    { meta: {} },
    { meta: { unreleased: null, orionStreams: null, evionUrl: null } },
    { meta: { orionStreams: [] } },
    { status: 404 },
    { status: 451 },
    { status: 500 },
    { text: '{' },
  ])('returns no source for blocked, missing, or malformed boot data: %j', async (options) => {
    expect(await createVidriftProvider(fixture(options), now).resolve(movie, new AbortController().signal)).toMatchObject({ ok: false })
  })
  it('rejects anime before any upstream call', async () => {
    const http = fixture()
    expect(await createVidriftProvider(http, now).resolve({ ...movie, ref: { kind: 'anime' as const, id: 21, episode: 1 } }, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
    expect(http).not.toHaveBeenCalled()
  })
})
