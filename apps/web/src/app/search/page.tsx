import type { AnimeTitleSummary } from '@consumit/contracts'
import type { Metadata } from 'next'

import { PeopleSearchScreen } from './people-search-screen'
import { getPeopleSearch } from '@/lib/member-server'
import { SearchScreen } from './search-screen'

import { CatalogUnavailableScreen } from '../catalog/catalog-ui'

import { getAnimeTrending, searchAnime } from '@/lib/anime-api'
import { getCatalogDiscovery, searchCatalog } from '@/lib/catalog-api'
import { dedupeTwinSeries } from '@/lib/search-dedupe'

export const metadata: Metadata = {
  title: 'Search & Explore · Consumit',
  description: 'Explore titles, people, and member-made lists.',
}

type SearchPageProps = {
  searchParams: Promise<{ q?: string | string[] | undefined; type?: string | string[] | undefined }>
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q, type } = await searchParams
  const initialQuery = (Array.isArray(q) ? (q[0] ?? '') : (q ?? '')).trim().slice(0, 100)
  if (type === 'people') {
    let page = null
    if (initialQuery.length >= 3) { try { page = await getPeopleSearch(initialQuery) } catch { /* The screen offers retry independently of catalog services. */ } }
    return <PeopleSearchScreen initialPage={page} initialQuery={initialQuery} key={initialQuery} />
  }
  const queryTooShort = initialQuery.length === 1
  // Anime is an AniList domain: TMDB never serves it (the catalog adapter
  // rejects `anime`), so search AniList alongside TMDB. Best-effort — an
  // anime outage must not take down movie/series results.
  let animeItems: AnimeTitleSummary[] = []
  try {
    const anime = initialQuery.length >= 2
      ? await searchAnime(initialQuery)
      : await getAnimeTrending(1)
    animeItems = anime.items
  } catch {
    animeItems = []
  }
  let page
  try {
    page = initialQuery.length >= 2
      ? await searchCatalog(initialQuery)
      : await getCatalogDiscovery({ feed: 'trending', kind: 'all' })
  } catch (error) {
    return <CatalogUnavailableScreen error={error} />
  }
  // One work, one page: TMDB series twins of anime results drop out here
  // (the anime page owns playback). Movies and year-less records never match.
  const deduped = { ...page, items: dedupeTwinSeries(page.items, animeItems) }

  return <SearchScreen initialKind={type === 'movie' || type === 'series' || type === 'anime' ? type : 'all'} animeResults={animeItems} initialQuery={initialQuery} page={deduped} queryTooShort={queryTooShort} />
}
