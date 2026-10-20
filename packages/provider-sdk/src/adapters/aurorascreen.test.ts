import { describe, expect, it, vi } from 'vitest'
import { createAuroraScreenProvider, type ProviderHttp } from '../index.ts'

const movie = { ref: { kind: 'movie' as const, id: 550 }, region: 'US', audioLanguage: 'en' }
const series = { ref: { kind: 'series' as const, id: 1396, season: 1, episode: 1 }, region: 'US', audioLanguage: 'en' }
const signal = () => new AbortController().signal
const metadata = async () => ({ title: 'Fight Club', year: 1999 })

function client(...responses: { status?: number; body?: unknown }[]) {
  return vi.fn<ProviderHttp>(async url => {
    const next = responses.shift() ?? { status: 200, body: { success: false } }
    return { status: next.status ?? 200, url, text: typeof next.body === 'string' ? next.body : JSON.stringify(next.body) }
  })
}

describe('AuroraScreen', () => {
  it('resolves venus sources with quality from the master ladder', async () => {
    const http = client(
      { body: { success: true, streams: [{ source: 'Venus', quality: 'HLS', url: 'https://cflul.bx5.workers.dev/vid/abc', subtitles: [{ language: 'English', url: 'https://cacdn.hakunaymatata.com/en.srt', name: 'English' }] }] } },
      { body: '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000,RESOLUTION=1280x720\nvariant.m3u8' },
    )
    const result = await createAuroraScreenProvider(http, metadata).resolve(movie, signal())
    expect(result).toMatchObject({ ok: true, sources: [{ url: 'https://cflul.bx5.workers.dev/vid/abc', qualityHint: '720p', subtitles: [{ label: 'English', format: 'srt' }] }] })
    const request = new URL(http.mock.calls[0]?.[0] ?? '')
    expect(request.pathname).toBe('/venus')
    expect(request.searchParams.get('id')).toBe('550')
    expect(request.searchParams.get('name')).toBe('Fight Club')
    expect(request.searchParams.get('year')).toBe('1999')
    expect(http.mock.calls[0]?.[1]).toMatchObject({ referer: 'https://www.aurorascreen.org/' })
  })

  it('falls back to jupiter with referer headers when venus is empty', async () => {
    const http = client(
      { body: { success: false } },
      { body: { success: true, streams: [{ source: 'Jupiter', quality: '1080p', url: 'https://jupiter-proxy.example/jpl/abc' }] } },
    )
    const result = await createAuroraScreenProvider(http, metadata).resolve(movie, signal())
    expect(result).toMatchObject({ ok: true, sources: [{ url: 'https://jupiter-proxy.example/jpl/abc', headers: { referer: 'https://www.aurorascreen.org/' } }] })
  })

  it('sends season/episode for TV and rejects invalid refs', async () => {
    const http = client({ body: { success: true, streams: [{ quality: 'HLS', url: 'https://cflul.bx5.workers.dev/vid/xyz' }] } }, { body: '#EXTM3U\n#EXT-X-TARGETDURATION:10' })
    await createAuroraScreenProvider(http, metadata).resolve(series, signal())
    expect(http.mock.calls[0]?.[0]).toContain('s=1&e=1')
    expect(await createAuroraScreenProvider(http, metadata).resolve({ ref: { kind: 'anime', id: 1 }, region: 'US', audioLanguage: 'en' }, signal())).toMatchObject({ ok: false })
  })

  it('rejects non-https and duplicate stream URLs', async () => {
    const http = client({ body: { success: true, streams: [
      { quality: 'HLS', url: 'http://insecure.example/a' },
      { quality: 'HLS', url: 'https://cflul.bx5.workers.dev/vid/dup' },
      { quality: 'HLS', url: 'https://cflul.bx5.workers.dev/vid/dup' },
    ] } }, { body: '#EXTM3U\n#EXT-X-TARGETDURATION:10' })
    const result = await createAuroraScreenProvider(http, metadata).resolve(movie, signal())
    expect(result).toMatchObject({ ok: true, sources: [{ url: 'https://cflul.bx5.workers.dev/vid/dup' }] })
    expect((result as { sources: unknown[] }).sources).toHaveLength(1)
  })
})
