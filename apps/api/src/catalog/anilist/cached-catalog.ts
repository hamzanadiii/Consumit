import {
  animeAiringScheduleSchema,
  animeBatchSchema,
  animeFranchiseSchema,
  animePageSchema,
  animeSearchResultSchema,
  animeTitleDetailSchema,
  type AnimeAiringSchedule,
  type AnimeBatch,
  type AnimeBrowseQuery,
  type AnimeFranchise,
  type AnimePage,
  type AnimeSearchResult,
  type AnimeSeason,
  type AnimeTitleDetail,
} from '@consumit/contracts'
import { AnimeError } from '../../anime/errors.ts'
import type { StaleCache } from '../stale-cache.ts'
import type { AnimeCatalog } from './adapter.ts'

const policies = {
  search: { freshForMs: 5 * 60_000, staleForMs: 60 * 60_000 },
  page: { freshForMs: 15 * 60_000, staleForMs: 4 * 60 * 60_000 },
  detail: { freshForMs: 6 * 60 * 60_000, staleForMs: null },
  relations: { freshForMs: 24 * 60 * 60_000, staleForMs: null },
  airing: { freshForMs: 5 * 60_000, staleForMs: 60 * 60_000 },
  batch: { freshForMs: 6 * 60 * 60_000, staleForMs: 7 * 24 * 60 * 60_000 },
} as const

/** Adds persistent stale-while-revalidate caching to mapped AniList results.
 *  Only validated adapter output is stored; title details are retained until
 *  AniList successfully refreshes them. */
export function createCachedAnimeCatalog(catalog: AnimeCatalog, cache: StaleCache): AnimeCatalog {
  async function cached<T>(
    key: string,
    policy: { freshForMs: number; staleForMs: number | null },
    schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
    load: () => Promise<unknown>,
  ): Promise<T> {
    const loadValidated = async () => {
      const result = schema.safeParse(await load())
      if (!result.success) {
        throw new AnimeError('ANILIST_UNAVAILABLE', 'AniList returned invalid metadata.', { retryable: true })
      }
      return result.data
    }

    const result = await cache.get(key, policy, loadValidated)
    const parsed = schema.safeParse(result.value)
    if (parsed.success) return parsed.data

    // Treat corrupt or incompatible persisted data as a miss and replace it
    // from the real catalog before returning anything to the caller.
    await cache.delete(key)
    return (await cache.get(key, policy, loadValidated)).value
  }

  return {
    ...catalog,
    async search(query, page = 1, perPage = 20): Promise<AnimeSearchResult> {
      return cached<AnimeSearchResult>(`anilist:v2:search:${query}:${page}:${perPage}`, policies.search, animeSearchResultSchema,
        () => catalog.search(query, page, perPage))
    },
    async title(anilistId): Promise<AnimeTitleDetail> {
      return cached<AnimeTitleDetail>(`anilist:v2:details:${anilistId}`, policies.detail, animeTitleDetailSchema,
        () => catalog.title(anilistId))
    },
    async trending(page = 1, perPage = 20): Promise<AnimePage> {
      return cached<AnimePage>(`anilist:v2:trending:${page}:${perPage}`, policies.page, animePageSchema,
        () => catalog.trending(page, perPage))
    },
    async seasonal(season: AnimeSeason, year: number, page = 1, perPage = 20): Promise<AnimePage> {
      return cached<AnimePage>(`anilist:v2:seasonal:${season}:${year}:${page}:${perPage}`, policies.page, animePageSchema,
        () => catalog.seasonal(season, year, page, perPage))
    },
    async browse(query: AnimeBrowseQuery, perPage = 20): Promise<AnimePage> {
      return cached<AnimePage>(`anilist:v2:browse:${query.sort}:${query.genre ?? ''}:${query.year ?? ''}:${query.format ?? ''}:${query.page}:${perPage}`, policies.page, animePageSchema,
        () => catalog.browse(query, perPage))
    },
    async relations(anilistId): Promise<AnimeFranchise> {
      return cached<AnimeFranchise>(`anilist:v2:relations:${anilistId}`, policies.relations, animeFranchiseSchema,
        () => catalog.relations(anilistId))
    },
    async airingSchedule(anilistId, page = 1, perPage = 20): Promise<AnimeAiringSchedule> {
      return cached<AnimeAiringSchedule>(`anilist:v2:airing:${anilistId}:${page}:${perPage}`, policies.airing, animeAiringScheduleSchema,
        () => catalog.airingSchedule(anilistId, page, perPage))
    },
    async batch(anilistIds): Promise<AnimeBatch> {
      const keyIds = anilistIds.join(',')
      return cached<AnimeBatch>(`anilist:v2:batch:${keyIds}`, policies.batch, animeBatchSchema,
        () => catalog.batch(anilistIds))
    },
  }
}
