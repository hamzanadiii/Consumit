'use client'

import type { CatalogRef, CatalogTitleSummary, DiaryEntry, MemberProfileArchiveKind, MemberProfileArchivePage } from '@consumit/contracts'
import { kindLabel, titleHref } from '@consumit/contracts'
import { Button, DiaryRow } from '@consumit/ui'
import Link from 'next/link'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { browserCatalogBatches } from '@/lib/catalog-browser'
import { getProfileArchivePage } from '@/lib/identity-browser'
import { formatCalendarDay } from '@/lib/calendar-date'
import { TitleCard } from '../shared/title-card'

type VisitorArchiveKind = Extract<MemberProfileArchiveKind, 'activity' | 'diary' | 'films' | 'history' | 'likes' | 'tags' | 'watchlist'>
type MemberProfileActivityEntry = Extract<MemberProfileArchivePage, { collection: 'activity' }>['items'][number]

function refs(page: MemberProfileArchivePage): CatalogRef[] {
  switch (page.collection) {
    case 'activity': return page.items.map(({ item }) => ({ id: item.id, kind: item.kind }))
    case 'diary': case 'films': case 'likes': case 'watchlist': return page.items
    case 'history': return page.items.map(({ id, kind }) => ({ id, kind }))
    default: return []
  }
}

function archiveItemKey(collection: MemberProfileArchiveKind, item: unknown) {
  const row = item as Record<string, unknown>
  if (collection === 'activity') {
    const nested = row.item as Record<string, unknown>
    return `${String(row.kind)}:${String(row.kind === 'diary' ? nested.entryId : nested.reviewId)}`
  }
  return String(row.entryId ?? row.reviewId ?? row.id ?? row.tag)
}

function appendPage(current: MemberProfileArchivePage, incoming: MemberProfileArchivePage): MemberProfileArchivePage {
  if (current.collection !== incoming.collection || current.collection === 'tags') return incoming
  const known = new Set(current.items.map(item => archiveItemKey(current.collection, item)))
  return {
    ...current,
    items: [...current.items, ...incoming.items.filter(item => !known.has(archiveItemKey(incoming.collection, item)))],
    nextCursor: incoming.nextCursor,
  } as MemberProfileArchivePage
}

function displayDate(value: string) {
  return formatCalendarDay(value, true)
}

function episodeLabel(entry: Pick<DiaryEntry, 'episode' | 'kind' | 'season'>) {
  if (entry.episode === undefined) return 'Movie'
  return entry.kind === 'series'
    ? `S${String(entry.season ?? 0).padStart(2, '0')} E${String(entry.episode).padStart(2, '0')}`
    : `Episode ${entry.episode}`
}

function ActivityRow({ event, titleMap }: { event: MemberProfileActivityEntry; titleMap: ReadonlyMap<string, CatalogTitleSummary> }) {
  if (event.kind === 'review') {
    const review = event.item
    const label = titleMap.get(`${review.kind}:${review.id}`)?.title ?? `${kindLabel(review.kind)} #${review.id}`
    return <DiaryRow action={<Link aria-label={`Read and discuss review of ${label}`} className="inline-flex min-h-11 items-center text-sm font-bold text-[var(--fs-accent)] underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" href={`/reviews/${encodeURIComponent(review.reviewId)}`}>Read and discuss</Link>} artworkSrc={titleMap.get(`${review.kind}:${review.id}`)?.posterUrl ?? undefined} date={displayDate(event.occurredAt)} detail="Review" href={titleHref(review)} key={`review:${review.reviewId}`} note={review.body} title={label} />
  }
  const entry = event.item
  const label = titleMap.get(`${entry.kind}:${entry.id}`)?.title ?? `${kindLabel(entry.kind)} #${entry.id}`
  const detail = `${episodeLabel(entry)}${entry.rewatch ? ' · Rewatch' : ''}${entry.tags.length ? ` · ${entry.tags.map(tag => `#${tag}`).join(' ')}` : ''}`
  return <DiaryRow artworkSrc={titleMap.get(`${entry.kind}:${entry.id}`)?.posterUrl ?? undefined} date={displayDate(event.occurredAt)} detail={detail} href={titleHref(entry)} key={`diary:${entry.entryId}`} title={label} />
}

const labels: Record<VisitorArchiveKind, string> = {
  activity: 'Activity', diary: 'Diary', films: 'Watched', history: 'History', likes: 'Likes', tags: 'Tags', watchlist: 'Watchlist',
}

