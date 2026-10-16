import { describe, expect, it, vi } from 'vitest'
import { createPurstreamProvider } from './purstream.ts'
import type { ProviderHttp } from './http.ts'

const input = { ref: { kind: 'movie' as const, id: 550 }, region: 'US', audioLanguage: 'en' }
const now = () => Date.parse('2026-10-03T00:00:00Z')
const metadata = vi.fn(async () => ({ title: 'Fight Club', year: 1999 }))

function fixture(options: { search?: unknown; streams?: unknown; status?: number } = {}) {
  const search = options.search ?? { data: { items: { movies: { items: [
    { id: 'tt0137523', type: 'film', title: 'Fight Club', release_date: '1999-10-15' },
    { id: 'other', type: 'film', title: 'Unrelated Title', release_date: '2001-01-01' },
  ] } } } }
  const streams = options.streams ?? { type: 'success', data: { items: { sources: [
    { stream_url: 'https://free.finepulfe.xyz/movies/550-abc/hd/master.m3u8' },
    { stream_url: 'https://free.finepulfe.xyz/movies/550-abc/hd/master.m3u8' },
  ] } } }
  return vi.fn<ProviderHttp>(async (url) => {
    if (url.includes('/search-bar/search/')) return { url, status: 200, text: JSON.stringify(search) }
    return { url, status: options.status ?? 200, text: JSON.stringify(streams) }
  })
}

describe('Purstream adapter', () => {
  it('searches by resolved title and returns direct de-duplicated masters', async () => {
    const http = fixture()
    const result = await createPurstreamProvider(http, metadata, now).resolve(input, new AbortController().signal)
    expect(metadata).toHaveBeenCalledWith(input.ref, expect.any(AbortSignal))
    expect(result).toMatchObject({ ok: true, sources: [{ url: 'https://free.finepulfe.xyz/movies/550-abc/hd/master.m3u8', type: 'hls', qualityHint: 'Auto', hlsSubtitlePlaylistFormat: 'vtt', headers: {}, language: 'original' }] })
    expect(result.ok && result.sources).toHaveLength(1)
    expect(http.mock.calls[0]?.[0]).toContain('/search-bar/search/Fight%20Club')
    expect(http.mock.calls[1]?.[0]).toBe('https://api.purstream.ad/api/v1/stream/tt0137523')
  })
  it('does not mistake a sequel with overlapping words for the requested movie', async () => {
    const http = fixture({ search: { data: { items: { movies: { items: [
      { id: 'dune-part-two', type: 'movie', title: 'Dune: Part Two', release_date: '2024-02-27' },
    ] } } } } })
    const result = await createPurstreamProvider(
      http,
      async () => ({ title: 'Dune', year: 2021 }),
      now,
    ).resolve(input, new AbortController().signal)

    expect(result).toMatchObject({ ok: false, code: 'empty' })
    expect(http).toHaveBeenCalledTimes(1)
  })
  it('rejects an exact title from the wrong release year', async () => {
    const http = fixture({ search: { data: { items: { movies: { items: [
      { id: 'wrong-year', type: 'movie', title: 'Dune', release_date: '1984-12-14' },
    ] } } } } })
    const result = await createPurstreamProvider(http, async () => ({ title: 'Dune', year: 2021 }), now)
      .resolve(input, new AbortController().signal)

    expect(result).toMatchObject({ ok: false, code: 'empty' })
    expect(http).toHaveBeenCalledTimes(1)
  })
  it('fails closed when exact title results remain ambiguous', async () => {
    const http = fixture({ search: { data: { items: { movies: { items: [
      { id: 'first', type: 'movie', title: 'Dune', release_date: '2021-10-22' },
      { id: 'second', type: 'film', title: 'Dune', release_date: '2021-10-22' },
    ] } } } } })
    const result = await createPurstreamProvider(http, async () => ({ title: 'Dune', year: 2021 }), now)
      .resolve(input, new AbortController().signal)

    expect(result).toMatchObject({ ok: false, code: 'empty' })
    expect(http).toHaveBeenCalledTimes(1)
  })
  it.each([{ type: 'show', id: 'tt0903747' }, { type: 'tv', id: 3852 }])('matches series rows labeled $type and calls the episode endpoint', async ({ type, id }) => {
    const http = fixture({ search: { data: { items: { movies: { items: [
      { id, type, title: 'Breaking Bad', release_date: '2008-01-20' },
    ] } } } } })
    const series = { ref: { kind: 'series' as const, id: 1396, season: 2, episode: 3 }, region: 'US', audioLanguage: 'en' }
    const result = await createPurstreamProvider(http, async () => ({ title: 'Breaking Bad', year: 2008 }), now).resolve(series, new AbortController().signal)
    expect(result).toMatchObject({ ok: true })
    expect(http.mock.calls[1]?.[0]).toBe(`https://api.purstream.ad/api/v1/stream/${id}/episode?season=2&episode=3`)
  })
  it.each([
    { search: { data: { items: { movies: { items: [] } } } } },
    { search: { data: { items: { movies: { items: null } } } } },
    { search: { nope: true } },
    { streams: { type: 'error' } },
    { streams: { type: 'success', data: { items: { sources: [{ stream_url: 'https://evil.example/embed/x' }] } } } },
    { streams: { type: 'success', data: { items: { sources: [{ stream_url: 'http://free.finepulfe.xyz/x.m3u8' }] } } } },
    { status: 500 },
  ])('returns no source for missing, rejected, or unsafe delivery: %j', async (options) => {
    expect(await createPurstreamProvider(fixture(options), metadata, now).resolve(input, new AbortController().signal)).toMatchObject({ ok: false })
  })
})
