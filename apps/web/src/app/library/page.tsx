import type { Metadata } from 'next'

import { LibraryScreen } from './library-screen'
import { CatalogUnavailableScreen } from '../catalog/catalog-ui'

import { getCatalogBatch, refsKey } from '@/lib/catalog-api'
import { editorialRefs } from '@/lib/catalog-registry'

export const metadata: Metadata = {
  title: 'My Library · Consumit',
  description: 'Your saved titles, favorites, lists, and watch history.',
}

export default async function LibraryPage() {
  let response
  try {
    response = await getCatalogBatch(refsKey(editorialRefs))
  } catch (error) {
    return <CatalogUnavailableScreen error={error} />
  }
  return <LibraryScreen stale={response.meta.stale} titles={response.items} />
}
