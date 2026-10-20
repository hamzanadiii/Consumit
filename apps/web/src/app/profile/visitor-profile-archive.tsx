'use client'

import type { CatalogRef, CatalogTitleSummary, MemberProfileArchivePage } from '@consumit/contracts'
import { kindLabel, titleHref } from '@consumit/contracts'
import { Button } from '@consumit/ui'
import Link from 'next/link'
import { useState } from 'react'
import { browserCatalogBatches } from '@/lib/catalog-browser'
import { getProfileArchivePage } from '@/lib/identity-browser'
import { TitleCard } from '../shared/title-card'

type PublicArchiveKind = 'likes' | 'tags' | 'watchlist'
function refs(page: MemberProfileArchivePage): CatalogRef[] {
  return page.collection === 'likes' || page.collection === 'watchlist' ? page.items : []
}

export function VisitorProfileArchive({ username, collection, initialPage, initialTitles }: {
  username: string
  collection: PublicArchiveKind
  initialPage: MemberProfileArchivePage
  initialTitles: readonly CatalogTitleSummary[]
}) {
  const [page, setPage] = useState(initialPage)
  const [titles, setTitles] = useState(initialTitles)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  async function loadMore() {
    if (!page.nextCursor || busy) return
    setBusy(true)
    setError(false)
    try {
      const next = await getProfileArchivePage(username, collection, page.nextCursor)
      if (next.collection !== collection) throw new Error('Archive mismatch')
      const refsToLoad = refs(next)
      try {
        const details = await browserCatalogBatches(refsToLoad)
        setTitles(current => [...current, ...details.filter(detail => !current.some(existing => existing.kind === detail.kind && existing.id === detail.id))])
      } catch { /* The saved references remain readable without catalog details. */ }
      setPage(current => current.collection === collection ? { ...current, items: [...current.items, ...next.items] } as MemberProfileArchivePage : next)
    } catch { setError(true) } finally { setBusy(false) }
  }

  if (page.collection === 'tags') return page.items.length ? <ul className="flex flex-wrap gap-3">{page.items.map(({ count, tag }) => <li key={tag}><Link className="inline-flex min-h-11 items-center gap-3 rounded-full border border-[var(--fs-field-border)] bg-[var(--fs-field)] px-4 text-sm text-[var(--fs-ink)] hover:border-[var(--fs-accent)]" href={`/profile/${encodeURIComponent(username)}/tags?tag=${encodeURIComponent(tag)}`}><span>#{tag}</span><span className="text-xs tabular-nums text-[var(--fs-muted)]">{count}</span></Link></li>)}</ul> : <p className="text-sm text-[var(--fs-muted)]">No public review tags yet.</p>

  const items = refs(page)
  const label = collection === 'likes' ? 'liked' : 'saved for later'
  return <div>
    {items.length ? <ul className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-5">{items.map(ref => {
      const title = titles.find(item => item.kind === ref.kind && item.id === ref.id)
      return <TitleCard href={titleHref(ref)} key={`${ref.kind}:${ref.id}`} meta={kindLabel(ref.kind)} rating={null} title={title ?? { ...ref, title: `${kindLabel(ref.kind)} #${ref.id}`, year: null, posterUrl: null, tmdbRating: null }} />
    })}</ul> : <p className="text-sm text-[var(--fs-muted)]">No public titles {label} yet.</p>}
    {error ? <p className="mt-5 text-sm text-[var(--fs-danger)]" role="alert">This archive page could not load. Try again.</p> : null}
    {page.nextCursor || error ? <Button className="mt-6" disabled={busy} onClick={() => void loadMore()} variant="secondary">{busy ? 'Loading…' : error ? 'Try again' : 'Load more'}</Button> : null}
  </div>
}
