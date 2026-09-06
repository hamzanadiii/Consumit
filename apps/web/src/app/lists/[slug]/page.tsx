import type { Metadata } from 'next'

import { ListDetailScreen } from '../list-detail-screen'
import { CatalogUnavailableScreen } from '../../catalog/catalog-ui'

import { getCatalogBatch, refsKey } from '@/lib/catalog-api'
import { editorialRefs } from '@/lib/catalog-registry'

export const metadata: Metadata = {
  title: 'List · Consumit',
  description: 'A member-curated list, preserved in deliberate order.',
}

type ListPageProps = {
  params: Promise<{ slug: string }>
}

export default async function ListPage({ params }: ListPageProps) {
  const { slug } = await params
  let response
  try {
    response = await getCatalogBatch(refsKey(editorialRefs))
  } catch (error) {
    return <CatalogUnavailableScreen error={error} />
  }
  return <ListDetailScreen slug={slug} stale={response.meta.stale} titles={response.items} />
}
