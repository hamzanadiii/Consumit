import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import type { CatalogRef, CatalogTitleSummary } from '@consumit/contracts'

import { getCatalogBatch, refsKey } from '@/lib/catalog-api'
import { getServerSession } from '@/lib/identity-server'
import { getMemberLibrary, getMemberList } from '@/lib/member-server'

import { ListsScreen, type ListsScreenList } from './lists-screen'
import { SessionUnavailableScreen } from '../session/protected-page'

export const metadata: Metadata = {
  description: 'Your curated lists of films and series.',
  robots: { follow: false, index: false },
  title: 'Lists · Consumit',
}

// Lists beyond this count render without collage artwork: each needs its own
// detail read, so enrichment stays bounded while the full shelf still shows.
const ENRICHED_LIST_LIMIT = 8
const COLLAGE_SIZE = 5

export default async function ListsPage() {
  const session = await getServerSession()
  if (session.status === 'anonymous') redirect('/sign-in?next=%2Flists')
  if (session.status === 'unavailable') redirect('/sign-in?next=%2Flists')

  const library = await getMemberLibrary()
  const itemsBySlug = new Map<string, CatalogRef[]>()
  await Promise.all(library.lists.slice(0, ENRICHED_LIST_LIMIT).map(async (list) => {
    try {
      const detail = await getMemberList(list.slug)
      itemsBySlug.set(list.slug, detail.items.slice(0, COLLAGE_SIZE))
    } catch {
      // A single unreadable list never sinks the page; its card renders artless.
    }
  }))
  const refs = [...itemsBySlug.values()].flat()
  let posters = new Map<string, CatalogTitleSummary>()
  let catalogUnavailable = false
  if (refs.length > 0) {
    try {
      const batch = await getCatalogBatch(refsKey(refs))
      posters = new Map(batch.items.map((title) => [`${title.kind}:${title.id}`, title]))
    } catch {
      catalogUnavailable = true
    }
  }
  const lists: ListsScreenList[] = library.lists.map((list) => ({
    description: list.description,
    itemCount: list.itemCount,
    name: list.name,
    posters: (itemsBySlug.get(list.slug) ?? []).map((ref) => posters.get(`${ref.kind}:${ref.id}`)?.posterUrl ?? undefined),
    slug: list.slug,
    visibility: list.visibility,
  }))
  return <ListsScreen catalogUnavailable={catalogUnavailable} lists={lists} />
}
