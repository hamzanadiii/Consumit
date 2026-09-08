import type { Metadata } from 'next'
import type { CatalogTitleSummary } from '@consumit/contracts'

import { ListDetailScreen } from '../list-detail-screen'
import { notFound } from 'next/navigation'

import { getCatalogBatch, refsKey } from '@/lib/catalog-api'
import { getMemberList, MemberApiError } from '@/lib/member-server'

export const metadata: Metadata = {
  title: 'List · Consumit',
  description: 'A member-curated list, preserved in deliberate order.',
}

type ListPageProps = {
  params: Promise<{ slug: string }>
}

export default async function ListPage({ params }: ListPageProps) {
  const { slug } = await params
  let list
  try {
    list = await getMemberList(slug)
  } catch (error) {
    if (error instanceof MemberApiError && error.status === 404) notFound()
    throw error
  }
  let titles: CatalogTitleSummary[] = []
  let catalogUnavailable = false
  try { titles = list.items.length ? (await getCatalogBatch(refsKey(list.items))).items : [] } catch { catalogUnavailable = true }
  return <ListDetailScreen catalogUnavailable={catalogUnavailable} data={list} titles={titles} />
}
