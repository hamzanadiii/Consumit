import { FilScreenHome } from './home/filscreen-home'

import type { AnimeTitleSummary, CatalogKind, CatalogRef, CatalogTitleSummary, PublicListDiscovery, PublicListDiscoveryItem } from '@consumit/contracts'
import { getCatalogBatch, getCatalogBatchForRefs, getCatalogDiscovery, getCatalogTitle } from '@/lib/catalog-api'
import { getAnimeTrending } from '@/lib/anime-api'
import { getPublicListDiscovery, getPublicMemberTrends } from '@/lib/member-server'

import type { HeroDetail } from './catalog/catalog-ui'
import { CatalogUnavailableScreen } from './catalog/catalog-ui'

const SPOTLIGHT_SLOTS = 5
const EMPTY_CATALOG_META = { fetchedAt: '1970-01-01T00:00:00.000Z', language: 'en-US', region: 'US', source: 'tmdb' as const, stale: false }
const EMPTY_CATALOG_PAGE = { items: [] as CatalogTitleSummary[], meta: EMPTY_CATALOG_META, page: 1, totalPages: 0, totalResults: 0 }
const EMPTY_CATALOG_BATCH = { items: [] as CatalogTitleSummary[], meta: EMPTY_CATALOG_META, missing: [] as CatalogRef[] }

async function readHomeCatalog<T>(request: Promise<T>, fallback: T): Promise<{ value: T; unavailable: boolean }> {
  try { return { value: await request, unavailable: false } }
  catch { return { value: fallback, unavailable: true } }
}

/**
 * Swaps a spotlight candidate's default backdrop for its gallery-picked hero
 * art. Enrichment never fails the page: a title that cannot resolve keeps
 * its summary art and the reel moves on.
 */
async function withHeroArt(
  ref: { id: number; kind: CatalogKind },
  fallback: CatalogTitleSummary,
): Promise<{ item: HeroDetail; stale: boolean }> {
  try {
    const detail = await getCatalogTitle(ref.kind, ref.id)
    return {
      item: { ...detail.item, backdropUrl: detail.item.heroBackdropUrl ?? detail.item.backdropUrl },
      stale: detail.meta.stale,
    }
  } catch {
    return { item: fallback, stale: false }
  }
}

