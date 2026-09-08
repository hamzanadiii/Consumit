import { HomeScreen } from './home/home-screen'
import { CatalogUnavailableScreen } from './catalog/catalog-ui'

import { getCatalogBatch, getCatalogDiscovery, refsKey } from '@/lib/catalog-api'
import { catalogMap, editorialRefs } from '@/lib/catalog-registry'

export default async function HomePage() {
  let responses
  try {
    responses = await Promise.all([
      getCatalogBatch(refsKey(editorialRefs)),
      getCatalogDiscovery({ feed: 'trending', kind: 'all' }),
      getCatalogDiscovery({ feed: 'now-playing', kind: 'movie' }),
      getCatalogDiscovery({ feed: 'on-air', kind: 'series' }),
      getCatalogDiscovery({ feed: 'popular', kind: 'all' }),
      getCatalogDiscovery({ feed: 'top-rated', kind: 'all' }),
    ])
  } catch (error) {
    return <CatalogUnavailableScreen activeHref="/" error={error} />
  }
  const [batch, trending, nowPlaying, onAir, popular, topRated] = responses
  const byRef = catalogMap(batch.items)
  const hero = byRef.get('movie:693134')
  const editorial = byRef.get('movie:329865')
  if (!hero || !editorial) throw new Error('Required editorial catalog titles are unavailable.')

  const spotlight = [...nowPlaying.items, ...onAir.items]
    .sort((a, b) => (b.releaseDate ?? '').localeCompare(a.releaseDate ?? ''))
    .slice(0, 5)

  return <HomeScreen curated={batch.items} editorial={editorial} hero={hero} popular={popular.items} spotlight={spotlight} stale={batch.meta.stale || trending.meta.stale || nowPlaying.meta.stale || onAir.meta.stale || popular.meta.stale || topRated.meta.stale} topRated={topRated.items} trending={trending.items} />
}
