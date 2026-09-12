import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { createTmdbIdentityResolver } from './tmdb-identity.ts'
import type { MediaTransport } from './transport.ts'

describe('TMDB provider identity resolver', () => {
  it('maps movie and series identities with a bounded server-side request and caches the result', async () => {
    const transport = vi.fn<MediaTransport>(async (url) => ({
      status: 200,
      url,
      headers: new Headers({ 'content-type': 'application/json' }),
      body: Readable.from([JSON.stringify({ imdb_id: url.includes('/movie/') ? 'tt1234567' : 'tt7654321' })]),
    }))
    const resolve = createTmdbIdentityResolver('test-token', transport)
    await expect(resolve({ kind: 'movie', id: 12 }, new AbortController().signal)).resolves.toEqual({ imdbId: 'tt1234567' })
    await expect(resolve({ kind: 'movie', id: 12 }, new AbortController().signal)).resolves.toEqual({ imdbId: 'tt1234567' })
    await expect(resolve({ kind: 'series', id: 34, season: 2, episode: 5 }, new AbortController().signal)).resolves.toEqual({ imdbId: 'tt7654321' })
    expect(transport).toHaveBeenCalledTimes(2)
    expect(transport.mock.calls[0]?.[0]).toBe('https://api.themoviedb.org/3/movie/12/external_ids')
    expect(transport.mock.calls[1]?.[0]).toBe('https://api.themoviedb.org/3/tv/34/external_ids')
    expect(transport.mock.calls[0]?.[1]).toEqual(['api.themoviedb.org'])
    expect(transport.mock.calls[0]?.[2]).toMatchObject({ authorization: 'Bearer test-token' })
  })
  it('rejects missing credentials and malformed external identifiers', async () => {
    expect(() => createTmdbIdentityResolver('')).toThrow('TMDB_API_READ_TOKEN')
    const transport = vi.fn<MediaTransport>(async (url) => ({ status: 200, url, headers: new Headers(), body: Readable.from(['{"imdb_id":"bad"}']) }))
    await expect(createTmdbIdentityResolver('token', transport)({ kind: 'movie', id: 1 }, new AbortController().signal)).rejects.toThrow()
  })
})