export function VisitorProfileArchive({ username, collection, initialPage, initialTitles, selectedTag }: {
  username: string
  collection: VisitorArchiveKind
  initialPage: MemberProfileArchivePage
  initialTitles: readonly CatalogTitleSummary[]
  selectedTag?: string
}) {
  const [page, setPage] = useState(initialPage)
  const [titles, setTitles] = useState(initialTitles)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const focusTarget = useRef<'button' | 'heading' | null>(null)
  const [focusVersion, setFocusVersion] = useState(0)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const titleMap = useMemo(() => new Map(titles.map(title => [`${title.kind}:${title.id}`, title])), [titles])

  useLayoutEffect(() => {
    if (focusTarget.current === 'button') buttonRef.current?.focus()
    if (focusTarget.current === 'heading') document.getElementById('visitor-profile-section-heading')?.focus()
    focusTarget.current = null
  }, [focusVersion, page.nextCursor])

  async function loadMore() {
    if (!page.nextCursor || busy) return
    setBusy(true)
    setError(false)
    focusTarget.current = null
    try {
      const next = await getProfileArchivePage(username, collection, page.nextCursor)
      if (next.collection !== collection) throw new Error('Archive mismatch')
      const refsToLoad = refs(next)
      try {
        const details = await browserCatalogBatches(refsToLoad)
        setTitles(current => [...new Map([...current, ...details].map(title => [`${title.kind}:${title.id}`, title])).values()])
      } catch { /* The public archive stays readable without catalog details. */ }
      setPage(current => appendPage(current, next))
      focusTarget.current = next.nextCursor ? 'button' : 'heading'
      setFocusVersion(version => version + 1)
    } catch {
      setError(true)
      focusTarget.current = 'button'
      setFocusVersion(version => version + 1)
    } finally { setBusy(false) }
  }

  const titleLabel = (ref: CatalogRef) => titleMap.get(`${ref.kind}:${ref.id}`)?.title ?? `${kindLabel(ref.kind)} #${ref.id}`
  const items = refs(page)
  const heading = labels[collection]
  const normalizedTag = selectedTag?.trim().toLocaleLowerCase()
  const activityItems = page.collection === 'activity'
    ? page.items.filter(event => !normalizedTag || event.item.tags.some(tag => tag.toLocaleLowerCase() === normalizedTag))
    : []

  return <section aria-labelledby="visitor-profile-section-heading" className="mt-7">
    {page.collection === 'tags' ? (
      page.items.length ? <ul className="flex flex-wrap gap-3">{page.items.map(({ count, tag }) => <li key={tag}><Link className="inline-flex min-h-11 items-center gap-3 rounded-full border border-[var(--fs-field-border)] bg-[var(--fs-field)] px-4 text-sm text-[var(--fs-ink)] outline-none hover:border-[var(--fs-accent)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" href={`/profile/${encodeURIComponent(username)}/activity?tag=${encodeURIComponent(tag)}`}><span>#{tag}</span><span className="text-xs tabular-nums text-[var(--fs-muted)]">{count}</span></Link></li>)}</ul>
        : <p className="text-sm text-[var(--fs-muted)]">No public review tags yet.</p>
    ) : null}

    {page.collection === 'activity' ? (
      <>
        {selectedTag ? <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--fs-line)] pb-3"><p className="text-sm text-[var(--fs-secondary)]" data-public-activity-tag-status role="status">Showing activity tagged “{selectedTag}”.</p><Link className="inline-flex min-h-11 items-center rounded-control font-semibold text-[var(--fs-accent)] underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" href={`/profile/${encodeURIComponent(username)}/activity`}>Show all activity</Link></div> : null}
        {activityItems.length ? <div className="max-w-5xl">{activityItems.map(event => <ActivityRow event={event} key={`${event.kind}:${event.kind === 'review' ? event.item.reviewId : event.item.entryId}`} titleMap={titleMap} />)}</div> : <p className="text-sm text-[var(--fs-muted)]">{selectedTag ? `No public activity tagged “${selectedTag}”.` : 'No public activity to show yet.'}</p>}
      </>
    ) : null}

    {page.collection === 'diary' ? (
      page.items.length ? <div className="max-w-5xl">{page.items.map(entry => {
        const label = titleLabel(entry)
        const detail = `${episodeLabel(entry)}${entry.rewatch ? ' · Rewatch' : ''}${entry.tags.length ? ` · ${entry.tags.map(tag => `#${tag}`).join(' ')}` : ''}`
        return <DiaryRow artworkSrc={titleMap.get(`${entry.kind}:${entry.id}`)?.posterUrl ?? undefined} date={displayDate(entry.watchedOn)} detail={detail} href={titleHref(entry)} key={entry.entryId} title={label} />
      })}</div> : <p className="text-sm text-[var(--fs-muted)]">No public diary entries yet.</p>
    ) : null}

    {page.collection === 'history' ? (
      page.items.length ? <div className="max-w-5xl">{page.items.map(entry => {
        const label = titleLabel(entry)
        const detail = `${entry.kind === 'series' ? `S${String(entry.season ?? 0).padStart(2, '0')} E${String(entry.episode ?? 0).padStart(2, '0')}` : entry.kind === 'anime' ? `Episode ${entry.episode ?? 0}` : 'Movie'} · Completed`
        return <DiaryRow artworkSrc={titleMap.get(`${entry.kind}:${entry.id}`)?.posterUrl ?? undefined} date={displayDate(entry.completedAt)} detail={detail} href={titleHref(entry)} key={entry.entryId} title={label} />
      })}</div> : <p className="text-sm text-[var(--fs-muted)]">No public watch history yet.</p>
    ) : null}

    {page.collection === 'films' || page.collection === 'likes' || page.collection === 'watchlist' ? (
      items.length ? <ul className="grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-3 lg:grid-cols-5">{items.map(ref => {
        const title = titleMap.get(`${ref.kind}:${ref.id}`)
        return <TitleCard href={titleHref(ref)} key={`${ref.kind}:${ref.id}`} meta={kindLabel(ref.kind)} rating={null} title={title ?? { ...ref, title: `${kindLabel(ref.kind)} #${ref.id}`, year: null, posterUrl: null, tmdbRating: null }} />
      })}</ul> : <p className="text-sm text-[var(--fs-muted)]">No public titles {collection === 'likes' ? 'liked' : collection === 'watchlist' ? 'saved for later' : 'watched'} yet.</p>
    ) : null}

    {error ? <p className="mt-5 text-sm text-[var(--fs-danger)]" role="alert">Couldn’t load the next page. Everything already shown is still available.</p> : null}
    {busy ? <p className="sr-only" role="status">Loading more {heading.toLowerCase()}.</p> : null}
    {page.nextCursor || error ? <Button className="mt-6 min-h-11 min-w-11" disabled={busy} onClick={() => void loadMore()} ref={buttonRef} variant="secondary">{busy ? `Loading ${heading.toLowerCase()}…` : error ? `Try again` : `Load more ${heading.toLowerCase()}`}</Button> : null}
  </section>
}