export default async function HomePage() {
  let popular: { items: readonly CatalogTitleSummary[]; meta: { stale: boolean } }
  let trending: { items: readonly CatalogTitleSummary[]; meta: { stale: boolean } }
  let trendingMovies: readonly CatalogTitleSummary[] = []
  let trendingSeries: readonly CatalogTitleSummary[] = []
  let trendingAnime: readonly AnimeTitleSummary[] = []
  let topRatedMovies: readonly CatalogTitleSummary[] = []
  let topRatedSeries: readonly CatalogTitleSummary[] = []
  let awardWinningShows: readonly CatalogTitleSummary[] = []
  let mindfuckMovies: readonly CatalogTitleSummary[] = []
  let catalogUnavailable = false
  let memberTrendRefs: readonly CatalogRef[] = []
  let publicListDiscovery: PublicListDiscovery = { newFromNetwork: [], popular: [] }

  try {
    const [
      popular1Result,
      popular2Result,
      trending1Result,
      trending2Result,
      trendingMoviesResult,
      trendingSeriesResult,
      trendingAnimeResult,
      topRatedMoviesResult,
      topRatedSeriesResult,
      awardWinningShowsResult,
      mindfuckMoviesResult,
      memberTrendsRes,
      publicListsRes,
    ] = await Promise.all([
      readHomeCatalog(getCatalogDiscovery({ feed: 'popular', kind: 'all', page: 1 }), EMPTY_CATALOG_PAGE),
      readHomeCatalog(getCatalogDiscovery({ feed: 'popular', kind: 'all', page: 2 }), EMPTY_CATALOG_PAGE),
      readHomeCatalog(getCatalogDiscovery({ feed: 'trending', kind: 'all', page: 1 }), EMPTY_CATALOG_PAGE),
      readHomeCatalog(getCatalogDiscovery({ feed: 'trending', kind: 'all', page: 2 }), EMPTY_CATALOG_PAGE),
      readHomeCatalog(getCatalogDiscovery({ feed: 'trending', kind: 'movie', page: 1 }), EMPTY_CATALOG_PAGE),
      readHomeCatalog(getCatalogDiscovery({ feed: 'trending', kind: 'series', page: 1 }), EMPTY_CATALOG_PAGE),
      readHomeCatalog(getAnimeTrending(1), { items: [] as AnimeTitleSummary[], page: 1, totalPages: 0, totalResults: 0 }),
      readHomeCatalog(getCatalogDiscovery({ feed: 'top-rated', kind: 'movie', page: 1 }), EMPTY_CATALOG_PAGE),
      readHomeCatalog(getCatalogDiscovery({ feed: 'top-rated', kind: 'series', page: 1 }), EMPTY_CATALOG_PAGE),
      readHomeCatalog(getCatalogBatch('series:126308,series:241259,series:154385,series:136315,series:124101,series:111803,series:76331,series:93405,series:87108,series:65494,series:60059,series:97546'), EMPTY_CATALOG_BATCH),
      readHomeCatalog(getCatalogBatch('movie:496243,movie:539,movie:426,movie:244786,movie:829,movie:372058,movie:1417,movie:11324,movie:550,movie:77,movie:27205,movie:157336,movie:1124,movie:44214,movie:670'), EMPTY_CATALOG_BATCH),
      getPublicMemberTrends().catch(() => ({ items: [] as CatalogRef[] })),
      getPublicListDiscovery().catch(() => ({ newFromNetwork: [], popular: [] })),
    ])

    const catalogResults = [popular1Result, popular2Result, trending1Result, trending2Result, trendingMoviesResult, trendingSeriesResult, trendingAnimeResult, topRatedMoviesResult, topRatedSeriesResult, awardWinningShowsResult, mindfuckMoviesResult]
    catalogUnavailable = catalogResults.some(result => result.unavailable)
    const popular1 = popular1Result.value, popular2 = popular2Result.value
    const trending1 = trending1Result.value, trending2 = trending2Result.value
    const trendingMoviesRes = trendingMoviesResult.value, trendingSeriesRes = trendingSeriesResult.value
    const trendingAnimeRes = trendingAnimeResult.value, topRatedMoviesRes = topRatedMoviesResult.value
    const topRatedSeriesRes = topRatedSeriesResult.value, awardWinningShowsRes = awardWinningShowsResult.value
    const mindfuckMoviesRes = mindfuckMoviesResult.value

    const dedupe = (items: readonly CatalogTitleSummary[]) => {
      const seenIds = new Set<string>()
      return items.filter((item) => {
        const key = `${item.kind}:${item.id}`
        if (seenIds.has(key)) return false
        seenIds.add(key)
        return true
      })
    }

    popular = {
      items: dedupe([...popular1.items, ...popular2.items]),
      meta: { stale: popular1.meta.stale || popular2.meta.stale },
    }
    trending = {
      items: dedupe([...trending1.items, ...trending2.items]),
      meta: { stale: trending1.meta.stale || trending2.meta.stale },
    }
    trendingSeries = trendingSeriesRes.items
    trendingMovies = trendingMoviesRes.items
    trendingAnime = trendingAnimeRes.items
    topRatedMovies = topRatedMoviesRes.items
    topRatedSeries = topRatedSeriesRes.items
    awardWinningShows = awardWinningShowsRes.items
    mindfuckMovies = mindfuckMoviesRes.items
    memberTrendRefs = memberTrendsRes.items
    publicListDiscovery = publicListsRes
  } catch (error) {
    return <CatalogUnavailableScreen activeHref="/" error={error} />
  }

  let trendingWithMembers: readonly CatalogTitleSummary[] = []
  if (memberTrendRefs.length) {
    try {
      const memberTrendBatch = await getCatalogBatchForRefs(memberTrendRefs)
      trendingWithMembers = memberTrendBatch?.items ?? []
      if (memberTrendBatch?.unavailable) catalogUnavailable = true
    } catch { catalogUnavailable = true }
  }

  const listPreviewRefs = [...publicListDiscovery.newFromNetwork, ...publicListDiscovery.popular].flatMap(item => item.preview)
  const listPosters = new Map<string, string>()
  if (listPreviewRefs.length) {
    try {
      const batch = await getCatalogBatchForRefs(listPreviewRefs)
      for (const title of batch?.items ?? []) {
        if (title.posterUrl) listPosters.set(`${title.kind}:${title.id}`, title.posterUrl)
      }
    } catch {
      // Real lists still render with the shared missing-art treatment.
    }
  }
  const enrichLists = (items: readonly PublicListDiscoveryItem[]) => items.map(item => ({
    ...item,
    artworkSources: item.preview.map(ref => listPosters.get(`${ref.kind}:${ref.id}`)),
  }))

  // The reel tracks Trending now: the top backdropped titles, enriched with
  // full details, become the five slides in feed order.
  const seen = new Set<string>()
  const spotlightRefs = [...trending.items, ...popular.items]
    .filter((item) => {
      const key = `${item.kind}:${item.id}`
      if (seen.has(key) || !item.backdropUrl) return false
      seen.add(key)
      return true
    })
    .slice(0, SPOTLIGHT_SLOTS)
  const enriched = await Promise.all(spotlightRefs.map((item) => withHeroArt(item, item)))

  let heroItem: HeroDetail | undefined =
    enriched[0]?.item
    ?? trending.items.find((item) => item.backdropUrl)
    ?? popular.items.find((item) => item.backdropUrl)
    ?? trending.items[0]
    ?? popular.items[0]
  if (!heroItem) {
    try {
      const detail = await getCatalogTitle('movie', 693134)
      heroItem = { ...detail.item, backdropUrl: detail.item.heroBackdropUrl ?? detail.item.backdropUrl }
    } catch (error) {
      return <CatalogUnavailableScreen activeHref="/" error={error} />
    }
  }

  return (
    <FilScreenHome
      awardWinningShows={awardWinningShows}
      catalogState={catalogUnavailable ? 'unavailable' : [popular.items, trending.items, trendingMovies, trendingSeries, trendingAnime, topRatedMovies, topRatedSeries, awardWinningShows, mindfuckMovies, trendingWithMembers].some(items => items.length > 0) ? undefined : 'empty'}
      hero={heroItem}
      mindfuckMovies={mindfuckMovies}
      newFromNetworkLists={enrichLists(publicListDiscovery.newFromNetwork)}
      popularLists={enrichLists(publicListDiscovery.popular)}
      spotlight={enriched.map((entry) => entry.item)}
      topRatedMovies={topRatedMovies}
      topRatedSeries={topRatedSeries}
      trendingAnime={trendingAnime}
      trendingMovies={trendingMovies}
      trendingSeries={trendingSeries}
      trendingWithMembers={trendingWithMembers}
    />
  )
}
