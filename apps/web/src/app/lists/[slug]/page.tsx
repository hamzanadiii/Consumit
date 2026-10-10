import type { Metadata } from 'next'
import type { CatalogTitleSummary } from '@consumit/contracts'

import { ListDetailScreen } from '../list-detail-screen'
import { notFound } from 'next/navigation'

import { getCatalogBatchForRefs, MAX_PAGE_CATALOG_ENRICHMENT } from '@/lib/catalog-api'
import { getServerSession } from '@/lib/identity-server'
import { getListRead, MemberApiError } from '@/lib/member-server'

export const metadata: Metadata = {
  title: 'List · Consumit',
  description: 'A member-curated list, preserved in deliberate order.',
  robots: { follow: false, index: false },
}

type ListPageProps = {
  params: Promise<{ slug: string }>
}

export default async function ListPage({ params }: ListPageProps) {
  const { slug } = await params
  const session = await getServerSession()
  let list
  try {
    list = await getListRead(slug)
  } catch (error) {
    if (error instanceof MemberApiError && error.status === 404) notFound()
    throw error
  }
  let titles: CatalogTitleSummary[] = []
  let catalogUnavailable = false
  try { titles = (await getCatalogBatchForRefs(list.items))?.items ?? [] } catch { catalogUnavailable = true }
  const catalogDetailsLimited = new Set(list.items.map((item) => `${item.kind}:${item.id}`)).size > MAX_PAGE_CATALOG_ENRICHMENT
  return <ListDetailScreen catalogDetailsLimited={catalogDetailsLimited} catalogUnavailable={catalogUnavailable} data={list} signedIn={session.status === 'authenticated'} titles={titles} />
}
