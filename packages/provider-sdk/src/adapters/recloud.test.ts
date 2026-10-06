import { describe, expect, it, vi } from 'vitest'
import { createRecloudProvider } from './recloud.ts'
import type { ProviderHttp, ProviderHttpResponse } from './http.ts'

const origin = 'https://cdn.4animo.xyz'
const now = () => Date.parse('2026-10-02T00:00:00Z')
const input = { ref: { kind: 'anime' as const, id: 16498, episode: 3 }, region: 'US', audioLanguage: 'ja' }
function fixture(options: { missing?: boolean; source?: string; declaredAudio?: string; page?: string; invalidPlaylist?: boolean; foreignSegment?: boolean; segmentFailed?: boolean } = {}) {
  return vi.fn<ProviderHttp>(async (url, _headers, _signal, request) => {
    let status = 200, text = ''
    const path = new URL(url).pathname
    if (path.startsWith('/embed')) text = options.page ?? "const sourcesUrl = '/stream/getSources?t=fixture';"
    else if (path === '/stream/getSources') {
      if (options.missing) status = 404
      text = JSON.stringify({ sources: [{ file: options.source ?? '/p?t=fixture', ...(options.declaredAudio ? { audio: options.declaredAudio } : {}) }],
        tracks: [{ file: '/caption?t=fixture', label: 'English', kind: 'captions' }, { file: 'https://unapproved.example/caption.vtt', label: 'Unknown' }], intro: { start: 10, end: 80 } })
    } else if (path === '/p') text = options.invalidPlaylist ? '<html>blocked</html>' : '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=1920x1080\n/variant?t=fixture'
    else if (path === '/variant') text = '#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\n' + (options.foreignSegment ? 'https://unapproved.example/segment.ts' : '/segment?t=fixture')
    else if (path === '/segment') { text = 'x'.repeat(2000); if (options.segmentFailed) status = 403 }
    else throw new Error('Unexpected fixture request')
    const response: ProviderHttpResponse = { url, status, text, headers: new Headers({ 'content-type': request?.readPrefixBytes ? 'video/mp2t' : 'text/plain' }) }
    return response
  })
}

describe('Recloud anime adapter', () => {
  it.each([['ja', 'sub', 'original'], ['en', 'dub', 'en'], ['en-US', 'dub', 'en']])('resolves the exact %s lane through native AniList identity', async (audioLanguage, lane, language) => {
    const http = fixture()
    const result = await createRecloudProvider(http, now).resolve({ ...input, audioLanguage }, new AbortController().signal)
    expect(result).toMatchObject({ ok: true, sources: [{ key: `hd:${lane}:3`, url: `${origin}/p?t=fixture`, type: 'hls', language, headers: {}, qualityHint: 'auto',
      subtitles: [{ language: 'en', url: `${origin}/caption?t=fixture` }], skipSegments: [{ kind: 'intro', start: 10, end: 80 }] }] })
    expect(http.mock.calls[0]?.[0]).toBe(`${origin}/embed/ani/16498/3/${lane}?k=1`)
    expect(http.mock.calls[1]?.[1]).toMatchObject({ origin, referer: `${origin}/embed/ani/16498/3/${lane}?k=1` })
    expect(http.mock.calls).toHaveLength(5)
    expect(http.mock.calls[4]?.[3]).toEqual({ readPrefixBytes: 16_384 })
    expect(http.mock.calls.slice(2).every(([, headers]) => !headers.referer && !headers.origin)).toBe(true)
  })

  it('tries server slots only within DUB and never silently requests SUB', async () => {
    const http = fixture({ missing: true })
    const result = await createRecloudProvider(http, now).resolve({ ...input, audioLanguage: 'en' }, new AbortController().signal)
    expect(result).toEqual({ ok: false, code: 'empty', retryable: false })
    expect(http.mock.calls.filter(([url]) => new URL(url).pathname.startsWith('/embed')).map(([url]) => url)).toEqual([
      `${origin}/embed/ani/16498/3/dub?k=1`, `${origin}/embed/1/ani/16498/3/dub?k=1`, `${origin}/embed/2/ani/16498/3/dub?k=1`,
    ])
    expect(http.mock.calls.some(([url]) => url.includes('/sub'))).toBe(false)
  })

  it('rejects an explicitly original track returned for DUB', async () => {
    const http = fixture({ declaredAudio: 'sub' })
    expect(await createRecloudProvider(http, now).resolve({ ...input, audioLanguage: 'en' }, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
    expect(http.mock.calls.some(([url]) => new URL(url).pathname === '/p')).toBe(false)
  })

  it.each([
    { page: "sourcesUrl = 'https://unapproved.example/stream/getSources';" },
    { source: 'https://unapproved.example/master.m3u8' },
    { source: '/proxy?url=https://media.example/master.m3u8' },
    { source: 'https://user:password@cdn.4animo.xyz/p?t=fixture' },
    { invalidPlaylist: true }, { foreignSegment: true }, { segmentFailed: true },
  ])('rejects hostile, invalid, or unplayable delivery %#', async options => {
    const http = fixture(options)
    expect(await createRecloudProvider(http, now).resolve(input, new AbortController().signal)).toMatchObject({ ok: false })
    expect(http.mock.calls.every(([url]) => new URL(url).hostname === 'cdn.4animo.xyz')).toBe(true)
  })

  it('does not request upstream for non-anime, unsupported language, or a cancelled request', async () => {
    const http = fixture(), provider = createRecloudProvider(http, now)
    const controller = new AbortController()
    controller.abort()
    expect(await provider.resolve(input, controller.signal)).toMatchObject({ ok: false, code: 'cancelled' })
    expect(await provider.resolve({ ...input, ref: { kind: 'movie', id: 550 } }, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
    expect(await provider.resolve({ ...input, audioLanguage: 'fr' }, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
    expect(http).not.toHaveBeenCalled()
  })
})
