import { afterEach, expect, it, vi } from 'vitest'
import { fetchEmbedStreams, loadEmbedMovieContext } from './embed-data'

vi.mock('../../lib/catalog-api', () => ({ getCatalogTitle: vi.fn().mockRejectedValue(new Error('Catalog unavailable')) }))
vi.mock('../../lib/anime-api', () => ({ getAnimeTitle: vi.fn().mockRejectedValue(new Error('Catalog unavailable')) }))
afterEach(() => vi.unstubAllGlobals())
const valid = { url: 'https://media.example/video.mp4', type: 'native', provider: 'legacy', headers: { referer: 'https://provider.example/' } }

it('preserves valid legacy sources and bounds the server request', async () => {
  const request = vi.fn().mockResolvedValue(Response.json({ success: true, sources: [valid] }))
  vi.stubGlobal('fetch', request)
  expect(await fetchEmbedStreams('/v1/embed/movie/1')).toEqual({ sources: [{ ...valid, quality: 'Auto' }], subtitles: [] })
  expect(request.mock.calls[0]?.[1].signal).toBeInstanceOf(AbortSignal)
})

it.each([
  { ...valid, url: 'javascript:alert(1)' }, { ...valid, url: 'https://127.0.0.1/private' },
  { ...valid, url: 'https://user:secret@media.example/video.mp4' }, { ...valid, headers: { cookie: 'private' } },
  { ...valid, type: 'iframe' }, { ...valid, provider: 42 },
])('rejects hostile or malformed legacy source input', async source => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ success: true, sources: [source] })))
  expect(await fetchEmbedStreams('/v1/embed/movie/1')).toEqual({ sources: [], subtitles: [] })
})

it('keeps the empty state on unavailable retired endpoints and an honest catalog fallback', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('Timed out', 'TimeoutError')))
  expect(await fetchEmbedStreams('/v1/embed/movie/1')).toEqual({ sources: [], subtitles: [] })
  expect((await loadEmbedMovieContext(1)).title).toBe('Movie 1')
})
