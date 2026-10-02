import type { CatalogRef, CatalogTitleSummary } from '@consumit/contracts'

import { getCatalogBatchForRefs, MAX_PAGE_CATALOG_ENRICHMENT } from '@/lib/catalog-api'
import { getMemberLibrarySnapshot, getMemberList } from '@/lib/member-server'

import type { ListCollectionItem, ListsCollectionProps } from './lists-collection'

// Lists beyond this count render without collage artwork: each needs its own
// detail read, so enrichment stays bounded while the full shelf still shows.
const ENRICHED_LIST_LIMIT = 8
const COLLAGE_SIZE = 5

export async function loadListsCollection(username: string): Promise<ListsCollectionProps> {
  const library = await getMemberLibrarySnapshot()
  const itemsBySlug = new Map<string, CatalogRef[]>()
  await Promise.all(library.lists.items.slice(0, ENRICHED_LIST_LIMIT).map(async (list) => {
    try {
      const detail = await getMemberList(list.slug)
      itemsBySlug.set(list.slug, detail.items.slice(0, COLLAGE_SIZE))
    } catch {
      // A single unreadable list never sinks the page; its card renders artless.
    }
  }))
  const cardRefs = [...library.savedLists.items.flatMap((item) => item.coverTitles)]
  const refs = [...itemsBySlug.values()].flat().concat(cardRefs)
  let posters = new Map<string, CatalogTitleSummary>()
  let catalogUnavailable = false
  const catalogDetailsLimited = new Set(refs.map((ref) => `${ref.kind}:${ref.id}`)).size > MAX_PAGE_CATALOG_ENRICHMENT
  if (refs.length > 0) {
    try {
      const batch = await getCatalogBatchForRefs(refs)
      posters = new Map((batch?.items ?? []).map((title) => [`${title.kind}:${title.id}`, title]))
    } catch {
      catalogUnavailable = true
    }
  }
  const lists: ListCollectionItem[] = library.lists.items.map((list) => ({
    description: list.description,
    itemCount: list.itemCount,
    name: list.name,
    posters: (itemsBySlug.get(list.slug) ?? []).map((ref) => posters.get(`${ref.kind}:${ref.id}`)?.posterUrl ?? undefined),
    curator: 'You',
    username,
    slug: list.slug,
    visibility: list.visibility,
    savedByViewer: false,
    isOwner: true,
  }))
  const savedLists: ListCollectionItem[] = library.savedLists.items.map(({ coverTitles, list, owner }) => ({
    curator: owner.displayName ?? owner.username,
    description: list.description,
    isOwner: false,
    itemCount: list.itemCount,
    name: list.name,
    posters: coverTitles.map((ref) => posters.get(`${ref.kind}:${ref.id}`)?.posterUrl ?? undefined),
    savedByViewer: true,
    slug: list.slug,
    username: owner.username,
    visibility: 'public',
  }))
  return { catalogDetailsLimited, catalogUnavailable, listNextCursor: library.lists.nextCursor, lists, savedLists, savedListNextCursor: library.savedLists.nextCursor }
}
