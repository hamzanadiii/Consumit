import type {
  CatalogBatch,
  CatalogMovieDetail,
  CatalogPage,
  CatalogSeasonResponse,
  CatalogTitleResponse,
  CatalogTitleSummary,
} from '@consumit/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildApp } from '../app.ts'
import type { Catalog } from './catalog.ts'
import { createFakeCatalog } from './fake-catalog.ts'

const summary: CatalogTitleSummary = {
  backdropUrl: 'https://image.tmdb.org/t/p/w1280/backdrop.jpg',
  genreNames: ['Drama'],
  id: 550,
  kind: 'movie',
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
    search: vi.fn(async () => page),
    season: vi.fn(async () => seasonResponse),
    title: vi.fn(async () => titleResponse),
  }
}

const openApps: Awaited<ReturnType<typeof buildApp>>[] = []

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()))
})

describe('catalog routes', () => {
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
      error: { code: 'INTERNAL', message: 'Internal server error.', retryable: false },
    })
  })
})
