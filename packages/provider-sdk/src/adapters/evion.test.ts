import { describe, expect, it, vi } from 'vitest'
import { createEvionProvider } from './evion.ts'
import { createRivestreamProvider } from './rivestream.ts'
import type { ProviderHttp } from './http.ts'

const input = { ref: { kind: 'series' as const, id: 1399, season: 2, episode: 3 }, region: 'US', audioLanguage: 'en' }
const now = () => Date.parse('2026-10-03T00:00:00Z')
function fixture(options: { source?: string; foreignCaption?: boolean; blocked?: boolean; malformed?: boolean; empty?: boolean } = {}) {
  return vi.fn<ProviderHttp>(async (url, _headers, _signal, request) => {
    const text = url.includes('api.bingr.one') ? options.malformed ? '{' : JSON.stringify({ sources: options.empty ? [] : [{ url: options.source ?? 'https://img.animecurx.tech/master.m3u8', quality: '1080p', type: 'application/x-mpegURL' }, { url: options.source ?? 'https://img.animecurx.tech/master.m3u8' }] })
      : url.endsWith('/master.m3u8') ? '#EXTM3U\n' + (options.foreignCaption ? '#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="subs",NAME="English",URI="https://evil.example/en.vtt"\n' : '') + '#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=1920x1080\nvariant.m3u8'
        : url.endsWith('/variant.m3u8') ? '#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\nsegment.ts\n#EXT-X-ENDLIST' : 'x'.repeat(2000)
    return { url, text, status: options.blocked && request?.readPrefixBytes ? 403 : 200, headers: new Headers({ 'content-type': request?.readPrefixBytes ? 'video/mp2t' : 'text/plain' }) }
  })
}
describe('Evion TV adapter', () => {
  it('uses the exact TV endpoint and validates direct master, variant, and segment without playback headers', async () => {
    const http = fixture()
    expect(await createEvionProvider(http, now).resolve(input, new AbortController().signal)).toMatchObject({ ok: true, sources: [{ url: 'https://img.animecurx.tech/master.m3u8', type: 'hls', height: 1080, qualityHint: '1080p', headers: {}, language: 'original' }] })
    expect(http.mock.calls[0]?.[0]).toBe('https://api.bingr.one/api/stream/aphelion-tv/1399/2/3')
    expect(http.mock.calls).toHaveLength(4)
    expect(http.mock.calls[3]?.[3]).toEqual({ readPrefixBytes: 16_384 })
    expect(http.mock.calls.slice(1).every(([, headers]) => !headers.origin && !headers.referer)).toBe(true)
  })
  it.each([{ kind: 'movie' as const, id: 1399 }, { kind: 'anime' as const, id: 1399, episode: 3 }])('rejects $kind before any upstream call', async ref => {
    const http = fixture()
    expect(await createEvionProvider(http).resolve({ ...input, ref }, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
    expect(http).not.toHaveBeenCalled()
  })
  it.each([{ source: 'https://evil.example/master.m3u8' }, { source: 'https://img.animecurx.tech/proxy?url=https://evil.example/master.m3u8' }, { source: 'http://img.animecurx.tech/master.m3u8' }, { foreignCaption: true }, { blocked: true }, { malformed: true }, { empty: true }])('returns no source for unsafe, malformed, missing, or blocked delivery: %j', async options => {
    expect(await createEvionProvider(fixture(options), now).resolve(input, new AbortController().signal)).toMatchObject({ ok: false })
  })
  it('excludes Apogee from combined video resolution for movies and TV', async () => {
    const http = vi.fn<ProviderHttp>(async url => ({ url, status: 200, text: '{}' }))
    for (const ref of [input.ref, { kind: 'movie' as const, id: 550 }]) await createRivestreamProvider(http).resolve({ ...input, ref }, new AbortController().signal)
    expect(http.mock.calls.some(([url]) => new URL(url).searchParams.get('provider') === 'apogee')).toBe(false)
  })
})
