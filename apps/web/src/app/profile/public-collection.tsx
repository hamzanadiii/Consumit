'use client'

import { kindLabel, titleHref, type CatalogTitleSummary, type PublicProfileCollection, type PublicProfileCollectionPage } from '@consumit/contracts'
import { Button } from '@consumit/ui'
import Link from 'next/link'
import { useRef, useState } from 'react'
import { browserCatalogBatches } from '@/lib/catalog-browser'
import { getProfileCollection } from '@/lib/identity-browser'
import { MemberRows } from './member-rows'
import { TitleCard } from '../shared/title-card'

export function PublicCollection({ username, collection, initialPage, initialTitles = [], owner = false }: { username: string; collection: PublicProfileCollection; initialPage: PublicProfileCollectionPage | null; initialTitles?: readonly CatalogTitleSummary[]; owner?: boolean }) {
  const [pages, setPages] = useState(initialPage ? [initialPage] : [])
  const [titles, setTitles] = useState(initialTitles)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(!initialPage)
  const lock = useRef(false)
  const cursor = pages.at(-1)?.nextCursor
  async function load() {
    if (lock.current) return
    lock.current = true; setBusy(true); setError(false)
    try {
      const page = await getProfileCollection(username, collection, cursor ?? undefined)
      if (page.collection !== collection) throw new Error('Collection mismatch')
      if (page.collection === 'ratings' || page.collection === 'reviews') {
        try { const enriched = await browserCatalogBatches(page.items); setTitles(current => [...current, ...enriched]) } catch { /* Stored taste remains readable. */ }
      }
      setPages(current => [...current, page])
    } catch { setError(true) }
    finally { lock.current = false; setBusy(false) }
  }
  const empty = pages.length > 0 && pages.every(page => page.items.length === 0)
  return <div aria-busy={busy}>
    {empty ? <p className="py-8 text-sm text-[var(--fs-muted)]">No {collection === 'lists' ? 'public lists' : collection} to show yet.</p> : null}
    {pages.map((page, index) => <div key={index}>
      {page.collection === 'followers' || page.collection === 'following' ? <MemberRows canUnfollowPrivate={owner && page.collection === 'following'} items={page.items} /> : null}
      {page.collection === 'lists' ? <ul className="divide-y divide-[var(--fs-line)]">{page.items.map(list => <li className="py-5" key={list.id}><Link className="font-display text-2xl text-[var(--fs-ink)] hover:text-[var(--fs-accent)]" href={`/lists/${list.slug}`}>{list.name}</Link><p className="mt-2 text-xs text-[var(--fs-muted)]">{list.itemCount} titles</p>{list.description ? <p className="mt-3 max-w-[70ch] whitespace-pre-wrap text-sm leading-6 text-[var(--fs-secondary)]">{list.description}</p> : null}</li>)}</ul> : null}
      {page.collection === 'ratings' ? <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-5">{page.items.map(item => { const title = titles.find(title => title.id === item.id && title.kind === item.kind); return <TitleCard href={titleHref(item)} key={`${item.kind}:${item.id}`} meta={kindLabel(item.kind)} rating={null} signal={<span className="text-sm font-bold text-[var(--fs-accent)]">{item.value} / 10</span>} title={title ?? { ...item, title: `${kindLabel(item.kind)} #${item.id}`, year: null, posterUrl: null, tmdbRating: null }} /> })}</ul> : null}
      {page.collection === 'reviews' ? <ul className="divide-y divide-[var(--fs-line)]">{page.items.map(item => <li className="py-6" key={item.reviewId}><Link className="text-lg font-bold text-[var(--fs-ink)] hover:text-[var(--fs-accent)]" href={titleHref(item)}>{titles.find(title => title.id === item.id && title.kind === item.kind)?.title ?? `${kindLabel(item.kind)} #${item.id}`}</Link>{item.reviewedOn ? <time className="ml-3 text-xs text-[var(--fs-muted)]" dateTime={item.reviewedOn}>{item.reviewedOn}</time> : null}<p className="mt-3 max-w-[70ch] whitespace-pre-wrap break-words text-sm leading-7 text-[var(--fs-secondary)]">{item.body}</p></li>)}</ul> : null}
    </div>)}
    {error ? <p className="mt-6 text-sm text-[var(--fs-danger)]" role="alert">These {collection} could not load. Try again.</p> : null}
    {cursor || error ? <Button className="mt-6" disabled={busy} onClick={() => void load()} variant="secondary">{busy ? 'Loading…' : error ? 'Try again' : 'Load more'}</Button> : null}
    <p className="sr-only" role="status">{busy ? `Loading ${collection}` : ''}</p>
  </div>
}
