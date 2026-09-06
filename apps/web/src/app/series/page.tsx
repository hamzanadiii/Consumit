import type { Metadata } from 'next'

import { CatalogBrowseScreen } from '../catalog/catalog-browse-screen'
import { CatalogUnavailableScreen } from '../catalog/catalog-ui'

import { getCatalogBatch, getCatalogDiscovery, refsKey } from '@/lib/catalog-api'

export const metadata: Metadata = { title: 'Series · Consumit', description: 'Browse real television series from the TMDB catalog.' }

export default async function SeriesPage() {
  let responses
  try {
    responses = await Promise.all([
      getCatalogBatch(refsKey([{ id: 95396, kind: 'series' }])),
      getCatalogDiscovery({ feed: 'on-air', kind: 'series' }),
      getCatalogDiscovery({ feed: 'popular', kind: 'series' }),
      getCatalogDiscovery({ feed: 'top-rated', kind: 'series' }),
    ])
  } catch (error) {
    return <CatalogUnavailableScreen activeHref="/series" error={error} />
  }
  const [heroBatch, current, popular, topRated] = responses
  const hero = heroBatch.items[0] ?? popular.items[0]
  if (!hero) throw new Error('No series spotlight is available.')
  return <CatalogBrowseScreen current={current} hero={hero} kind="series" popular={popular} topRated={topRated} />
}
