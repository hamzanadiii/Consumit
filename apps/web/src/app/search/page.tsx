import type { AnimeTitleSummary, CatalogPage } from '@consumit/contracts'
import type { Metadata } from 'next'

import { PeopleSearchScreen } from './people-search-screen'
import { getPeopleSearch, getPeopleSuggestions } from '@/lib/member-server'
import { SearchScreen } from './search-screen'

import { AnimeApiError, getAnimeTrending, searchAnime } from '@/lib/anime-api'
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
  const selectedType = Array.isArray(type) ? (type[0] ?? '') : (type ?? '')
  const initialKind = selectedType === 'movie' || selectedType === 'series' || selectedType === 'anime' ? selectedType : 'all'
  const catalogKind = initialKind === 'movie' || initialKind === 'series' ? initialKind : 'all'
  if (selectedType === 'people') {
    let page = null
    if (initialQuery.length >= 3) { try { page = await getPeopleSearch(initialQuery) } catch { /* The screen offers retry independently of catalog services. */ } }
    let suggestions = null
    let suggestionsError = false
    if (initialQuery.length < 3 || page?.items.length === 0) {
      try { suggestions = await getPeopleSuggestions() } catch { suggestionsError = true }
    }
    return <PeopleSearchScreen initialPage={page} initialQuery={initialQuery} initialSuggestions={suggestions} suggestionsError={suggestionsError} key={initialQuery} />
  }
  const queryTooShort = initialQuery.length === 1
  // Anime is an AniList domain; TMDB serves movies and series only. In All,
  // read both sources independently so one outage cannot hide the other.
  let animeItems: AnimeTitleSummary[] = []
  let animeSignInRequired = false
  let animeUnavailable = false
  const animeRequest = initialKind === 'all' || initialKind === 'anime'
    ? initialQuery.length >= 2 ? searchAnime(initialQuery) : getAnimeTrending(1)
    : Promise.resolve(null)
  const catalogRequest = initialKind !== 'anime'
    ? initialQuery.length >= 2
      ? searchCatalog(initialQuery, catalogKind)
      : getCatalogDiscovery({ feed: 'trending', kind: catalogKind })
    : Promise.resolve(null)
  const [animeOutcome, catalogOutcome] = await Promise.allSettled([animeRequest, catalogRequest])
  if (animeOutcome.status === 'fulfilled') {
    animeItems = animeOutcome.value?.items ?? []
  } else {
    // Anime search is member-only; say so instead of reporting zero matches.
    animeSignInRequired = animeOutcome.reason instanceof AnimeApiError && animeOutcome.reason.status === 401
    animeUnavailable = !animeSignInRequired
  }

  let page: CatalogPage | null = null
  let catalogUnavailable = false
  if (catalogOutcome.status === 'fulfilled') {
    page = catalogOutcome.value
  } else {
    catalogUnavailable = true
  }
  // One work, one page: TMDB series twins of anime results drop out here
  // (the anime page owns playback). Movies and year-less records never match.
  const deduped = page ? { ...page, items: dedupeTwinSeries(page.items, animeItems) } : null

  return <SearchScreen initialKind={initialKind} animeResults={animeItems} animeSignInRequired={animeSignInRequired} animeUnavailable={animeUnavailable} catalogUnavailable={catalogUnavailable} initialQuery={initialQuery} page={deduped} queryTooShort={queryTooShort} />
}
