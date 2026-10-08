'use client'

import type { CatalogRef } from '@consumit/contracts'
import Link from 'next/link'
import { ListVideo, Search } from 'lucide-react'
import { useState } from 'react'

import { PosterStack, buttonVariants } from '@consumit/ui'

import { browserCatalogBatches } from '@/lib/catalog-browser'
import { getMemberLibraryPage, getMemberListDetail } from '@/lib/identity-browser'

import { CreateListForm } from './list-actions'

export type ListCollectionItem = {
  description: string | null
  itemCount: number
  name: string
  posters: readonly (string | undefined)[]
  curator: string
  username: string
  slug: string
  visibility: 'private'
  savedByViewer: boolean
  isOwner: boolean
}

function ListCollageCard({ list }: { list: ListCollectionItem }) {
  const posters = list.posters.slice(0, 5)
  return (
    <li className="min-w-0">
      <article className="min-w-0 border-b border-[var(--fs-line)] pb-5">
        <Link
          aria-label={`${list.name}, ${list.itemCount} ${list.itemCount === 1 ? 'title' : 'titles'}`}
          className="group block rounded-control outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]"
          href={`/lists/${list.slug}`}
          prefetch={false}
        >
          {posters.length === 0 ? (
            <span className="grid aspect-[12/5] w-full place-items-center rounded-control border border-dashed border-[var(--fs-field-border)] bg-[var(--fs-field)]">
              <ListVideo aria-hidden="true" className="size-8 text-[var(--fs-muted)]" />
            </span>
          ) : (
            <PosterStack items={posters.map((src, index) => ({ key: String(index), label: '', src }))} />
          )}
        </Link>
        <div className="mt-4 min-w-0">
          <Link className="font-display text-xl leading-tight tracking-[-0.02em] text-[var(--fs-ink)] outline-none transition-colors hover:text-[var(--fs-accent)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)] sm:text-2xl" href={`/lists/${list.slug}`} prefetch={false}>
            {list.name}
          </Link>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--fs-muted)]">
            <span>Created by {list.curator}</span><span aria-hidden="true">·</span>
            <span className="tabular-nums">{list.itemCount} {list.itemCount === 1 ? 'title' : 'titles'}</span>
            {list.visibility === 'private' ? <span className="rounded-full border border-[var(--fs-field-border)] bg-[var(--fs-rail)] px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase">Private</span> : null}
          </p>
          {list.description ? <p className="mt-3 max-w-[64ch] text-sm leading-6 text-[var(--fs-secondary)] line-clamp-3">{list.description}</p> : null}
        </div>
      </article>
    </li>
  )
}

/**
 * Private lists are the member's own collections.
 */
export type ListsCollectionProps = {
  catalogDetailsLimited?: boolean
  catalogUnavailable?: boolean
  listNextCursor?: string | null
  lists: readonly ListCollectionItem[]
}

