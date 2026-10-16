import { describe, expect, it, vi } from 'vitest'
import { createNetodaProvider } from './netoda.ts'
import type { ProviderHttp } from './http.ts'

const input = { ref: { kind: 'movie' as const, id: 550 }, region: 'US', audioLanguage: 'en' }
const now = () => Date.parse('2026-10-03T00:00:00Z')
const proxied = 'https://p1.netocdn.site/proxy?url=https%3A%2F%2Fnetoda.tech%2Fhls%2Fabc%2Fmaster.m3u8&data=e30'

function fixture(options: { body?: unknown; text?: string; status?: number } = {}) {
  return vi.fn<ProviderHttp>(async (url) => ({
    url,
    headers: new Headers(),
    status: options.status ?? 200,
    text: options.text ?? JSON.stringify(options.body ?? { sources: [{ url: proxied }] }),
  }))
}

describe('Netoda adapter', () => {
  it('calls the vidora API with the player key and decodes the upstream master', async () => {
    const http = fixture()
    const result = await createNetodaProvider(http, now).resolve(input, new AbortController().signal)
    expect(http.mock.calls[0]?.[0]).toBe('https://cdn.vidspark.to/api/vidora/v1/movie/550')
    expect(http.mock.calls[0]?.[1]).toMatchObject({ referer: 'https://cdn.vidspark.to/', 'x-player-key': expect.any(String) })
    expect(result).toMatchObject({ ok: true, sources: [{
      url: 'https://netoda.tech/hls/abc/master.m3u8', type: 'hls', headers: {}, qualityHint: 'Auto', language: 'original',
    }] })
    expect(result.ok && result.sources[0]?.expiryEstimated).toBe(true)
  })
  it('calls the TV endpoint with season and episode', async () => {
    const http = fixture()
    await createNetodaProvider(http, now).resolve({ ...input, ref: { kind: 'series' as const, id: 1396, season: 1, episode: 2 } }, new AbortController().signal)
    expect(http.mock.calls[0]?.[0]).toBe('https://cdn.vidspark.to/api/vidora/v1/tv/1396/1/2')
  })
  it.each([
    { status: 404 },
    { status: 500 },
    { body: { sources: [] } },
    { body: { sources: null } },
    { body: { sources: [{ url: 'https://p1.netocdn.site/proxy?data=e30' }] } },
    { body: { sources: [{ url: 'http://netoda.tech/hls/abc/master.m3u8' }] } },
    { text: '{' },
  ])('returns no source for missing, rejected, or undecodable responses: %j', async (options) => {
    expect(await createNetodaProvider(fixture(options), now).resolve(input, new AbortController().signal)).toMatchObject({ ok: false })
  })
})
