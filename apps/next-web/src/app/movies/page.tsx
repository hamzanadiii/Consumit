import type { Metadata } from 'next'

import { CatalogBrowseScreen } from '../catalog/catalog-browse-screen'
import { CatalogUnavailableScreen } from '../catalog/catalog-ui'

import { getCatalogDiscovery } from '@/lib/catalog-api'

export const metadata: Metadata = { title: 'Movies · Consumit', description: 'Browse real movies from the TMDB catalog.' }

export default async function MoviesPage() {
  let responses
  try {
    responses = await Promise.all([
      getCatalogDiscovery({ feed: 'now-playing', kind: 'movie' }),
      getCatalogDiscovery({ feed: 'popular', kind: 'movie' }),
    ])
  } catch (error) {
    return <CatalogUnavailableScreen activeHref="/movies" error={error} />
  }
  const [current, popular] = responses
  return <CatalogBrowseScreen current={current} kind="movie" popular={popular} />
}
