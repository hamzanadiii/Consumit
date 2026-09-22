import type {
  AnimeTitleDetail,
  AnimeFranchise,
  AnimeAiringSchedule,
  AnimePage,
  AnimeSearchResult,
  AnimeBatch,
  AnimeSeason,
} from '@consumit/contracts'
import { AnilistClientError, createAnilistClient, type AnilistClient } from './client.ts'
import { AnimeError } from '../../anime/errors.ts'
import { searchQuery } from './queries/search.ts'
import { detailsQuery } from './queries/details.ts'
import { trendingQuery } from './queries/trending.ts'
import { seasonalQuery } from './queries/seasonal.ts'
import { relationsQuery } from './queries/relations.ts'
import { airingScheduleQuery } from './queries/airing.ts'
import {
  mapTitleSummary,
  mapTitleDetail,
  mapFranchiseRelation,
  mapAiringNode,
} from './mapper.ts'

export type AnimeCatalog = {
  search(query: string, page?: number, perPage?: number): Promise<AnimeSearchResult>
  title(anilistId: number): Promise<AnimeTitleDetail>
  trending(page?: number, perPage?: number): Promise<AnimePage>
  seasonal(season: AnimeSeason, year: number, page?: number, perPage?: number): Promise<AnimePage>
  relations(anilistId: number): Promise<AnimeFranchise>
  airingSchedule(anilistId: number, page?: number, perPage?: number): Promise<AnimeAiringSchedule>
  batch(anilistIds: number[]): Promise<AnimeBatch>
}

type AnilistPageResponse = {
  Page: {
    media: Array<Record<string, unknown>>
    pageInfo: { total: number; lastPage: number; hasNextPage: boolean }
  }
}

type AnilistMediaResponse = {
  Media: Record<string, unknown> | null
}

type AnilistAiringResponse = {
  AiringSchedule: {
    nodes: Array<{
      episode: number
      airingAt: number
      timeUntilAiring: number
      media: { id: number; title: { romaji: string | null; english: string | null } }
    }>
    pageInfo: { total: number; lastPage: number; hasNextPage: boolean }
  }
}

export function createAnilistCatalog(client?: AnilistClient): AnimeCatalog {
  const api = client ?? createAnilistClient()

  const queryAnime = async <T>(...args: Parameters<AnilistClient['query']>): Promise<T> => {
    try {
      return await api.query<T>(...args)
    } catch (error) {
      if (error instanceof AnilistClientError) {
        throw new AnimeError('ANILIST_UNAVAILABLE', 'Anime metadata is temporarily unavailable.', {
          cause: error,
          retryable: error.retryable,
        })
      }
      throw error
    }
  }

  return {
    async search(query, page = 1, perPage = 20) {
      const data = await queryAnime<AnilistPageResponse>(
        searchQuery,
        { search: query, page, perPage },
        `search:${query}:${page}`,
        'search',
      )
      const items = data.Page.media.map((raw) => mapTitleSummary(raw as Parameters<typeof mapTitleSummary>[0]))
      return {
        items,
        page,
        totalPages: data.Page.pageInfo.lastPage,
        totalResults: data.Page.pageInfo.total,
      }
    },

    async title(anilistId) {
      const data = await queryAnime<AnilistMediaResponse>(
        detailsQuery,
        { id: anilistId },
        `details:${anilistId}`,
        'details',
      )
      if (!data.Media) throw new AnimeError('ANIME_NOT_FOUND', `Anime not found: ${anilistId}`)
      return mapTitleDetail(data.Media as Parameters<typeof mapTitleDetail>[0])
    },

    async trending(page = 1, perPage = 20) {
      const data = await queryAnime<AnilistPageResponse>(
        trendingQuery,
        { page, perPage },
        `trending:${page}`,
        'trending',
      )
      const items = data.Page.media.map((raw) => mapTitleSummary(raw as Parameters<typeof mapTitleSummary>[0]))
      return {
        items,
        page,
        totalPages: data.Page.pageInfo.lastPage,
        totalResults: data.Page.pageInfo.total,
      }
    },

    async seasonal(season, year, page = 1, perPage = 20) {
      const data = await queryAnime<AnilistPageResponse>(
        seasonalQuery,
        { season, seasonYear: year, page, perPage },
        `seasonal:${season}:${year}:${page}`,
        'seasonal',
      )
      const items = data.Page.media.map((raw) => mapTitleSummary(raw as Parameters<typeof mapTitleSummary>[0]))
      return {
        items,
        page,
        totalPages: data.Page.pageInfo.lastPage,
        totalResults: data.Page.pageInfo.total,
      }
    },

    async relations(anilistId) {
      const data = await queryAnime<AnilistMediaResponse>(
        relationsQuery,
        { id: anilistId },
        `relations:${anilistId}`,
        'relations',
      )
      if (!data.Media) throw new AnimeError('ANIME_NOT_FOUND', `Anime not found: ${anilistId}`)
      const media = data.Media as { id: number; title: { romaji: string | null; english: string | null }; relations: { edges: Array<{ relationType: string; node: Record<string, unknown> }> } | null }
      const relations = media.relations?.edges
        .map((edge) => mapFranchiseRelation({ relationType: edge.relationType, node: edge.node as Parameters<typeof mapFranchiseRelation>[0]['node'] }))
        .filter((r): r is NonNullable<typeof r> => r !== null) ?? []
      return {
        main: mapTitleSummary(media as Parameters<typeof mapTitleSummary>[0]),
        relations,
      }
    },

    async airingSchedule(anilistId, page = 1, perPage = 20) {
      const data = await queryAnime<AnilistAiringResponse>(
        airingScheduleQuery,
        { mediaId: anilistId, page, perPage },
        `airing:${anilistId}:${page}`,
        'airing',
      )
      const episodes = data.AiringSchedule.nodes.map(mapAiringNode)
      return {
        episodes,
        page,
        totalPages: data.AiringSchedule.pageInfo.lastPage,
      }
    },

    async batch(anilistIds) {
      const results = await Promise.all(anilistIds.map(async (id) => {
        try {
          return { id, item: await this.title(id) }
        } catch (error) {
          if (error instanceof AnimeError && error.code === 'ANIME_NOT_FOUND') return { id, item: null }
          throw error
        }
      }))

      return {
        items: results.flatMap(({ item }) => item ? [item] : []),
        missing: results.flatMap(({ id, item }) => item ? [] : [id]),
      }
    },
  }
}
