import type {
  AnimeAiringSchedule,
  AnimeBatch,
  AnimeFranchise,
  AnimePage,
  AnimeSearchResult,
  AnimeTitleDetail,
  AnimeTitleSummary,
} from '@consumit/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildApp } from '../app.ts'
import type { AnimeCatalog } from '../catalog/anilist/adapter.ts'
import { AnimeError } from './errors.ts'

const summary: AnimeTitleSummary = {
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
  titles: { english: 'Example', native: null, preferred: 'Example', romaji: 'Example' },
}

const detail: AnimeTitleDetail = {
  ...summary,
  characters: [],
  countryOfOrigin: 'JP',
  externalLinks: [],
  malId: null,
  source: null,
  staff: [],
  streamingEpisodes: [],
  trailer: null,
}
const page: AnimePage = { items: [summary], page: 1, totalPages: 1, totalResults: 1 }
const search: AnimeSearchResult = page
const franchise: AnimeFranchise = { main: summary, relations: [] }
const airing: AnimeAiringSchedule = { episodes: [], page: 1, totalPages: 0 }
const batch: AnimeBatch = { items: [summary], missing: [] }

function fakeAnimeCatalog(): AnimeCatalog {
  return {
    airingSchedule: vi.fn(async () => airing),
    batch: vi.fn(async () => batch),
    relations: vi.fn(async () => franchise),
    search: vi.fn(async () => search),
    seasonal: vi.fn(async () => page),
    title: vi.fn(async () => detail),
    trending: vi.fn(async () => page),
  }
}

const openApps: Awaited<ReturnType<typeof buildApp>>[] = []

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()))
})

describe('anime routes', () => {
  it('validates route input before calling the metadata adapter', async () => {
    const animeCatalog = fakeAnimeCatalog()
    const app = await buildApp({ animeCatalog })
    openApps.push(app)

    const responses = await Promise.all([
      app.inject({ method: 'GET', url: '/v1/anime/search?q=a' }),
      app.inject({ method: 'GET', url: '/v1/anime/trending?page=501' }),
      app.inject({ method: 'GET', url: '/v1/anime/1.5' }),
      app.inject({ method: 'GET', url: '/v1/anime/batch?ids=1,nope' }),
    ])

    expect(responses.map((response) => response.statusCode)).toEqual([400, 400, 400, 400])
    expect(animeCatalog.search).not.toHaveBeenCalled()
    expect(animeCatalog.trending).not.toHaveBeenCalled()
    expect(animeCatalog.title).not.toHaveBeenCalled()
    expect(animeCatalog.batch).not.toHaveBeenCalled()
  })

  it('preserves upstream outages instead of answering with a false 404', async () => {
    const animeCatalog = fakeAnimeCatalog()
    vi.mocked(animeCatalog.title).mockRejectedValueOnce(new AnimeError('ANILIST_UNAVAILABLE', 'AniList is unavailable.', { retryable: true }))
    const app = await buildApp({ animeCatalog })
    openApps.push(app)

    const response = await app.inject({ method: 'GET', url: '/v1/anime/1' })

    expect(response.statusCode).toBe(503)
    expect(response.json()).toEqual({
      error: {
        code: 'ANILIST_UNAVAILABLE',
        message: 'AniList is unavailable.',
        requestId: expect.any(String),
        retryable: true,
      },
    })
  })

  it('exposes a contract-checked anime detail response', async () => {
    const app = await buildApp({ animeCatalog: fakeAnimeCatalog() })
    openApps.push(app)

    const response = await app.inject({ method: 'GET', url: '/v1/anime/1' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ anilistId: 1, status: 'FINISHED', coverImage: { url: null } })
  })
})
