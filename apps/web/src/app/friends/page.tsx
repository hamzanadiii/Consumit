import type { Metadata } from 'next'

import { FriendsScreen } from './friends-screen'
import { CatalogUnavailableScreen } from '../catalog/catalog-ui'

import { getCatalogBatch, refsKey } from '@/lib/catalog-api'
import { editorialRefs } from '@/lib/catalog-registry'

export const metadata: Metadata = {
  title: 'Circle Activity · Consumit',
  description: 'Asynchronous activity from people whose taste you trust.',
}

export default async function FriendsPage() {
  let response
  try {
    response = await getCatalogBatch(refsKey(editorialRefs))
  } catch (error) {
    return <CatalogUnavailableScreen activeHref="/friends" error={error} />
  }
  return <FriendsScreen stale={response.meta.stale} titles={response.items} />
}
