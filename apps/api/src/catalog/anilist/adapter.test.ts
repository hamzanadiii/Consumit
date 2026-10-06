import { describe, expect, it } from 'vitest'

import { createAnilistCatalog } from './adapter.ts'
import type { AnilistClient } from './client.ts'

function media(id: number, title: string, isAdult: boolean | null = false) {
  return {
    id,
    idMal: null,
    title: { romaji: title, english: title, native: null },
    format: 'TV',
    status: 'FINISHED',
    season: 'SPRING',
    seasonYear: 2024,
    episodes: 12,
    duration: 24,
    genres: ['Drama'],
    coverImage: { large: null, color: null },
    bannerImage: null,
    averageScore: 80,
    popularity: 1_000,
    description: 'A safe description.',
    nextAiringEpisode: null,
    isAdult,
  }
}

function stubClient(payload: unknown): AnilistClient {
  return { query: async () => payload } as unknown as AnilistClient
}

function pageOf(items: unknown[]) {
  return { Page: { media: items, pageInfo: { total: items.length, lastPage: 1, hasNextPage: false } } }
}

describe('AniList adult exclusion', () => {
  it('drops adult titles from search results', async () => {
    const catalog = createAnilistCatalog(stubClient(pageOf([media(1, 'Clean'), media(2, 'Adult', true)])))
    const result = await catalog.search('test')
    expect(result.items.map((item) => item.anilistId)).toEqual([1])
  })

  it('drops adult titles from trending and seasonal feeds', async () => {
    const trending = createAnilistCatalog(stubClient(pageOf([media(1, 'Clean'), media(2, 'Adult', true)])))
    expect((await trending.trending()).items.map((item) => item.anilistId)).toEqual([1])

    const seasonal = createAnilistCatalog(stubClient(pageOf([media(3, 'Clean'), media(4, 'Adult', true)])))
    expect((await seasonal.seasonal('SPRING', 2024)).items.map((item) => item.anilistId)).toEqual([3])
  })

  it('browses with AniList sorts and filters while excluding adults', async () => {
    let seen: Record<string, unknown> = {}
    const capturing = {
      query: async (_query: string, variables?: Record<string, unknown>) => {
        seen = variables ?? {}
        return pageOf([media(1, 'Clean'), media(2, 'Adult', true)])
      },
    } as unknown as AnilistClient
    const catalog = createAnilistCatalog(capturing)
    for (const [sort, anilist] of [['popular', 'POPULARITY_DESC'], ['top-rated', 'SCORE_DESC'], ['new', 'START_DATE_DESC'], ['old', 'START_DATE']] as const) {
      const result = await catalog.browse({ sort, genre: 'Action', year: 2024, format: 'TV', page: 2 })
      expect(seen).toMatchObject({ sort: [anilist], genre: 'Action', seasonYear: 2024, format: 'TV', page: 2, perPage: 20 })
      expect(result.items.map((item) => item.anilistId)).toEqual([1])
      expect(result.page).toBe(2)
    }
  })

  it('omits absent browse filters instead of sending nulls', async () => {
    let seen: Record<string, unknown> = {}
    const capturing = {
      query: async (_query: string, variables?: Record<string, unknown>) => {
        seen = variables ?? {}
        return pageOf([media(1, 'Clean')])
      },
    } as unknown as AnilistClient
    const catalog = createAnilistCatalog(capturing)
    // AniList intersects an explicit null genre/format with the remaining
    // filters to an empty page; omission keeps unfiltered dimensions open.
    await catalog.browse({ sort: 'popular', page: 1 })
    expect(seen).toEqual({ sort: ['POPULARITY_DESC'], page: 1, perPage: 20 })
    expect('genre' in seen).toBe(false)
    expect('seasonYear' in seen).toBe(false)
    expect('format' in seen).toBe(false)
  })

  it('reports adult titles as not found instead of serving them', async () => {
    const catalog = createAnilistCatalog(stubClient({ Media: media(2, 'Adult', true) }))
    await expect(catalog.title(2)).rejects.toMatchObject({ code: 'ANIME_NOT_FOUND' })
  })

  it('drops adult relations and refuses adult franchise roots', async () => {
    const clean = createAnilistCatalog(stubClient({
      Media: {
        ...media(1, 'Clean'),
        relations: { edges: [
          { relationType: 'SEQUEL', node: media(3, 'Clean Sequel') },
          { relationType: 'PREQUEL', node: media(4, 'Adult Prequel', true) },
          { relationType: 'SOURCE', node: { ...media(5, 'Source manga'), type: 'MANGA' } },
        ] },
      },
    }))
    const franchise = await clean.relations(1)
    expect(franchise.relations.map((relation) => relation.anime.anilistId)).toEqual([3])

    const adult = createAnilistCatalog(stubClient({ Media: { ...media(2, 'Adult', true), relations: null } }))
    await expect(adult.relations(2)).rejects.toMatchObject({ code: 'ANIME_NOT_FOUND' })
  })
})
