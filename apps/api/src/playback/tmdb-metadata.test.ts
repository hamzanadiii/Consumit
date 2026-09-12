import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { createTmdbMetadataResolver } from './tmdb-metadata.ts'
import type { MediaTransport } from './transport.ts'

function transport(body: unknown, status = 200): MediaTransport {
  return vi.fn(async (url) => ({ status, url, headers: new Headers(), body: Readable.from([typeof body === 'string' ? body : JSON.stringify(body)]) }))
}

describe('canonical TMDB title metadata', () => {
  it('resolves movie title, year, and IMDb id with caching', async () => {
    const fetch = transport({ title: 'Fight Club', release_date: '1999-10-15', runtime: 139, external_ids: { imdb_id: 'tt0137523' } })
    const resolve = createTmdbMetadataResolver('token', fetch)
    const ref = { kind: 'movie' as const, id: 550 }
    expect(await resolve(ref, new AbortController().signal)).toEqual({ title: 'Fight Club', year: 1999, imdbId: 'tt0137523', runtimeSec: 8340 })
    expect(await resolve(ref, new AbortController().signal)).toEqual({ title: 'Fight Club', year: 1999, imdbId: 'tt0137523', runtimeSec: 8340 })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe('https://api.themoviedb.org/3/movie/550?append_to_response=external_ids')
  })
  it('resolves series titles without IMDb ids and rejects incomplete metadata', async () => {
    const resolve = createTmdbMetadataResolver('token', transport({ name: 'Dark', first_air_date: '2017-12-01', episode_run_time: [53], external_ids: {} }))
    expect(await resolve({ kind: 'series', id: 1399, season: 1, episode: 1 }, new AbortController().signal)).toEqual({ title: 'Dark', year: 2017, runtimeSec: 3180 })
    await expect(createTmdbMetadataResolver('token', transport({}))({ kind: 'movie', id: 1 }, new AbortController().signal)).rejects.toThrow('incomplete')
    await expect(createTmdbMetadataResolver('token', transport({}, 404))({ kind: 'movie', id: 1 }, new AbortController().signal)).rejects.toThrow('unavailable')
    expect(() => createTmdbMetadataResolver('  ')).toThrow('TMDB_API_READ_TOKEN')
  })
})
