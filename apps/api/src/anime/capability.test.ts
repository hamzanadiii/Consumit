import { describe, expect, it, vi } from 'vitest'
import type { AnimeTitleDetail } from '@consumit/contracts'
import type { AnimeCatalog } from '../catalog/anilist/adapter.ts'
import { loadEnv } from '../config/env.ts'
import { StaleCache } from '../catalog/stale-cache.ts'
import { assembleAnimeCapability, createAnimeCapability } from './capability.ts'

const detail: AnimeTitleDetail = {
  anilistId: 17,
  averageScore: 90,
  bannerImage: null,
  characters: [],
  countryOfOrigin: 'JP',
  coverImage: { color: null, url: null },
  description: 'A test title.',
  episodeDuration: 24,
  episodes: 12,
  externalLinks: [],
  format: 'TV',
  genres: [],
  kind: 'anime',
  logoUrl: null,
  malId: 21,
  nextAiringEpisode: null,
  popularity: 100,
  recommendations: [],
  season: 'SPRING',
  seasonYear: 2024,
  source: null,
  staff: [],
  status: 'FINISHED',
  streamingEpisodes: [],
  titles: { english: 'Test Anime', native: 'テスト', preferred: 'Test Anime', romaji: 'Tesuto' },
  trailer: null,
}

function catalog(): AnimeCatalog {
  return {
    airingSchedule: async () => ({ episodes: [], page: 1, totalPages: 0 }),
    batch: async () => ({ items: [detail], missing: [] }),
    browse: async () => ({ items: [detail], page: 1, totalPages: 1, totalResults: 1 }),
    relations: async () => ({ main: detail, relations: [] }),
    search: async () => ({ items: [detail], page: 1, totalPages: 1, totalResults: 1 }),
    seasonal: async () => ({ items: [detail], page: 1, totalPages: 1, totalResults: 1 }),
    title: vi.fn(async () => detail),
    trending: async () => ({ items: [detail], page: 1, totalPages: 1, totalResults: 1 }),
  }
}

describe('Anime capability', () => {
  it('composes the default test capability without making upstream requests', () => {
    const capability = createAnimeCapability({ env: loadEnv({ NODE_ENV: 'test' }), cache: new StaleCache() })

    expect(capability.catalog).toBeDefined()
    expect(capability.service).toBeDefined()
    expect(capability.providerResolvers).toEqual({
      title: expect.any(Function),
      titleVariants: expect.any(Function),
      metadata: expect.any(Function),
    })
  })

  it('exposes catalog, service and grouped provider resolvers from one catalog', async () => {
    const source = catalog()
    const capability = assembleAnimeCapability({
      primaryCatalog: source,
      fallbacks: [],
      identity: {
        async remember() {},
        async malIdForAniList() { return null },
        async aniListIdForMal() { return null },
      },
      episodeArt: { async episodeByMalId() { return null } },
    })

    await expect(capability.service.title(17)).resolves.toMatchObject({ anilistId: 17, logoUrl: null })
    await expect(capability.providerResolvers.title(17, AbortSignal.timeout(100))).resolves.toBe('Test Anime')
    await expect(capability.providerResolvers.titleVariants(17, AbortSignal.timeout(100))).resolves.toEqual(['Test Anime', 'Tesuto', 'テスト'])
    await expect(capability.providerResolvers.metadata(17, AbortSignal.timeout(100))).resolves.toEqual({ title: 'Test Anime', malId: 21 })
    expect(source.title).toHaveBeenCalled()
  })
})
