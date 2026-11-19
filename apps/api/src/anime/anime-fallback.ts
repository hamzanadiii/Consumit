import type { AnimeBrowseQuery, AnimeFranchise, AnimePage, AnimeSearchResult, AnimeSeason, AnimeTitleDetail } from '@consumit/contracts'
import { AnimeError } from './errors.ts'
import type { AnimeCatalog } from '../catalog/anilist/adapter.ts'
import type { AnimeIdentityMap, AnimeMetadataFallback } from './anime-metadata.ts'

function unavailable(error: unknown): error is AnimeError {
  return error instanceof AnimeError && error.code === 'ANILIST_UNAVAILABLE'
}

function collectTitles(value: unknown, pairs: Array<[number, number]>) {
  if (!value || typeof value !== 'object') return
  const candidate = value as { anilistId?: unknown; malId?: unknown; items?: unknown; recommendations?: unknown; main?: unknown; relations?: unknown }
  if (Number.isInteger(candidate.anilistId) && Number.isInteger(candidate.malId)) {
    pairs.push([candidate.anilistId as number, candidate.malId as number])
  }
  if (Array.isArray(candidate.items)) candidate.items.forEach((item) => collectTitles(item, pairs))
  if (Array.isArray(candidate.recommendations)) candidate.recommendations.forEach((item) => collectTitles(item, pairs))
  if (candidate.main) collectTitles(candidate.main, pairs)
  if (Array.isArray(candidate.relations)) candidate.relations.forEach((relation) => {
    if (relation && typeof relation === 'object' && 'anime' in relation) collectTitles(relation.anime, pairs)
  })
}

async function rememberTitles(identity: AnimeIdentityMap, value: unknown) {
  const pairs: Array<[number, number]> = []
  collectTitles(value, pairs)
  const uniquePairs = [...new Map(pairs.map(([anilistId, malId]) => [anilistId, malId])).entries()]
  await Promise.all(uniquePairs.map(([anilistId, malId]) => identity.remember(anilistId, malId)))
}

export function createAnimeCatalogWithFallbacks(
  primary: AnimeCatalog,
  fallbacks: AnimeMetadataFallback[],
  identity: AnimeIdentityMap,
): AnimeCatalog {
  if (!fallbacks.length) return primary

  async function withPageFallback<T extends AnimePage | AnimeSearchResult>(
    loadPrimary: () => Promise<T>,
    loadFallback: (source: AnimeMetadataFallback) => Promise<T>,
  ): Promise<T> {
    try {
      const result = await loadPrimary()
      await rememberTitles(identity, result)
      return result
    } catch (primaryError) {
      if (!unavailable(primaryError)) throw primaryError
      let emptyResult: T | undefined
      for (const source of fallbacks) {
        try {
          const result = await loadFallback(source)
          await rememberTitles(identity, result)
          if (result.items.length) return result
          emptyResult = result
        } catch { /* Try the next configured metadata source. */ }
      }
      if (emptyResult) return emptyResult
      throw primaryError
    }
  }

  async function titleFallback(anilistId: number, primaryError: unknown): Promise<AnimeTitleDetail> {
    if (!unavailable(primaryError)) throw primaryError
    const malId = await identity.malIdForAniList(anilistId)
    for (const source of fallbacks) {
      try {
        const detail = await source.title(anilistId, malId)
        await rememberTitles(identity, detail)
        return detail
      } catch { /* Try the next configured metadata source. */ }
    }
    throw primaryError
  }

  return {
    ...primary,
    async search(query, page = 1, perPage = 20): Promise<AnimeSearchResult> {
      return withPageFallback(
        () => primary.search(query, page, perPage),
        (source) => source.search(query, page, perPage),
      )
    },
    async title(anilistId) {
      try {
        const detail = await primary.title(anilistId)
        await rememberTitles(identity, detail)
        return detail
      } catch (error) {
        return titleFallback(anilistId, error)
      }
    },
    async trending(page = 1, perPage = 20): Promise<AnimePage> {
      return withPageFallback(
        () => primary.trending(page, perPage),
        (source) => source.trending(page, perPage),
      )
    },
    async seasonal(season: AnimeSeason, year: number, page = 1, perPage = 20): Promise<AnimePage> {
      return withPageFallback(
        () => primary.seasonal(season, year, page, perPage),
        (source) => source.seasonal(season, year, page, perPage),
      )
    },
    async browse(query: AnimeBrowseQuery, perPage = 20): Promise<AnimePage> {
      return withPageFallback(
        () => primary.browse(query, perPage),
        async (source) => source.browse ? source.browse(query, perPage) : Promise.reject(new Error('Provider does not support filtered anime browsing.')),
      )
    },
    async relations(anilistId): Promise<AnimeFranchise> {
      try {
        const result = await primary.relations(anilistId)
        await rememberTitles(identity, result)
        return result
      } catch (error) {
        if (!unavailable(error)) throw error
        const malId = await identity.malIdForAniList(anilistId)
        let detailFallback: AnimeTitleDetail | undefined
        for (const source of fallbacks) {
          if (!source.relations) {
            if (!detailFallback) {
              try { detailFallback = await source.title(anilistId, malId) }
              catch { /* Try a later source. */ }
            }
            continue
          }
          try {
            const result = await source.relations(anilistId, malId)
            await rememberTitles(identity, result)
            return result
          } catch { /* Try the next configured metadata source. */ }
        }
        if (detailFallback) {
          const result = { main: detailFallback, relations: [] }
          await rememberTitles(identity, result)
          return result
        }
        throw error
      }
    },
    async batch(anilistIds) {
      try {
        const result = await primary.batch(anilistIds)
        await rememberTitles(identity, result)
        return result
      } catch (error) {
        if (!unavailable(error)) throw error
        const items: AnimeTitleDetail[] = []
        const missing: number[] = []
        // Bound outage fan-out. The canonical catalog cache handles the normal
        // bulk path; the fallback repairs a small cold subset without turning
        // one member read into an unbounded burst against MAL/Kitsu.
        for (const id of anilistIds.slice(0, 8)) {
          try { items.push(await titleFallback(id, error)) }
          catch { missing.push(id) }
        }
        missing.push(...anilistIds.slice(8))
        const result = { items, missing: [...new Set(missing)] }
        await rememberTitles(identity, result)
        return result
      }
    },
  }
}
