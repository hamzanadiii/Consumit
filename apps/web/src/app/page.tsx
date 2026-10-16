import { FilScreenHome } from './home/filscreen-home'

import type { AnimeTitleSummary, CatalogKind, CatalogTitleSummary } from '@consumit/contracts'
import { getCatalogBatch, getCatalogDiscovery, getCatalogTitle } from '@/lib/catalog-api'
import { getAnimeTrending } from '@/lib/anime-api'

import type { HeroDetail } from './catalog/catalog-ui'
import { CatalogUnavailableScreen } from './catalog/catalog-ui'

const SPOTLIGHT_SLOTS = 5

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

  try {
    const [
      popular1,
      popular2,
      trending1,
      trending2,
      trendingMoviesRes,
      trendingSeriesRes,
      trendingAnimeRes,
      topRatedMoviesRes,
      topRatedSeriesRes,
      awardWinningShowsRes,
      mindfuckMoviesRes,
    ] = await Promise.all([
      getCatalogDiscovery({ feed: 'popular', kind: 'all', page: 1 }),
      getCatalogDiscovery({ feed: 'popular', kind: 'all', page: 2 }).catch(() => ({ items: [] as const, meta: { stale: false } })),
      getCatalogDiscovery({ feed: 'trending', kind: 'all', page: 1 }),
      getCatalogDiscovery({ feed: 'trending', kind: 'all', page: 2 }).catch(() => ({ items: [] as const, meta: { stale: false } })),
      getCatalogDiscovery({ feed: 'trending', kind: 'movie', page: 1 }).catch(() => ({ items: [] as const, meta: { stale: false } })),
      getCatalogDiscovery({ feed: 'trending', kind: 'series', page: 1 }).catch(() => ({ items: [] as const, meta: { stale: false } })),
      getAnimeTrending(1).catch(() => ({ items: [] as AnimeTitleSummary[], page: 1, totalPages: 0, totalResults: 0 })),
      getCatalogDiscovery({ feed: 'top-rated', kind: 'movie', page: 1 }).catch(() => ({ items: [] as const, meta: { stale: false } })),
      getCatalogDiscovery({ feed: 'top-rated', kind: 'series', page: 1 }).catch(() => ({ items: [] as const, meta: { stale: false } })),
      getCatalogBatch('series:126308,series:241259,series:154385,series:136315,series:124101,series:111803,series:76331,series:93405,series:87108,series:65494,series:60059,series:97546').catch(() => ({ items: [] as const, meta: { stale: false } })),
      getCatalogBatch('movie:496243,movie:539,movie:426,movie:244786,movie:829,movie:372058,movie:1417,movie:11324,movie:550,movie:77,movie:27205,movie:157336,movie:1124,movie:44214,movie:670').catch(() => ({ items: [] as const, meta: { stale: false } })),
    ])

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
  } catch (error) {
    return <CatalogUnavailableScreen activeHref="/" error={error} />
  }

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
      hero={heroItem}
      mindfuckMovies={mindfuckMovies}
      spotlight={enriched.map((entry) => entry.item)}
      topRatedMovies={topRatedMovies}
      topRatedSeries={topRatedSeries}
      trendingAnime={trendingAnime}
      trendingMovies={trendingMovies}
      trendingSeries={trendingSeries}
    />
  )
}
