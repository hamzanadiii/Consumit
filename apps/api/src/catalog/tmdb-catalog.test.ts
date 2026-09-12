import { describe, expect, it, vi } from 'vitest'

import { createTmdbCatalog } from './tmdb-catalog.ts'

const configuration = {
  images: {
    backdrop_sizes: ['w780', 'w1280', 'original'],
    logo_sizes: ['w92', 'w500', 'original'],
    poster_sizes: ['w342', 'w500', 'original'],
    profile_sizes: ['w185', 'original'],
    secure_base_url: 'https://image.tmdb.org/t/p/',
    still_sizes: ['w300', 'w780', 'original'],
  },
}

const genres = { genres: [{ id: 18, name: 'Drama' }] }

const movieSummary = {
  adult: false,
  backdrop_path: '/movie-backdrop.jpg',
  genre_ids: [18],
  id: 550,
  original_title: 'Fight Club',
  overview: 'An insomniac meets a soap maker.',
  popularity: 80,
  poster_path: '/movie-poster.jpg',
  release_date: '1999-10-15',
  title: 'Fight Club',
  vote_average: 8.4,
  vote_count: 30_000,
}

const seriesSummary = {
  adult: false,
  backdrop_path: '/series-backdrop.jpg',
  first_air_date: '2011-04-17',
  genre_ids: [18],
  id: 1399,
  name: 'Game of Thrones',
  original_name: 'Game of Thrones',
  overview: 'Seven kingdoms contend for power.',
  popularity: 90,
  poster_path: '/series-poster.jpg',
  vote_average: 8.5,
  vote_count: 20_000,
}

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    headers: { 'content-type': 'application/json' },
    ...init,
  })
}

function supportingResponse(url: URL) {
  if (url.pathname === '/3/configuration') return json(configuration)
  if (url.pathname.startsWith('/3/genre/')) return json(genres)
  throw new Error(`Unexpected supporting request: ${url}`)
}

