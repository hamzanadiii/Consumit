import type { Metadata } from 'next'

import { CatalogBrowseScreen } from '../catalog/catalog-browse-screen'
import { CatalogUnavailableScreen } from '../catalog/catalog-ui'

import { getCatalogBatch, getCatalogDiscovery, refsKey } from '@/lib/catalog-api'

export const metadata: Metadata = { title: 'Movies · Consumit', description: 'Browse real movies from the TMDB catalog.' }

export default async function MoviesPage() {
  let responses
  try {
    responses = await Promise.all([
      getCatalogBatch(refsKey([{ id: 693134, kind: 'movie' }])),
      getCatalogDiscovery({ feed: 'now-playing', kind: 'movie' }),
      getCatalogDiscovery({ feed: 'popular', kind: 'movie' }),
      getCatalogDiscovery({ feed: 'top-rated', kind: 'movie' }),
    ])
  } catch (error) {
    return <CatalogUnavailableScreen activeHref="/movies" error={error} />
  }
  const [heroBatch, current, popular, topRated] = responses
  const hero = heroBatch.items[0] ?? popular.items[0]
  if (!hero) throw new Error('No movie spotlight is available.')
  return <CatalogBrowseScreen current={current} hero={hero} kind="movie" popular={popular} topRated={topRated} />
}