export function ListsCollection({ catalogDetailsLimited = false, catalogUnavailable = false, listNextCursor: initialListCursor = null, lists: initialLists }: ListsCollectionProps) {
  const [lists, setLists] = useState<readonly ListCollectionItem[]>(initialLists)
  const [listCursor, setListCursor] = useState(initialListCursor)
  const [loadingCollection, setLoadingCollection] = useState<'lists' | null>(null)
  const [loadError, setLoadError] = useState<'lists' | null>(null)
  const [artworkError, setArtworkError] = useState(false)
  const [sort, setSort] = useState<'updated' | 'title' | 'size'>('updated')
  const [query, setQuery] = useState('')

  const visibleLists = [...lists]
    .filter((list) => !query.trim() || list.name.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
    .sort((left, right) => sort === 'title' ? left.name.localeCompare(right.name) : sort === 'size' ? right.itemCount - left.itemCount : 0)

  async function loadMore(collection: 'lists') {
    const cursor = listCursor
    if (!cursor || loadingCollection) return
    setLoadingCollection(collection)
    setLoadError(null)
    try {
      const page = await getMemberLibraryPage(collection, cursor)
      const covers = new Map<string, readonly CatalogRef[]>()
      if (page.collection === 'lists') {
        await Promise.all(page.items.slice(0, 8).map(async (list) => {
          try {
            const detail = await getMemberListDetail(list.slug)
            covers.set(list.slug, detail.items.slice(0, 5))
          } catch { /* Keep the list card available without artwork. */ }
        }))
      }
      const refs = [...new Map([...covers.values()].flat().map((ref) => [`${ref.kind}:${ref.id}`, ref])).values()].slice(0, 120)
      const postersByRef = new Map<string, string>()
      try {
        const titles = await browserCatalogBatches(refs)
        for (const title of titles) postersByRef.set(`${title.kind}:${title.id}`, title.posterUrl ?? '')
      } catch { setArtworkError(true) }
      const postersFor = (slug: string) => (covers.get(slug) ?? []).map((ref) => postersByRef.get(`${ref.kind}:${ref.id}`) || undefined)
      if (page.collection === 'lists') {
        const added: ListCollectionItem[] = page.items.map((list) => ({
          curator: 'You', description: list.description, isOwner: true, itemCount: list.itemCount, name: list.name,
          posters: postersFor(list.slug), savedByViewer: false, slug: list.slug, username: 'you', visibility: list.visibility,
        }))
        setLists((current) => [...current, ...added.filter((item) => !current.some((existing) => existing.slug === item.slug))])
        setListCursor(page.nextCursor)
      }
    } catch {
      setLoadError(collection)
    } finally {
      setLoadingCollection(null)
    }
  }

  return (
      <div data-consumit-lists-collection>
          {catalogUnavailable ? (
            <p className="mt-4 text-xs leading-5 text-[var(--fs-muted)]" role="status">
              Your lists are available, but catalog artwork and title details could not load.
            </p>
          ) : null}
          {catalogDetailsLimited && !catalogUnavailable ? <p className="mt-4 text-xs text-[var(--fs-muted)]" role="status">Poster details are loaded for the first 120 unique titles. Every list remains available.</p> : null}
          {artworkError ? <p className="mt-3 text-xs text-[var(--fs-muted)]" role="status">Some poster details could not load. Your lists are still available.</p> : null}

          <div className="mt-5 grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-10">
            <div className="min-w-0">
              <section className="scroll-mt-8" id="your-lists" aria-labelledby="your-lists-heading">
                <h2 className="sr-only" id="your-lists-heading">Your lists</h2>
                <div className="flex flex-col gap-3 border-b border-[var(--fs-line)] pb-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                  <label className="flex h-10 w-full items-center gap-2 rounded-control border border-[var(--fs-field-border)] bg-[var(--fs-field)] px-3 text-[var(--fs-muted)] focus-within:ring-2 focus-within:ring-[var(--fs-focus)] sm:w-44">
                    <Search aria-hidden="true" className="size-3.5 shrink-0" />
                    <span className="sr-only">Search your lists</span>
                    <input className="min-w-0 w-full bg-transparent text-xs text-[var(--fs-ink)] outline-none placeholder:text-[var(--fs-muted)]" onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Find a collection" type="search" value={query} />
                  </label>
                  <p className="text-xs tabular-nums text-[var(--fs-muted)]">{visibleLists.length}{listCursor ? '+' : ''} {visibleLists.length === 1 && !listCursor ? 'list' : 'lists'} in this view</p>
                  <label className="flex min-h-11 items-center gap-3 text-xs text-[var(--fs-muted)]">Sort by
                    <select aria-label="Sort your lists" className="h-10 rounded-control border border-[var(--fs-field-border)] bg-[var(--fs-field)] px-3 text-xs font-bold text-[var(--fs-ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" onChange={(event) => setSort(event.currentTarget.value as 'updated' | 'title' | 'size')} value={sort}>
                      <option value="updated">When updated</option><option value="title">Title</option><option value="size">Most titles</option>
                    </select>
                  </label>
                </div>
                {listCursor ? <p className="mt-3 text-xs text-[var(--fs-muted)]" role="status">Filters and sorting apply to loaded lists. Load more to include older lists.</p> : null}
                {visibleLists.length === 0 ? (
                  <div className="mt-6 border-y border-[var(--fs-line)] py-8 text-sm leading-6 text-[var(--fs-muted)]">
                    {lists.length === 0 ? 'No lists yet. Save a title to a list from any title page.' : 'No lists match these filters. Try another search.'}
                  </div>
                ) : (
                  <ul className="mt-6 grid gap-x-6 gap-y-8 xl:grid-cols-2">
                    {visibleLists.map((list) => <ListCollageCard key={list.slug} list={list} />)}
                  </ul>
                )}
                {loadError === 'lists' ? <p className="mt-4 text-sm text-[var(--fs-danger)]" role="alert">Your next lists page could not load.</p> : null}
                {loadingCollection === 'lists' ? <p className="mt-3 text-sm text-[var(--fs-muted)]" role="status">Loading your next lists page.</p> : null}
                {listCursor || loadError === 'lists' ? <button className={`${buttonVariants({ variant: 'secondary' })} mt-6`} disabled={loadingCollection !== null} onClick={() => void loadMore('lists')} type="button">{loadingCollection === 'lists' ? 'Loading lists…' : loadError === 'lists' ? 'Try again' : 'Load more lists'}</button> : null}
              </section>

            </div>

            <aside className="order-first min-w-0 lg:sticky lg:top-6 lg:order-last">
              <CreateListForm />
              <section className="mt-6 border-t border-[var(--fs-line)] pt-5">
                <h2 className="font-display text-xl text-[var(--fs-ink)]">Make it yours.</h2>
                <p className="mt-2 text-xs leading-5 text-[var(--fs-muted)]">Start with a handful of titles. Shape your private collections in the order you want to revisit them.</p>
              </section>
            </aside>
          </div>
      </div>
  )
}
