import type { AnimeTitleDetail, AnimeFranchise, AnimeAiringSchedule, AnimePage, AnimeSearchResult, AnimeBatch, AnimeSeason } from '@consumit/contracts'
import type { AnimeCatalog } from '../catalog/anilist/adapter.ts'

export type AnimeService = {
  search(query: string, page?: number): Promise<AnimeSearchResult>
  title(anilistId: number): Promise<AnimeTitleDetail>
  trending(page?: number): Promise<AnimePage>
  seasonal(season: AnimeSeason, year: number, page?: number): Promise<AnimePage>
  franchise(anilistId: number): Promise<AnimeFranchise>
  airingSchedule(anilistId: number): Promise<AnimeAiringSchedule>
  batch(anilistIds: number[]): Promise<AnimeBatch>
}

export function createAnimeService(catalog: AnimeCatalog): AnimeService {
  return {
    async search(query, page = 1) {
      return catalog.search(query, page)
    },

    async title(anilistId) {
      return catalog.title(anilistId)
    },

    async trending(page = 1) {
      return catalog.trending(page)
    },

    async seasonal(season, year, page = 1) {
      return catalog.seasonal(season, year, page)
    },

    async franchise(anilistId) {
      return catalog.relations(anilistId)
    },

    async airingSchedule(anilistId) {
      return catalog.airingSchedule(anilistId)
    },

    async batch(anilistIds) {
      return catalog.batch(anilistIds)
    },
  }
}
