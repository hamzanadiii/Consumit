import type {
  AnimeBatch,
  AnimeTitleSummary,
  CatalogBatch,
  CatalogMovieDetail,
  CatalogPage,
  CatalogSeasonResponse,
  CatalogTitleResponse,
  CatalogTitleSummary,
} from '@consumit/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildApp } from '../app.ts'
import type { AnimeCatalog } from './anilist/adapter.ts'
import type { Catalog } from './catalog.ts'
import { createFakeCatalog } from './fake-catalog.ts'
import { AnimeError } from '../anime/errors.ts'

const summary: CatalogTitleSummary = {
  backdropUrl: 'https://image.tmdb.org/t/p/w1280/backdrop.jpg',
  genreNames: ['Drama'],
  id: 550,
  kind: 'movie',
  logoUrl: null,
  originalTitle: 'Fight Club',
  overview: 'An insomniac meets a soap maker.',
  popularity: 80,
  posterUrl: 'https://image.tmdb.org/t/p/w500/poster.jpg',
  releaseDate: '1999-10-15',
  title: 'Fight Club',
  tmdbRating: 8.4,
  tmdbVoteCount: 30_000,
  year: 1999,
}

const responseMeta = {
  fetchedAt: '2026-09-06T00:00:00.000Z',
  language: 'en-US',
  region: 'US',
  source: 'tmdb' as const,
  stale: false,
}

const page: CatalogPage = {
  items: [summary],
  meta: responseMeta,
  page: 1,
  totalPages: 1,
  totalResults: 1,
}

const movie: CatalogMovieDetail = {
  ...summary,
  kind: 'movie',
  cast: [],
  certification: 'R',
  countries: ['United States of America'],
  creators: [],
  heroBackdropUrl: null,
  homepageUrl: null,
  languages: ['English'],
  recommendations: [],
  runtimeMinutes: 139,
  status: 'Released',
  tagline: null,
}

const titleResponse: CatalogTitleResponse = { item: movie, meta: responseMeta }
const batchResponse: CatalogBatch = { items: [summary], meta: responseMeta, missing: [] }
const seasonResponse: CatalogSeasonResponse = {
  item: {
    episodes: [],
    name: 'Season 1',
    overview: '',
    posterUrl: null,
    seasonNumber: 1,
    seriesId: 1399,
  },
  meta: responseMeta,
}

function fakeCatalog(): Catalog {
  return {
    batch: vi.fn(async () => batchResponse),
    discover: vi.fn(async () => page),
    movieByExternalId: vi.fn(async () => null),
    search: vi.fn(async () => page),
    season: vi.fn(async () => seasonResponse),
    title: vi.fn(async () => titleResponse),
  }
}

const animeSummary: AnimeTitleSummary = {
  anilistId: 1,
  averageScore: 85,
  bannerImage: null,
  coverImage: { color: null, url: null },
  description: 'A show.',
  episodeDuration: 24,
  episodes: 12,
  format: 'TV',
  genres: ['Drama'],
  kind: 'anime',
  nextAiringEpisode: null,
  popularity: 1_000,
  season: 'SPRING',
  seasonYear: 2024,
  status: 'FINISHED',
  titles: { english: 'Example', native: '日本語', preferred: 'Example', romaji: 'Example' },
}

const animeBatch: AnimeBatch = { items: [animeSummary], missing: [] }

function fakeAnimeCatalog(): AnimeCatalog {
  return {
    airingSchedule: vi.fn(async () => ({ episodes: [], page: 1, totalPages: 0 })),
    batch: vi.fn(async () => animeBatch),
    relations: vi.fn(async () => ({ main: animeSummary, relations: [] })),
    search: vi.fn(async () => ({ items: [animeSummary], page: 1, totalPages: 1, totalResults: 1 })),
    seasonal: vi.fn(async () => ({ items: [animeSummary], page: 1, totalPages: 1, totalResults: 1 })),
    title: vi.fn(async () => ({ ...animeSummary, characters: [], countryOfOrigin: 'JP', externalLinks: [], logoUrl: null, malId: null, recommendations: [], source: null, staff: [], streamingEpisodes: [], trailer: null })),
    trending: vi.fn(async () => ({ items: [animeSummary], page: 1, totalPages: 1, totalResults: 1 })),
  }
}

const openApps: Awaited<ReturnType<typeof buildApp>>[] = []

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()))
})

