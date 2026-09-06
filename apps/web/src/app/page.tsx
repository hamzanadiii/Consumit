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
    ])
  } catch (error) {
    return <CatalogUnavailableScreen activeHref="/" error={error} />
  }
  const [batch, trending] = responses
  const byRef = catalogMap(batch.items)
  const hero = byRef.get('movie:693134')
  const editorial = byRef.get('movie:329865')
  if (!hero || !editorial) throw new Error('Required editorial catalog titles are unavailable.')

  return <HomeScreen curated={batch.items} editorial={editorial} hero={hero} stale={batch.meta.stale || trending.meta.stale} trending={trending.items} />
}
