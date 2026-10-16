import type {
  AnimeTitleDetail,
  AnimeFranchise,
  AnimeAiringSchedule,
  AnimePage,
  AnimeSearchResult,
  AnimeBatch,
  AnimeSeason,
  AnimeBrowseQuery,
  AnimeBrowseSort,
} from '@consumit/contracts'
import { AnilistClientError, createAnilistClient, type AnilistClient } from './client.ts'
import { AnimeError } from '../../anime/errors.ts'
import { searchQuery } from './queries/search.ts'
import { detailsQuery } from './queries/details.ts'
import { trendingQuery } from './queries/trending.ts'
import { seasonalQuery } from './queries/seasonal.ts'
import { browseQuery } from './queries/browse.ts'
import { relationsQuery } from './queries/relations.ts'
import { airingScheduleQuery } from './queries/airing.ts'
import { z } from 'zod'
import {
  isAdultMedia,
  mapTitleSummary,
  mapTitleDetail,
  mapFranchiseRelation,
  mapAiringNode,
} from './mapper.ts'

export type AnimeCatalog = {
  recentEpisodes?(anilistId: number, since: Date, until: Date): Promise<import('@consumit/contracts').ReleaseEpisode[]>
  search(query: string, page?: number, perPage?: number): Promise<AnimeSearchResult>
  title(anilistId: number): Promise<AnimeTitleDetail>
  trending(page?: number, perPage?: number): Promise<AnimePage>
  seasonal(season: AnimeSeason, year: number, page?: number, perPage?: number): Promise<AnimePage>
  browse(query: AnimeBrowseQuery, perPage?: number): Promise<AnimePage>
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
    async recentEpisodes(anilistId, since, until) {
      const title = await this.title(anilistId)
      const schema = z.object({ Page: z.object({ pageInfo: z.object({ hasNextPage: z.boolean() }), airingSchedules: z.array(z.object({
        mediaId: z.int().positive(), episode: z.int().positive(), airingAt: z.int().positive(),
      })).max(50) }) })
      const episodes: import('@consumit/contracts').ReleaseEpisode[] = []
      for (let page = 1; page <= 4; page++) {
        const raw = await queryAnime<unknown>(`query ($id:Int,$since:Int,$until:Int,$page:Int) {
          Page(page:$page,perPage:50) { pageInfo { hasNextPage }
            airingSchedules(mediaId:$id,airingAt_greater:$since,airingAt_lesser:$until,sort:TIME_DESC) { mediaId episode airingAt }
          }
        }`, { id: anilistId, since: Math.floor(since.getTime() / 1000) - 1, until: Math.floor(until.getTime() / 1000) + 1, page },
        `recent-airing:${anilistId}:${Math.floor(until.getTime() / 1_800_000)}:${page}`, 'airing')
        const data = schema.parse(raw).Page
        episodes.push(...data.airingSchedules.filter(node => node.mediaId === anilistId).map(node => ({
          ref: { kind: 'anime' as const, id: anilistId, season: 0, episode: node.episode },
          title: title.titles.english ?? title.titles.romaji ?? title.titles.native ?? `Anime ${anilistId}`, episodeTitle: null, imageUrl: title.bannerImage ?? title.coverImage.url,
          releasedAt: new Date(node.airingAt * 1000).toISOString(), datePrecision: 'instant' as const, checkedAt: null,
        })))
        if (!data.pageInfo.hasNextPage) return episodes
      }
      throw new AnimeError('ANILIST_UNAVAILABLE', 'Episode release metadata exceeded its bounded page limit.', { retryable: true })
    },
    async search(query, page = 1, perPage = 20) {
      const data = await queryAnime<AnilistPageResponse>(
        searchQuery,
        { search: query, page, perPage },
        `search:${query}:${page}`,
        'search',
      )
      const items = data.Page.media
        .filter((raw) => !isAdultMedia(raw as { isAdult?: boolean | null }))
        .map((raw) => mapTitleSummary(raw as Parameters<typeof mapTitleSummary>[0]))
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
      if (isAdultMedia(data.Media as { isAdult?: boolean | null })) throw new AnimeError('ANIME_NOT_FOUND', `Anime not found: ${anilistId}`)
      return mapTitleDetail(data.Media as Parameters<typeof mapTitleDetail>[0])
    },

    async trending(page = 1, perPage = 20) {
      const data = await queryAnime<AnilistPageResponse>(
        trendingQuery,
        { page, perPage },
        `trending:${page}`,
        'trending',
      )
      const items = data.Page.media
        .filter((raw) => !isAdultMedia(raw as { isAdult?: boolean | null }))
        .map((raw) => mapTitleSummary(raw as Parameters<typeof mapTitleSummary>[0]))
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
      const items = data.Page.media
        .filter((raw) => !isAdultMedia(raw as { isAdult?: boolean | null }))
        .map((raw) => mapTitleSummary(raw as Parameters<typeof mapTitleSummary>[0]))
      return {
        items,
        page,
        totalPages: data.Page.pageInfo.lastPage,
        totalResults: data.Page.pageInfo.total,
      }
    },

    async browse(query, perPage = 20) {
      const sort: Record<AnimeBrowseSort, string> = {
        popular: 'POPULARITY_DESC',
        'top-rated': 'SCORE_DESC',
        new: 'START_DATE_DESC',
        old: 'START_DATE',
      }
      // Absent filters are omitted, never sent as null: AniList intersects
      // an explicit null genre/format with the remaining filters to empty.
      const data = await queryAnime<AnilistPageResponse>(
        browseQuery,
        {
          sort: [sort[query.sort]],
          ...(query.genre ? { genre: query.genre } : {}),
          ...(query.year !== undefined ? { seasonYear: query.year } : {}),
          ...(query.format ? { format: query.format } : {}),
          page: query.page,
          perPage,
        },
        `browse:${query.sort}:${query.genre ?? ''}:${query.year ?? ''}:${query.format ?? ''}:${query.page}`,
        'browse',
      )
      const items = data.Page.media
        .filter((raw) => !isAdultMedia(raw as { isAdult?: boolean | null }))
        .map((raw) => mapTitleSummary(raw as Parameters<typeof mapTitleSummary>[0]))
      return {
        items,
        page: query.page,
        totalPages: data.Page.pageInfo.lastPage,
        totalResults: data.Page.pageInfo.total,
      }
    },

    async relations(anilistId) {
      const data = await queryAnime<AnilistMediaResponse>(
        relationsQuery,
        { id: anilistId },
        `relations:v2:${anilistId}`,
        'relations',
      )
      if (!data.Media) throw new AnimeError('ANIME_NOT_FOUND', `Anime not found: ${anilistId}`)
      const media = data.Media as { id: number; title: { romaji: string | null; english: string | null }; isAdult?: boolean | null; relations: { edges: Array<{ relationType: string; node: Record<string, unknown> }> } | null }
      if (isAdultMedia(media)) throw new AnimeError('ANIME_NOT_FOUND', `Anime not found: ${anilistId}`)
      const relations = media.relations?.edges
        .filter((edge) => edge.node.type !== 'MANGA' && !isAdultMedia(edge.node as { isAdult?: boolean | null }))
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