describe('catalog routes', () => {
  it('validates discovery filters before invoking the adapter', async () => {
    const catalog = fakeCatalog()
    const app = await buildApp({ catalog })
    openApps.push(app)
    const valid = await app.inject({ method: 'GET', url: '/v1/titles/discover?kind=movie&feed=popular&genre=Drama&year=2024&page=2' })
    expect(valid.statusCode).toBe(200)
    expect(catalog.discover).toHaveBeenCalledWith({ kind: 'movie', feed: 'popular', genre: 'Drama', year: 2024, page: 2 })
    vi.mocked(catalog.discover).mockClear()
    for (const query of ['kind=all&genre=Drama', 'kind=movie&feed=now-playing&year=2024', 'kind=series&feed=popular&year=no', 'kind=movie&feed=popular&page=501']) {
      expect((await app.inject({ method: 'GET', url: `/v1/titles/discover?${query}` })).statusCode).toBe(400)
    }
    expect(catalog.discover).not.toHaveBeenCalled()
  })

  it('exposes discover, search, batch, detail, and season interfaces', async () => {
    const catalog = fakeCatalog()
    const app = await buildApp({ catalog })
    openApps.push(app)

    const responses = await Promise.all([
      app.inject({ method: 'GET', url: '/v1/titles/discover?kind=movie&feed=popular&page=1' }),
      app.inject({ method: 'GET', url: '/v1/titles/search?q=fight%20club&kind=all' }),
      app.inject({ method: 'GET', url: '/v1/titles/batch?refs=movie:550' }),
      app.inject({ method: 'GET', url: '/v1/titles/movie/550' }),
      app.inject({ method: 'GET', url: '/v1/titles/series/1399/seasons/1' }),
    ])

    expect(responses.map((response) => response.statusCode)).toEqual([200, 200, 200, 200, 200])
    expect(catalog.discover).toHaveBeenCalledWith({ feed: 'popular', kind: 'movie', page: 1 })
    expect(catalog.search).toHaveBeenCalledWith({ kind: 'all', page: 1, query: 'fight club' })
    expect(catalog.batch).toHaveBeenCalledWith([{ id: 550, kind: 'movie' }])
    expect(catalog.title).toHaveBeenCalledWith('movie', 550)
    expect(catalog.season).toHaveBeenCalledWith(1399, 1)
    expect(responses[0]?.headers['x-catalog-stale']).toBe('0')
  })

  it('rejects invalid catalog queries before invoking the adapter', async () => {
    const catalog = fakeCatalog()
    const app = await buildApp({ catalog })
    openApps.push(app)

    const responses = await Promise.all([
      app.inject({ method: 'GET', url: '/v1/titles/search?q=a' }),
      app.inject({ method: 'GET', url: '/v1/titles/batch?refs=movie:not-a-number' }),
      app.inject({ method: 'GET', url: '/v1/titles/game/12' }),
    ])

    expect(responses.map((response) => response.statusCode)).toEqual([400, 400, 400])
    expect(catalog.search).not.toHaveBeenCalled()
    expect(catalog.batch).not.toHaveBeenCalled()
    expect(catalog.title).not.toHaveBeenCalled()
  })

  it('returns a structured configuration error without a token-backed adapter', async () => {
    const app = await buildApp()
    openApps.push(app)

    const response = await app.inject({ method: 'GET', url: '/v1/titles/discover' })

    expect(response.statusCode).toBe(503)
    expect(response.json()).toEqual({
      error: {
        code: 'CATALOG_NOT_CONFIGURED',
        message: 'The catalog is not configured on this server.',
        requestId: expect.any(String),
        retryable: false,
      },
    })
  })

  it('translates an adapter contract breach into a safe 500 without leaking internals', async () => {
    const catalog: Catalog = { ...createFakeCatalog(), discover: async () => ({ garbage: true }) as never }
    const app = await buildApp({ catalog })
    openApps.push(app)

    const response = await app.inject({ method: 'GET', url: '/v1/titles/discover?kind=all' })

    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({
      error: { code: 'INTERNAL', message: 'Internal server error.', requestId: expect.any(String), retryable: false },
    })
  })

  it('merges anime refs from AniList into the catalog batch beside TMDB refs', async () => {
    const catalog = fakeCatalog()
    const animeCatalog = fakeAnimeCatalog()
    const app = await buildApp({ animeCatalog, catalog })
    openApps.push(app)

    const response = await app.inject({ method: 'GET', url: '/v1/titles/batch?refs=movie:550,anime:1' })

    expect(response.statusCode).toBe(200)
    expect(catalog.batch).toHaveBeenCalledWith([{ id: 550, kind: 'movie' }])
    expect(animeCatalog.batch).toHaveBeenCalledWith([1])
    const body = response.json()
    expect(body.items).toHaveLength(2)
    expect(body.items[0]).toMatchObject({ id: 550, kind: 'movie' })
    expect(body.items[1]).toEqual({
      backdropUrl: null,
      genreNames: ['Drama'],
      id: 1,
      kind: 'anime',
      logoUrl: null,
      originalTitle: '日本語',
      overview: 'A show.',
      popularity: 1_000,
      posterUrl: null,
      releaseDate: null,
      title: 'Example',
      tmdbRating: 8.5,
      tmdbVoteCount: 1_000,
      year: 2024,
    })
    expect(body.meta).toMatchObject({ source: 'tmdb', stale: false })
    expect(body.missing).toEqual([])
  })

  it('serves anime search from AniList as catalog summaries without touching TMDB', async () => {
    const catalog = fakeCatalog()
    const animeCatalog = fakeAnimeCatalog()
    const app = await buildApp({ animeCatalog, catalog })
    openApps.push(app)

    const response = await app.inject({ method: 'GET', url: '/v1/titles/search?q=example&kind=anime' })

    expect(response.statusCode).toBe(200)
    expect(catalog.search).not.toHaveBeenCalled()
    expect(animeCatalog.search).toHaveBeenCalledWith('example', 1)
    const body = response.json()
    expect(body.items[0]).toMatchObject({ id: 1, kind: 'anime', title: 'Example', tmdbRating: 8.5 })
    expect(body).toMatchObject({ page: 1, totalPages: 1, totalResults: 1, meta: { source: 'anilist', stale: false } })
  })

  it('answers anime-only batches from AniList without touching TMDB, and reports misses as anime refs', async () => {
    const catalog = fakeCatalog()
    const animeCatalog = fakeAnimeCatalog()
    vi.mocked(animeCatalog.batch).mockResolvedValueOnce({ items: [], missing: [999] })
    const app = await buildApp({ animeCatalog, catalog })
    openApps.push(app)

    const response = await app.inject({ method: 'GET', url: '/v1/titles/batch?refs=anime:999' })

    expect(response.statusCode).toBe(200)
    expect(catalog.batch).not.toHaveBeenCalled()
    const body = response.json()
    expect(body.items).toEqual([])
    expect(body.missing).toEqual([{ id: 999, kind: 'anime' }])
    expect(body.meta).toMatchObject({ source: 'anilist', stale: false })
  })

  it('fails an anime adapter outage as retryable and proves anime batch output against the contract', async () => {
    const animeCatalog = fakeAnimeCatalog()
    vi.mocked(animeCatalog.batch).mockRejectedValueOnce(new AnimeError('ANILIST_UNAVAILABLE', 'AniList is unavailable.', { retryable: true }))
    const app = await buildApp({ animeCatalog, catalog: fakeCatalog() })
    openApps.push(app)

    const outage = await app.inject({ method: 'GET', url: '/v1/titles/batch?refs=anime:1' })

    expect(outage.statusCode).toBe(503)
    expect(outage.json()).toEqual({
      error: {
        code: 'CATALOG_UNAVAILABLE',
        message: 'The catalog is temporarily unavailable.',
        requestId: expect.any(String),
        retryable: true,
      },
    })

    vi.mocked(animeCatalog.batch).mockResolvedValueOnce({ garbage: true } as never)
    const breach = await app.inject({ method: 'GET', url: '/v1/titles/batch?refs=anime:1' })

    expect(breach.statusCode).toBe(500)
    expect(breach.json()).toEqual({
      error: { code: 'INTERNAL', message: 'Internal server error.', requestId: expect.any(String), retryable: false },
    })
  })

  it('names anime as a valid batch reference in the invalid-query message', async () => {
    const catalog = fakeCatalog()
    const app = await buildApp({ animeCatalog: fakeAnimeCatalog(), catalog })
    openApps.push(app)

    const response = await app.inject({ method: 'GET', url: '/v1/titles/batch?refs=novel:1' })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toMatchObject({ error: { message: 'References must use movie:123, series:123, or anime:123.' } })
    expect(catalog.batch).not.toHaveBeenCalled()
  })
})
