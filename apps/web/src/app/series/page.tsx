import type { Metadata } from 'next'

import { CatalogBrowseScreen } from '../catalog/catalog-browse-screen'
import { CatalogUnavailableScreen } from '../catalog/catalog-ui'

import { getCatalogDiscovery } from '@/lib/catalog-api'
import { catalogBrowseFeed } from '@/lib/catalog-browser'

export const metadata: Metadata = { title: 'Series · Consumit', description: 'Browse real television series from the TMDB catalog.' }

export default async function SeriesPage({ searchParams }: { searchParams: Promise<{ feed?: string | string[] }> }) {
  const initialFeed = catalogBrowseFeed((await searchParams).feed)
  let responses
  try {
    responses = await Promise.all([
      getCatalogDiscovery({ feed: 'trending', kind: 'series' }),
      getCatalogDiscovery({ feed: 'popular', kind: 'series' }),
    ])
  } catch (error) {
    return <CatalogUnavailableScreen activeHref="/series" error={error} />
  }
  const [current, popular] = responses
  return <CatalogBrowseScreen current={current} initialFeed={initialFeed} kind="series" popular={popular} />
}
