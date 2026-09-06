import type { Metadata } from 'next'

import { SearchScreen } from './search-screen'

import { CatalogUnavailableScreen } from '../catalog/catalog-ui'

import { getCatalogDiscovery, searchCatalog } from '@/lib/catalog-api'

export const metadata: Metadata = {
  title: 'Search & Explore · Consumit',
  description: 'Explore titles, people, and member-made lists.',
}

type SearchPageProps = {
  searchParams: Promise<{ q?: string | string[] | undefined }>
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q } = await searchParams
  const initialQuery = (Array.isArray(q) ? (q[0] ?? '') : (q ?? '')).trim().slice(0, 100)
  const queryTooShort = initialQuery.length === 1
  let page
  try {
    page = initialQuery.length >= 2
      ? await searchCatalog(initialQuery)
      : await getCatalogDiscovery({ feed: 'trending', kind: 'all' })
  } catch (error) {
    return <CatalogUnavailableScreen error={error} />
  }

  return <SearchScreen initialQuery={initialQuery} page={page} queryTooShort={queryTooShort} />
}
