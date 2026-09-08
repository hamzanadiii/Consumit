import type { Metadata } from 'next'

import { CatalogBrowseScreen } from '../catalog/catalog-browse-screen'
import { CatalogUnavailableScreen } from '../catalog/catalog-ui'

import { getCatalogDiscovery } from '@/lib/catalog-api'

export const metadata: Metadata = { title: 'Series · Consumit', description: 'Browse real television series from the TMDB catalog.' }

export default async function SeriesPage() {
  let responses
  try {
    responses = await Promise.all([
      getCatalogDiscovery({ feed: 'on-air', kind: 'series' }),
      getCatalogDiscovery({ feed: 'popular', kind: 'series' }),
    ])
  } catch (error) {
    return <CatalogUnavailableScreen activeHref="/series" error={error} />
  }
  const [current, popular] = responses
  return <CatalogBrowseScreen current={current} kind="series" popular={popular} />
}
