import { describe, expect, it, vi } from 'vitest'
import { createStreamvaultProvider } from './streamvault.ts'
import type { ProviderHttp } from './http.ts'

const input = { ref: { kind: 'movie' as const, id: 550 }, region: 'US', audioLanguage: 'en' }
const now = () => Date.parse('2026-10-03T00:00:00Z')

function wrapper(upstream: string, headers?: Record<string, string>): string {
  const params = new URLSearchParams({ u: upstream, s: 'sig' })
  if (headers) params.set('h', JSON.stringify(headers))
  return `https://streamvaultsrc.click/stream-proxy/pl?${params}`
}

function fixture(streams: unknown, status = 200) {
  return vi.fn<ProviderHttp>(async (url) => ({
    url,
    status,
    text: typeof streams === 'string' ? streams : JSON.stringify({ streams }),
  }))
}

const open = [
  { url: wrapper('https://storage2.streamvaultsrc.click/hls/movie/550/index.m3u8'), quality: '1080p', type: 'hls' },
  { url: wrapper('https://img1.hlnom.com/x/index.m3u8'), quality: 'auto', type: 'hls' },
]

describe('Streamvault adapter', () => {
  it('unwraps header-less entries to direct upstream media', async () => {
    const http = fixture(open)
    const result = await createStreamvaultProvider(http, now).resolve(input, new AbortController().signal)
    expect(http.mock.calls[0]?.[0]).toBe('https://streamvaultsrc.click/api/embed-streams/movie/550')
    expect(result).toMatchObject({ ok: true, sources: [
      { url: 'https://storage2.streamvaultsrc.click/hls/movie/550/index.m3u8', type: 'hls', headers: {}, qualityHint: '1080p', height: 1080, language: 'original' },
      { url: 'https://img1.hlnom.com/x/index.m3u8', qualityHint: 'auto' },
    ] })
    expect(result.ok && result.sources).toHaveLength(2)
  })
  it('drops entries whose wrapper demands browser-unsendable headers', async () => {
    const http = fixture([
      ...open,
      { url: wrapper('https://remoteconsultinggroup.site/x/master.m3u8', { Referer: 'https://nextgencloudfabric.com/' }), quality: 'auto', type: 'hls' },
      { url: wrapper('https://remoteconsultinggroup.site/y/master.m3u8', { Origin: 'https://example.com' }), quality: 'auto', type: 'hls' },
      { url: 'https://evil.example/direct.m3u8', quality: 'auto', type: 'hls' },
    ])
    const result = await createStreamvaultProvider(http, now).resolve(input, new AbortController().signal)
    expect(result.ok && result.sources).toHaveLength(2)
    expect(result.ok && result.sources.every((source) => !source.url.includes('remoteconsultinggroup.site'))).toBe(true)
  })
  it.each([
    { streams: [] },
    { streams: null },
    { streams: [{ url: wrapper('https://remoteconsultinggroup.site/x/master.m3u8', { Referer: 'https://x.example/' }) }] },
    { streams: [{ url: 'https://other.example/stream-proxy/pl?u=https://storage2.streamvaultsrc.click/x.m3u8' }] },
    { streams: [{ url: wrapper('http://storage2.streamvaultsrc.click/x.m3u8') }] },
    { streams: { nope: true } },
    { streams: '[', status: 200 },
  ])('returns no source when nothing unwraps to open direct media: %j', async ({ streams, status }) => {
    expect(await createStreamvaultProvider(fixture(streams, status), now).resolve(input, new AbortController().signal)).toMatchObject({ ok: false })
  })
  it('calls the TV endpoint with season and episode', async () => {
    const http = fixture(open)
    await createStreamvaultProvider(http, now).resolve({ ...input, ref: { kind: 'series' as const, id: 1396, season: 2, episode: 4 } }, new AbortController().signal)
    expect(http.mock.calls[0]?.[0]).toBe('https://streamvaultsrc.click/api/embed-streams/tv/1396/2/4')
  })
})