describe('TMDB catalog adapter', () => {
  it.each(['movie', 'series'] as const)('maps %s filters to discovery and isolates cached queries', async (kind) => {
    const requests: URL[] = []
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      if (url.pathname.startsWith('/3/discover/')) {
        requests.push(url)
        return json({ page: 2, results: [kind === 'movie' ? movieSummary : seriesSummary], total_pages: 3, total_results: 50 })
      }
      return supportingResponse(url)
    })
    const catalog = createTmdbCatalog({ fetch: fetchMock, token: 'test-token' })
    const query = { kind, feed: 'top-rated' as const, genre: 'Drama', page: 2, year: 2024 }
    expect((await catalog.discover(query)).page).toBe(2)
    await catalog.discover(query)
    await catalog.discover({ ...query, year: 2023 })
    expect(requests).toHaveLength(2)
    expect(requests[0]?.pathname).toBe(`/3/discover/${kind === 'movie' ? 'movie' : 'tv'}`)
    expect(Object.fromEntries(requests[0]!.searchParams)).toMatchObject({
      include_adult: 'false', page: '2', sort_by: 'vote_average.desc', 'vote_count.gte': '200', with_genres: '18',
      [kind === 'movie' ? 'primary_release_year' : 'first_air_date_year']: '2024',
    })
    await expect(catalog.discover({ ...query, genre: 'Unknown genre' })).rejects.toMatchObject({ code: 'CATALOG_INVALID_QUERY' })
  })

  it('normalizes real movie search data and filters adult results', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      if (url.pathname === '/3/search/movie') {
        return json({
          page: 1,
          results: [movieSummary, { ...movieSummary, adult: true, id: 551 }],
          total_pages: 1,
          total_results: 2,
        })
      }
      return supportingResponse(url)
    })
    const catalog = createTmdbCatalog({ fetch: fetchMock, token: 'test-token' })

    const result = await catalog.search({ kind: 'movie', page: 1, query: 'Fight Club' })

    expect(result.items).toHaveLength(1)
    expect(result.items[0]).toEqual(expect.objectContaining({
      backdropUrl: 'https://image.tmdb.org/t/p/w1280/movie-backdrop.jpg',
      genreNames: ['Drama'],
      id: 550,
      kind: 'movie',
      posterUrl: 'https://image.tmdb.org/t/p/w500/movie-poster.jpg',
      title: 'Fight Club',
      year: 1999,
    }))
    expect(fetchMock).toHaveBeenCalledWith(
      expect.objectContaining({ pathname: '/3/search/movie' }),
      expect.objectContaining({ headers: expect.objectContaining({ authorization: 'Bearer test-token' }) }),
    )
  })

  it('normalizes series details and regular seasons', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      if (url.pathname === '/3/tv/1399') {
        return json({
          ...seriesSummary,
          aggregate_credits: { cast: [], crew: [] },
          content_ratings: { results: [{ iso_3166_1: 'US', rating: 'TV-MA' }] },
          created_by: [],
          episode_run_time: [58],
          genres: [{ id: 18, name: 'Drama' }],
          homepage: 'https://example.com/show',
          origin_country: ['US'],
          recommendations: { page: 1, results: [seriesSummary], total_pages: 1, total_results: 1 },
          seasons: [
            { air_date: null, episode_count: 4, name: 'Specials', poster_path: null, season_number: 0 },
            { air_date: '2011-04-17', episode_count: 10, name: 'Season 1', poster_path: '/season.jpg', season_number: 1 },
          ],
          spoken_languages: [{ english_name: 'English' }],
          status: 'Ended',
          tagline: 'Winter is coming.',
        })
      }
      return supportingResponse(url)
    })
    const catalog = createTmdbCatalog({ fetch: fetchMock, token: 'test-token' })

    const result = await catalog.title('series', 1399)

    expect(result.item).toEqual(expect.objectContaining({
      contentRating: 'TV-MA',
      episodeRuntimeMinutes: 58,
      kind: 'series',
      title: 'Game of Thrones',
    }))
    expect(result.item.kind === 'series' ? result.item.seasons : []).toEqual([
      expect.objectContaining({ name: 'Season 1', number: 1 }),
    ])
    expect(fetchMock.mock.calls[0]?.[0].toString()).toContain('append_to_response=aggregate_credits%2Crecommendations%2Ccontent_ratings%2Cimages')
  })

  it('treats an empty upstream homepage as no homepage', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      if (url.pathname === '/3/movie/38047') {
        return json({
          ...movieSummary,
          credits: { cast: [], crew: [] },
          genres: [{ id: 18, name: 'Drama' }],
          homepage: '',
          id: 38047,
          recommendations: { page: 1, results: [], total_pages: 0, total_results: 0 },
          release_dates: { results: [] },
          runtime: 218,
          status: 'Released',
          tagline: '',
        })
      }
      return supportingResponse(url)
    })
    const catalog = createTmdbCatalog({ fetch: fetchMock, token: 'test-token' })

    const result = await catalog.title('movie', 38047)

    expect(result.item.kind === 'movie' ? result.item.homepageUrl : null).toBeNull()
  })

  it.each([
    {
      logos: [
        { file_path: '/logo-fr.svg', iso_639_1: 'fr' },
        { file_path: '/logo-en.png', iso_639_1: 'en' },
        { file_path: '/logo-none.png', iso_639_1: null },
      ],
      name: 'prefers the English artwork logo',
      wanted: 'https://image.tmdb.org/t/p/w500/logo-en.png',
    },
    {
      logos: [{ file_path: '/logo-none.png', iso_639_1: null }],
      name: 'falls back to language-free artwork logos',
      wanted: 'https://image.tmdb.org/t/p/w500/logo-none.png',
    },
    {
      logos: [],
      name: 'leaves logoUrl empty when TMDB has no artwork logo',
      wanted: null,
    },
  ])('resolves the hero artwork logo: $name', async ({ logos, wanted }) => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      if (url.pathname === '/3/movie/550') {
        return json({
          ...movieSummary,
          credits: { cast: [], crew: [] },
          genres: [{ id: 18, name: 'Drama' }],
          homepage: null,
          images: { logos },
          recommendations: { page: 1, results: [], total_pages: 0, total_results: 0 },
          release_dates: { results: [] },
          runtime: 139,
          status: 'Released',
          tagline: 'Mischief. Mayhem. Soap.',
        })
      }
      return supportingResponse(url)
    })
    const catalog = createTmdbCatalog({ fetch: fetchMock, token: 'test-token' })

    const result = await catalog.title('movie', 550)

    expect(result.item.logoUrl).toBe(wanted)
    expect(fetchMock.mock.calls[0]?.[0].toString()).toContain('append_to_response=credits%2Crecommendations%2Crelease_dates%2Cimages')
  })

  it('normalizes episode data for a season', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      if (url.pathname === '/3/tv/1399/season/1') {
        return json({
          episodes: [{
            air_date: '2011-04-17',
            episode_number: 1,
            id: 63056,
            name: 'Winter Is Coming',
            overview: 'The royal family arrives.',
            runtime: 62,
            season_number: 1,
            still_path: '/episode.jpg',
          }],
          name: 'Season 1',
          overview: '',
          poster_path: '/season.jpg',
          season_number: 1,
        })
      }
      return supportingResponse(url)
    })
    const catalog = createTmdbCatalog({ fetch: fetchMock, token: 'test-token' })

    const result = await catalog.season(1399, 1)

    expect(result.item.episodes[0]).toEqual(expect.objectContaining({
      stillUrl: 'https://image.tmdb.org/t/p/w780/episode.jpg',
      title: 'Winter Is Coming',
    }))
  })

  it('resolves an IMDb identifier through TMDB find and excludes adult movies', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      if (url.pathname === '/3/find/tt0117500') return json({ movie_results: [{ ...movieSummary, id: 77 }, { ...movieSummary, adult: true, id: 78 }] })
      return supportingResponse(url)
    })
    const catalog = createTmdbCatalog({ fetch: fetchMock, token: 'test-token' })
    await expect(catalog.movieByExternalId('tt0117500')).resolves.toMatchObject({ id: 77, kind: 'movie' })
    expect(fetchMock.mock.calls[0]?.[0].toString()).toContain('external_source=imdb_id')
  })

  it('retries throttled requests once', async () => {
    let attempts = 0
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      if (url.pathname === '/3/trending/movie/week') {
        attempts += 1
        if (attempts === 1) return json({}, { headers: { 'retry-after': '0' }, status: 429 })
        return json({ page: 1, results: [movieSummary], total_pages: 1, total_results: 1 })
      }
      return supportingResponse(url)
    })
    const sleep = vi.fn(async () => undefined)
    const catalog = createTmdbCatalog({ fetch: fetchMock, sleep, token: 'test-token' })

    const result = await catalog.discover({ feed: 'trending', kind: 'movie', page: 1 })

    expect(result.items).toHaveLength(1)
    expect(attempts).toBe(2)
    expect(sleep).toHaveBeenCalledWith(0)
  })

  it.each([
    [401, 'CATALOG_UNAVAILABLE'],
    [404, 'CATALOG_NOT_FOUND'],
    [503, 'CATALOG_UNAVAILABLE'],
  ] as const)('maps an upstream %s response to %s', async (status, code) => {
    const catalog = createTmdbCatalog({
      fetch: vi.fn(async () => json({}, { status })),
      sleep: async () => undefined,
      token: 'test-token',
    })

    await expect(catalog.title('movie', 550)).rejects.toMatchObject({ code })
  })

  it('rejects malformed upstream detail payloads', async () => {
    const catalog = createTmdbCatalog({
      fetch: vi.fn(async () => json({ id: 'wrong' })),
      token: 'test-token',
    })

    await expect(catalog.title('movie', 550)).rejects.toMatchObject({
      code: 'CATALOG_UNAVAILABLE',
    })
  })

  it('maps a repeated network timeout to a retryable unavailable error', async () => {
    const fetchMock = vi.fn(async () => { throw new DOMException('timed out', 'TimeoutError') })
    const catalog = createTmdbCatalog({
      fetch: fetchMock,
      sleep: async () => undefined,
      token: 'test-token',
    })

    await expect(catalog.title('movie', 550)).rejects.toMatchObject({
      code: 'CATALOG_UNAVAILABLE',
      retryable: true,
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
