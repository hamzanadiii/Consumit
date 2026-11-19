import type { Metadata } from 'next'
import { tasteListReadSchema, type CatalogTitleSummary } from '@consumit/contracts'

import { ListPublication } from '../../taste/list-publication'
import { notFound } from 'next/navigation'

import { getCatalogBatchForRefs } from '@/lib/catalog-api'
import { getServerSession } from '@/lib/identity-server'
import { getListRead, MemberApiError, memberRequest } from '@/lib/member-server'

type ListPageProps = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: ListPageProps): Promise<Metadata> {
  const { slug } = await params
  try {
    const list = await getListRead(slug)
    const description = list.list.description ?? `A member-curated collection of ${list.items.length} titles, kept in deliberate order.`
    const indexable = list.list.visibility === 'public'
    return {
      title: `${list.list.name} · Consumit`,
      description,
      alternates: { canonical: `/lists/${encodeURIComponent(slug)}` },
      robots: { follow: indexable, index: indexable },
      openGraph: { title: `${list.list.name} · Consumit`, description, type: 'website' },
      twitter: { card: 'summary', title: `${list.list.name} · Consumit`, description },
    }
  } catch (error) {
    if (error instanceof MemberApiError && error.status === 404) return { title: 'List unavailable · Consumit', robots: { index: false, follow: false } }
    throw error
  }
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
  try {
    const resolved = await getCatalogBatchForRefs(list.items)
    titles = resolved?.items ?? []
  } catch { /* Stored list titles remain readable without artwork. */ }
  const layout = await memberRequest(`/v1/taste/lists/${list.list.id}`, tasteListReadSchema)
  return <ListPublication data={list} layout={layout.layout} watched={layout.watched} signedIn={session.status === 'authenticated'} titles={titles} />
}
