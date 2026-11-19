import { describe, expect, it, vi } from 'vitest'

import type { AnimeCatalog } from '../catalog/anilist/adapter.ts'
import { createAnimeService } from './anime-service.ts'

describe('anime catalog matching', () => {
  it('matches TMDB titles by exact native AniList title', async () => {
    const catalog = {
      search: vi.fn(async (query: string) => ({
        items: query === '風の谷のナウシカ'
          ? [{
            anilistId: 572,
            titles: { english: 'Nausicaä of the Valley of the Wind', native: '風の谷のナウシカ', romaji: 'Kaze no Tani no Naushika' },
            seasonYear: 1984,
          }]
          : [],
      })),
    } as unknown as AnimeCatalog
    const service = createAnimeService(catalog)

    await expect(service.matchTmdbTitle('Warriors of the Wind', '風の谷のナウシカ', 1984)).resolves.toBe(572)
    expect(catalog.search).toHaveBeenNthCalledWith(1, 'Warriors of the Wind', 1, 10)
    expect(catalog.search).toHaveBeenNthCalledWith(2, '風の谷のナウシカ', 1, 10)
  })
})
