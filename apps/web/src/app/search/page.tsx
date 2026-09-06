import type { Metadata } from 'next'

import { SearchScreen } from './search-screen'

export const metadata: Metadata = {
  title: 'Search & Explore · Consumit',
  description: 'Explore titles, people, and member-made lists.',
}

type SearchPageProps = {
  searchParams: Promise<{ q?: string | string[] | undefined }>
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const { q } = await searchParams
  const initialQuery = Array.isArray(q) ? (q[0] ?? '') : (q ?? '')

  return <SearchScreen initialQuery={initialQuery} />
}
