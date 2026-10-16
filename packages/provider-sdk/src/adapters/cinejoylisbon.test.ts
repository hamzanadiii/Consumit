import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCinejoyLisbonProvider } from './cinejoylisbon.ts'
import type { ProviderHttp } from './http.ts'

// Crypto has independent external vectors; these fixtures exercise HTTP,
// title identity, delivery validation, and CDN failure behavior.
vi.mock('./cinejoy-gate.ts', () => ({ sealCinejoyRequest: (data: string) => ({ body: Buffer.from(data), open: (bytes: Uint8Array) => Buffer.from(bytes).toString('utf8') }) }))
const input = { ref: { kind: 'movie' as const, id: 550 }, region: 'US', audioLanguage: 'en' }
const metadata = vi.fn(async () => ({ title: 'Fight Club', year: 1999, imdbId: 'tt0137523' }))
const root = 'https://lit.cheaptruckrepairs.cc/title/master.m3u8'
const master = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000000,RESOLUTION=1920x1080\nvideo.m3u8'
const media = '#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\nsegment.ts\n#EXT-X-ENDLIST'
function client(playlist = root, segmentStatus = 206, playlistText = media) {
  return vi.fn<ProviderHttp>(async (url, _headers, _signal, init) => {
    if (url.endsWith('/g')) {
      const { path } = JSON.parse(Buffer.from(init!.body!).toString())
      const bytes = Buffer.from(JSON.stringify({ data: { stream: path.startsWith('/Lisbon/') ? [{ playlist }] : [] } }))
      return { url, status: 200, text: '', bytes }
    }
    const text = url.endsWith('/master.m3u8') ? master : url.endsWith('/video.m3u8') ? playlistText : 'a'.repeat(1024)
    return { url, status: url.endsWith('/segment.ts') ? segmentStatus : 200, text }
  })
}

describe('CineJoy Lisbon direct adapter', () => {
  beforeEach(() => metadata.mockClear())
  it('posts native envelopes for direct chips, measures quality, and probes a bounded segment', async () => {
    const http = client()
    const result = await createCinejoyLisbonProvider(http, metadata).resolve(input, new AbortController().signal)
    expect(result).toMatchObject({ ok: true, sources: [{ url: root, height: 1080, headers: {}, type: 'hls' }] })
    const posts = http.mock.calls.filter(([url]) => url.endsWith('/g'))
    expect(posts.map(call => JSON.parse(Buffer.from(call[3]!.body!).toString()))).toEqual([
      { path: '/Lisbon/movie', payload: { tmdb: '550', imdb: 'tt0137523', year: '1999', title: 'Fight Club' } },
      { path: '/Scout/movie', payload: { tmdb: '550', imdb: 'tt0137523', year: '1999', title: 'Fight Club' } },
    ])
    expect(posts.every(call => call[3]?.method === 'POST')).toBe(true)
    expect(http.mock.calls.at(-1)).toEqual([expect.stringContaining('/segment.ts'), expect.objectContaining({ range: 'bytes=0-1023' }), expect.any(AbortSignal), { readPrefixBytes: 1024 }])
    expect(http.mock.calls.some(([url]) => /wasm|servers|info/.test(url))).toBe(false)
  })
  it('preserves the exact episode in a series request and rejects anime before any I/O', async () => {
    const http = client()
    await createCinejoyLisbonProvider(http, metadata).resolve({ ...input, ref: { kind: 'series', id: 1399, season: 3, episode: 4 } }, new AbortController().signal)
    expect(JSON.parse(Buffer.from(http.mock.calls[0]![3]!.body!).toString())).toMatchObject({ path: '/Lisbon/series', payload: { tmdb: '1399', season: '3', episode: '4' } })
    http.mockClear(); metadata.mockClear()
    expect(await createCinejoyLisbonProvider(http, metadata).resolve({ ...input, ref: { kind: 'anime', id: 550, episode: 1 } }, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
    expect(metadata).not.toHaveBeenCalled(); expect(http).not.toHaveBeenCalled()
  })
  it.each(['https://proxy.valhallastream.com/proxy?url=https://lit.cheaptruckrepairs.cc/master.m3u8', 'https://foreign.example/master.m3u8', 'http://lit.cheaptruckrepairs.cc/master.m3u8'])('drops non-direct or unapproved roots: %s', async playlist => {
    const http = client(playlist)
    expect(await createCinejoyLisbonProvider(http, metadata).resolve(input, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
    expect(http.mock.calls).toHaveLength(2)
  })
  it('drops off-host nested keys before loading a segment', async () => {
    const http = client(root, 206, media.replace('#EXTINF:6,', '#EXT-X-KEY:METHOD=AES-128,URI="https://foreign.example/key"\n#EXTINF:6,'))
    expect(await createCinejoyLisbonProvider(http, metadata).resolve(input, new AbortController().signal)).toMatchObject({ ok: false, code: 'empty' })
    expect(http.mock.calls.some(([url]) => url.endsWith('/segment.ts') || url.includes('foreign.example'))).toBe(false)
  })
  it('does not return a playable source when the CDN only serves playlists', async () => {
    expect(await createCinejoyLisbonProvider(client(root, 502), metadata).resolve(input, new AbortController().signal)).toMatchObject({ ok: false, code: 'unavailable' })
  })
  it('fails malformed encrypted documents and already cancelled attempts', async () => {
    const http = vi.fn<ProviderHttp>(async url => ({ url, status: 200, text: '', bytes: Buffer.from('not json') }))
    expect(await createCinejoyLisbonProvider(http, metadata).resolve(input, new AbortController().signal)).toMatchObject({ ok: false, code: 'malformed' })
    http.mockClear(); const controller = new AbortController(); controller.abort()
    expect(await createCinejoyLisbonProvider(http, metadata).resolve(input, controller.signal)).toMatchObject({ ok: false, code: 'cancelled' })
    expect(http).not.toHaveBeenCalled()
  })
})
