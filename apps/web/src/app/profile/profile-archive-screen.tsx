'use client'

import {
  diaryEntryHref,
  kindLabel,
  titleHref,
  type CatalogRef,
  type CatalogTitleSummary,
  type DiaryEntry,
  type MemberProfileArchiveKind,
  type MemberProfileArchivePage,
  type MemberProfileData,
  type MemberRating,
} from '@consumit/contracts'
import { ArrowUpRight, LoaderCircle, Search } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, type ReactNode } from 'react'

import { ArtworkFrame, PosterStack, buttonVariants } from '@consumit/ui'

import { TitleCollectionFilters, titleDecade, type TitleCollectionSort } from '../shared/title-collection-filters'
import { TitleCard } from '../shared/title-card'
import { matchesRatingFilter, type RatingRangeValue } from '../shared/rating-filter'
import type { ProfileSectionId } from './profile-section-navigation'
import { ProfileArchiveShell } from './profile-archive-shell'
import { DiaryCollection } from './diary-collection'
import { browserCatalogBatches } from '@/lib/catalog-browser'
import { getMemberListDetail, getMemberRatingPage, getMemberRatingsForTitles, getProfileArchivePage } from '@/lib/identity-browser'

const ARCHIVE_SIZE = 30
const COLLAGE_SIZE = 5
const EMPTY_RATINGS: readonly MemberRating[] = []
const EMPTY_TITLES: readonly CatalogTitleSummary[] = []

function refKey(ref: CatalogRef) { return `${ref.kind}:${ref.id}` }

function episodeLabel(entry: DiaryEntry) {
  if (entry.episode === undefined) return ''
  if (entry.kind === 'series') return `S${String(entry.season ?? 0).padStart(2, '0')} E${String(entry.episode).padStart(2, '0')}`
  return `Episode ${entry.episode}`
}

function displayDate(value: string, withYear = false) {
  return new Date(`${value.slice(0, 10)}T00:00:00Z`).toLocaleDateString('en-US', { day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' } : {}) })
}

function pageKey(collection: MemberProfileArchivePage['collection'], item: unknown) {
  const row = item as Record<string, unknown>
  switch (collection) {
    case 'activity': {
      const nested = row.item as Record<string, unknown>
      return `${String(row.kind)}:${String(row.kind === 'diary' ? nested.entryId : nested.reviewId)}`
    }
    case 'diary': return String(row.entryId)
    case 'films': case 'likes': return `${String(row.kind)}:${String(row.id)}`
    case 'lists': return String(row.id)
    case 'reviews': return String(row.reviewId)
    case 'tags': return String(row.tag)
  }
}

function appendPage(current: MemberProfileArchivePage | undefined, incoming: MemberProfileArchivePage): MemberProfileArchivePage {
  if (!current || current.collection !== incoming.collection || current.collection === 'tags') return incoming
  const existing = new Set(current.items.map((item) => pageKey(current.collection, item)))
  const items = [...current.items, ...incoming.items.filter((item) => !existing.has(pageKey(incoming.collection, item)))]
  return { ...current, items, nextCursor: incoming.nextCursor } as MemberProfileArchivePage
}

function refsInPage(page: MemberProfileArchivePage): CatalogRef[] {
  switch (page.collection) {
    case 'activity': return page.items.map((event) => ({ id: event.item.id, kind: event.item.kind }))
    case 'diary': case 'films': case 'likes': case 'reviews': return page.items.map(({ id, kind }) => ({ id, kind }))
    default: return []
  }
}

function EmptyArchive({ children }: { children: string }) {
  return <div className="mt-7 rounded-card border border-dashed border-[var(--fs-field-border)] bg-[var(--fs-field)] px-6 py-12 text-sm leading-6 text-[var(--fs-muted)]">{children}</div>
}

export function ProfileArchiveScreen({ data, initialPage, initialRatings = EMPTY_RATINGS, listPosters = {}, owner = false, ratingTotalCount, ratingsUnavailable = false, selectedRating, selectedTag, section, titles: initialTitles = EMPTY_TITLES }: {
  data: MemberProfileData
  initialPage: MemberProfileArchivePage
  listPosters?: Readonly<Record<string, readonly (string | undefined)[]>>
  initialRatings?: readonly MemberRating[]
  owner?: boolean
  ratingTotalCount?: number
  ratingsUnavailable?: boolean
  selectedRating?: number | 'none' | RatingRangeValue
  selectedTag?: string
  section: Exclude<ProfileSectionId, 'overview' | 'watchlist' | 'history'>
  titles?: readonly CatalogTitleSummary[]
}) {
  const router = useRouter()
  const [pages, setPages] = useState<Record<string, MemberProfileArchivePage>>(() => ({
    [initialPage.collection]: initialPage,
  }))
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [catalogError, setCatalogError] = useState(false)
  const [titles, setTitles] = useState<readonly CatalogTitleSummary[]>(initialTitles)
  const [ratingsByTitle, setRatingsByTitle] = useState<Record<string, number>>(() => Object.fromEntries(initialRatings.map(({ id, kind, value }) => [`${kind}:${id}`, value])))
  const [ratingsUnavailableState, setRatingsUnavailableState] = useState(ratingsUnavailable)
  const [posters, setPosters] = useState<Readonly<Record<string, readonly (string | undefined)[]>>>(listPosters)
  const [query, setQuery] = useState('')
  const [genre, setGenre] = useState('all')
  const [decade, setDecade] = useState('all')
  const [titleSort, setTitleSort] = useState<TitleCollectionSort>('recent')
  const [listVisibility, setListVisibility] = useState<'all' | 'public' | 'private'>('all')
  const [listSort, setListSort] = useState<'recent' | 'title' | 'size'>('recent')
  useEffect(() => {
    let cancelled = false
    queueMicrotask(() => {
      if (cancelled) return
      setPages({ [initialPage.collection]: initialPage })
      setTitles(initialTitles)
      setRatingsByTitle(Object.fromEntries(initialRatings.map(({ id, kind, value }) => [`${kind}:${id}`, value])))
      setRatingsUnavailableState(ratingsUnavailable)
      setLoadError(false)
      setCatalogError(false)
    })
    return () => { cancelled = true }
  }, [data.profile.username, initialPage, initialRatings, initialTitles, ratingsUnavailable, selectedRating])

  const name = data.profile.displayName ?? data.profile.username
  const username = data.profile.username
  const archiveKind: MemberProfileArchiveKind = section
  const page = pages[archiveKind] ?? initialPage
  const titleMap = useMemo(() => new Map(titles.map((title) => [refKey(title), title])), [titles])
  const genres = useMemo(() => [...new Set([...titles.flatMap((title) => title.genreNames), ...(genre === 'all' ? [] : [genre])])].sort((left, right) => left.localeCompare(right)), [genre, titles])
  const decades = useMemo(() => [...new Set(titles.flatMap((title) => { const value = titleDecade(title.year); return value ? [value] : [] }))].sort((left, right) => Number(right) - Number(left)), [titles])


  async function loadMore() {
    if (!page.nextCursor || loading) return
    setLoading(true)
    setLoadError(false)
    setCatalogError(false)
    try {
      let addedRatings: readonly MemberRating[] = []
      const incoming: MemberProfileArchivePage = typeof selectedRating !== 'number'
        ? await getProfileArchivePage(username, page.collection, page.nextCursor, ARCHIVE_SIZE)
        : await getMemberRatingPage(selectedRating, page.nextCursor, ARCHIVE_SIZE).then((ratings) => {
          addedRatings = ratings.items
          return {
            collection: 'films' as const,
            items: ratings.items.map(({ id, kind, origin, sourceKey }) => ({ id, kind, origin, sourceKey })),
            nextCursor: ratings.nextCursor,
          }
        })
      const refs = refsInPage(incoming)
      if ((incoming.collection === 'films' || incoming.collection === 'diary') && owner && typeof selectedRating !== 'number') {
        try { addedRatings = await getMemberRatingsForTitles(refs.slice(0, 50)) }
        catch { setRatingsUnavailableState(true) }
      }
      if (addedRatings.length) setRatingsByTitle((current) => ({ ...current, ...Object.fromEntries(addedRatings.map(({ id, kind, value }) => [`${kind}:${id}`, value])) }))
      setPages((current) => ({ ...current, [incoming.collection]: appendPage(current[incoming.collection], incoming) }))
      if (incoming.collection === 'lists') {
        const listRefs = (await Promise.all(incoming.items.slice(0, 16).map(async (list) => {
          try { return [list.slug, (await getMemberListDetail(list.slug)).items.slice(0, COLLAGE_SIZE).map(({ id, kind }) => ({ id, kind }))] as const }
          catch { return [list.slug, []] as const }
        })))
        const uniqueRefs = listRefs.flatMap(([, refs]) => refs)
        let loaded: readonly CatalogTitleSummary[] = []
        if (uniqueRefs.length) {
          try { loaded = await browserCatalogBatches(uniqueRefs) }
          catch { setCatalogError(true) }
        }
        const posterByRef = new Map(loaded.map((title) => [refKey(title), title.posterUrl ?? undefined]))
        setPosters((current) => ({ ...current, ...Object.fromEntries(listRefs.map(([slug, refs]) => [slug, refs.map((ref) => posterByRef.get(refKey(ref)))])) }))
        setTitles((current) => [...new Map([...current, ...loaded].map((title) => [refKey(title), title])).values()])
      } else if (refs.length) {
        try {
          const loaded = await browserCatalogBatches(refs)
          setTitles((current) => [...new Map([...current, ...loaded].map((title) => [refKey(title), title])).values()])
        } catch { setCatalogError(true) }
      }
    } catch {
      setLoadError(true)
    } finally {
      setLoading(false)
    }
  }

  let entries: ReactNode
  let visibleTitleCount: number | undefined
  switch (page.collection) {
    case 'activity': {
      const normalizedTag = selectedTag?.trim().toLocaleLowerCase()
      const filtered = page.items.filter((event) => (!normalizedTag || event.item.tags.some((tag) => tag.toLocaleLowerCase() === normalizedTag)) && (query.trim() === '' || (titleMap.get(refKey(event.item))?.title ?? '').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())))
      entries = filtered.length ? <ol className="mt-7 divide-y divide-[var(--fs-line)] border-y border-[var(--fs-line)]">{filtered.map((event) => {
        const ref = event.item
        const title = titleMap.get(refKey(ref))
        const label = title?.title ?? `${kindLabel(ref.kind)} #${ref.id}`
        const diaryEvent = event.kind === 'diary'
        const detail = diaryEvent ? [event.item.rewatch ? 'Rewatched' : 'Watched', episodeLabel(event.item)].filter(Boolean).join(' · ') : 'Published a review'
        return <li className="py-4" key={pageKey(page.collection, event)}><article className="grid grid-cols-[3rem_3.5rem_minmax(0,1fr)] items-center gap-4"><time className="text-center text-xs font-bold text-[var(--fs-muted)]" dateTime={event.occurredAt}>{displayDate(diaryEvent ? event.item.watchedOn : event.item.reviewedOn ?? event.occurredAt)}</time><Link href={titleHref(ref)}><ArtworkFrame alt={`${label} poster`} className="rounded-control" ratio="square" src={title?.posterUrl ?? undefined} /></Link><div className="min-w-0"><p className="text-sm text-[var(--fs-secondary)]"><Link className="font-bold text-[var(--fs-ink)] hover:text-[var(--fs-accent)]" href={diaryEvent ? diaryEntryHref(event.item) : titleHref(ref)}>{label}</Link><span className="text-[var(--fs-muted)]"> · {detail}</span></p>{!diaryEvent && <p className="mt-2 line-clamp-3 text-sm leading-6 text-[var(--fs-secondary)]">{event.item.body}</p>}</div></article></li>
      })}</ol> : <EmptyArchive>{selectedTag ? `No loaded activity is tagged “${selectedTag}”.` : 'No public watches or reviews have been logged yet.'}</EmptyArchive>
      break
    }
    case 'films': case 'likes': {
      const normalizedQuery = query.trim().toLocaleLowerCase()
      const filtered = page.items.filter((ref) => {
        const title = titleMap.get(refKey(ref))
        if (normalizedQuery && !(title?.title ?? '').toLocaleLowerCase().includes(normalizedQuery)) return false
        if (page.collection === 'films' && genre !== 'all' && !title?.genreNames.includes(genre)) return false
        if (page.collection === 'films' && decade !== 'all' && titleDecade(title?.year) !== decade) return false
        if (page.collection === 'films' && typeof selectedRating === 'string') {
          if (ratingsUnavailableState || !matchesRatingFilter(selectedRating, ratingsByTitle[refKey(ref)])) return false
        }
        return true
      })
      const sorted = page.collection !== 'films' || titleSort === 'recent' ? filtered : [...filtered].sort((left, right) => {
        const leftTitle = titleMap.get(refKey(left))
        const rightTitle = titleMap.get(refKey(right))
        if (titleSort === 'title') return (leftTitle?.title ?? '').localeCompare(rightTitle?.title ?? '')
        const leftDate = leftTitle?.releaseDate ?? (leftTitle?.year ? `${leftTitle.year}-01-01` : null)
        const rightDate = rightTitle?.releaseDate ?? (rightTitle?.year ? `${rightTitle.year}-01-01` : null)
        if (leftDate === null) return rightDate === null ? 0 : 1
        if (rightDate === null) return -1
        return titleSort === 'release-newest' ? rightDate.localeCompare(leftDate) : leftDate.localeCompare(rightDate)
      })
      visibleTitleCount = sorted.length
      entries = sorted.length ? <ul className="mt-6 grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">{sorted.map((ref) => {
        const title = titleMap.get(refKey(ref))
        const label = title?.title ?? `${kindLabel(ref.kind)} #${ref.id}`
        const cardTitle = title ?? { id: ref.id, kind: ref.kind, title: label, year: null, posterUrl: null, tmdbRating: null }
        const personalRating = selectedRating === 'none' ? null : typeof selectedRating === 'number' ? selectedRating : (owner ? ratingsByTitle[refKey(ref)] ?? null : null)
        const meta = [title?.year, kindLabel(ref.kind)].filter(Boolean).join(' · ')
          return <TitleCard className="min-w-0" href={titleHref(ref)} key={`${ref.kind}:${ref.id}`} meta={meta} rating={page.collection === 'films' ? null : personalRating} title={cardTitle} />
      })}</ul> : <EmptyArchive>{page.collection !== 'films' ? 'Titles you like will have a shelf of their own here.' : ratingsUnavailableState && typeof selectedRating === 'string' ? 'Your ratings could not be checked. Reload to retry this filter.' : selectedRating === 'none' && page.items.length === 0 ? 'No watched titles are available to filter yet.' : genre !== 'all' || decade !== 'all' || normalizedQuery || (typeof selectedRating === 'string' && selectedRating !== 'none') ? 'No loaded titles match these filters. Try another rating, genre, decade, or search.' : selectedRating === 'none' ? 'Every loaded watched title has a rating.' : typeof selectedRating === 'number' ? `No titles rated ${selectedRating}/10 yet.` : 'Watched titles will collect here as you mark them watched.'}</EmptyArchive>
      break
    }
    case 'diary': {
      entries = <DiaryCollection entries={page.items} hasMore={page.nextCursor !== null} onDeleted={entryId => setPages(current => { const diary = current.diary; return diary?.collection === 'diary' ? { ...current, diary: { ...diary, items: diary.items.filter(entry => entry.entryId !== entryId) } } : current })} onSaved={(entryId, changes) => setPages(current => { const diary = current.diary; return diary?.collection === 'diary' ? { ...current, diary: { ...diary, items: diary.items.map(entry => entry.entryId === entryId ? { ...entry, ...changes } : entry) } } : current })} owner={owner} ratingsByTitle={ratingsByTitle} ratingsUnavailable={ratingsUnavailableState} selectedTag={selectedTag} titles={titles} />
      break
    }
    case 'reviews': {
      const filtered = page.items.filter((review) => query.trim() === '' || (titleMap.get(refKey(review))?.title ?? '').toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
      entries = filtered.length ? <div className="mt-7 grid gap-4 xl:grid-cols-2">{filtered.map((review) => {
        const title = titleMap.get(refKey(review))
        const label = title?.title ?? `${kindLabel(review.kind)} #${review.id}`
        return <article className="grid min-w-0 grid-cols-[88px_minmax(0,1fr)] overflow-hidden rounded-card border border-[var(--fs-field-border)] bg-[var(--fs-field)] sm:grid-cols-[112px_minmax(0,1fr)]" key={review.reviewId}><ArtworkFrame alt={`${label} poster`} className="h-full rounded-none border-0" ratio="portrait" src={title?.posterUrl ?? undefined} /><div className="min-w-0 p-4"><Link className="font-display text-xl leading-tight text-[var(--fs-ink)] hover:text-[var(--fs-accent)]" href={titleHref(review)}>{label}</Link>{review.reviewedOn ? <p className="mt-1 text-xs text-[var(--fs-muted)]">{displayDate(review.reviewedOn, true)}</p> : null}<p className="mt-3 line-clamp-6 whitespace-pre-wrap text-sm leading-6 text-[var(--fs-secondary)]">{review.body}</p></div></article>
      })}</div> : <EmptyArchive>No reviews have been published yet.</EmptyArchive>
      break
    }
    case 'lists': {
      const normalizedQuery = query.trim().toLocaleLowerCase()
      const filtered = page.items
        .filter((list) => listVisibility === 'all' || list.visibility === listVisibility)
        .filter((list) => !normalizedQuery || list.name.toLocaleLowerCase().includes(normalizedQuery))
      const visibleLists = listSort === 'recent'
        ? filtered
        : [...filtered].sort((left, right) => listSort === 'title' ? left.name.localeCompare(right.name) : right.itemCount - left.itemCount)
      entries = visibleLists.length ? (
        <ul className="mt-7 max-w-5xl divide-y divide-[var(--fs-line)] border-y border-[var(--fs-line)]">
          {visibleLists.map((list) => (
            <li className="py-5" key={list.id}>
              <Link className="group grid gap-4 sm:grid-cols-[minmax(14rem,24rem)_minmax(0,1fr)] sm:items-center" href={`/lists/${list.slug}`}>
                <PosterStack aria-hidden="true" items={(posters[list.slug] ?? []).map((src, index) => ({ key: String(index), label: '', src }))} />
                <span className="min-w-0">
                  <span className="block truncate font-display text-2xl text-[var(--fs-ink)] group-hover:text-[var(--fs-accent)]">{list.name}</span>
                  <span className="mt-1 block text-sm text-[var(--fs-muted)]">{list.itemCount} {list.itemCount === 1 ? 'title' : 'titles'}{list.visibility === 'private' ? ' · Private' : ''}</span>
                  {list.description ? <span className="mt-2 line-clamp-2 block text-sm leading-6 text-[var(--fs-secondary)]">{list.description}</span> : null}
                  {owner ? <span className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-[var(--fs-accent)]">Edit this list <ArrowUpRight aria-hidden="true" className="size-3.5" /></span> : null}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : page.items.length === 0 && owner ? (
        <div className="mt-7 max-w-5xl border-y border-dashed border-[var(--fs-line)] py-7">
          <p className="text-sm leading-6 text-[var(--fs-muted)]">Your first list can be a tiny one. Gather a few stories you want to find again.</p>
          <Link className="mt-3 inline-flex min-h-10 items-center gap-1 text-xs font-bold text-[var(--fs-accent)] outline-none hover:text-[var(--fs-ink)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" href={`/profile/${encodeURIComponent(username)}/lists#new-list-heading`}>Start a list <ArrowUpRight aria-hidden="true" className="size-3.5" /></Link>
        </div>
      ) : page.items.length === 0 ? <EmptyArchive>No public lists to show yet.</EmptyArchive>
        : <EmptyArchive>No lists match these filters. Try another search or visibility setting.</EmptyArchive>
      break
    }
    case 'tags': {
      entries = page.items.length ? <ul className="mt-7 flex flex-wrap gap-3">{page.items.map(({ count, tag }) => <li key={tag}><Link className="inline-flex min-h-12 items-center gap-3 rounded-full border border-[var(--fs-field-border)] bg-[var(--fs-field)] px-4 text-sm text-[var(--fs-ink)] transition-colors hover:border-[var(--fs-accent)] hover:text-[var(--fs-accent)]" href={`/profile/${encodeURIComponent(username)}/activity?tag=${encodeURIComponent(tag)}`}><span>#{tag}</span><span className="text-xs tabular-nums text-[var(--fs-muted)]">{count}</span></Link></li>)}</ul> : <EmptyArchive>Tags added to diary entries and reviews will become a searchable map of your cinema.</EmptyArchive>
      break
    }
  }

  const archiveTitles: Record<Exclude<ProfileSectionId, 'overview' | 'watchlist' | 'history'>, { description: string; heading: string }> = {
    activity: { description: selectedTag ? `Activity tagged “${selectedTag}”.` : 'A running log of watches and reviews, in the order they happened.', heading: selectedTag ? `Activity · #${selectedTag}` : 'Activity' },
    films: selectedRating === undefined
      ? { description: 'The titles marked watched, gathered into one collection.', heading: 'Watched' }
      : selectedRating === 'none'
        ? { description: 'Watched titles without a personal score from your viewing journal.', heading: 'Not rated' }
        : { description: `Titles you rated ${selectedRating} out of 10. Your title ratings remain private.`, heading: `Rated ${selectedRating}/10` },
    diary: { description: selectedTag ? `Diary entries tagged “${selectedTag}”.` : 'Every logged watch, grouped by the date it happened.', heading: selectedTag ? `Diary · #${selectedTag}` : 'Diary' },
    reviews: { description: 'Thoughts left behind for the stories that stayed with you.', heading: 'Reviews' },
    lists: { description: `Collections made by ${owner ? 'you' : name}, with their visibility kept intact.`, heading: 'Lists' },
    likes: { description: 'Titles you have marked with a like.', heading: 'Likes' },
    tags: { description: 'A map of the themes attached to diary entries and reviews.', heading: 'Tags' },
  }
  const descriptor = archiveTitles[section]
  const totalCount = section === 'activity' ? data.statistics.diaryEntries + data.statistics.reviews
    : section === 'films' ? typeof selectedRating === 'string' ? null : ratingTotalCount ?? data.statistics.watched
      : section === 'diary' ? data.statistics.diaryEntries
        : section === 'reviews' ? data.statistics.reviews
          : section === 'lists' ? data.statistics.lists
            : null

  return <ProfileArchiveShell data={data} heading={descriptor.heading} owner={owner} section={section}>
    <section className="py-5" aria-labelledby="profile-archive-heading">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="max-w-[65ch] text-sm leading-6 text-[var(--fs-muted)]">{descriptor.description}</p>
        <div className="flex items-center gap-4">
          {totalCount !== null ? <p className="shrink-0 text-sm tabular-nums text-[var(--fs-muted)]">{totalCount} {section === 'films' ? (typeof selectedRating === 'number' ? (totalCount === 1 ? 'rating' : 'ratings') : totalCount === 1 ? 'title' : 'titles') : section === 'lists' ? (totalCount === 1 ? 'list' : 'lists') : section === 'reviews' ? (totalCount === 1 ? 'review' : 'reviews') : section === 'diary' ? (totalCount === 1 ? 'entry' : 'entries') : (totalCount === 1 ? 'event' : 'events')}</p> : null}
        </div>
      </div>
      {section === 'activity' || section === 'films' || section === 'likes' || section === 'reviews' || section === 'lists' ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-b border-[var(--fs-line)] py-2" data-consumit-collection-toolbar>
          <label className="flex h-10 min-w-0 items-center gap-2 border-b border-transparent text-[var(--fs-muted)] focus-within:border-[var(--fs-focus)]">
            <Search aria-hidden="true" className="size-3.5 shrink-0" />
            <span className="sr-only">Search {descriptor.heading}</span>
            <input className="w-52 min-w-0 bg-transparent text-sm text-[var(--fs-ink)] outline-none placeholder:text-[var(--fs-muted)]" onChange={(event) => setQuery(event.target.value)} placeholder={section === 'lists' ? 'Search collections' : 'Search titles'} type="search" value={query} />
          </label>
          {section === 'films' ? <TitleCollectionFilters decades={decades} genres={genres} hasActiveFilters={query.trim() !== '' || decade !== 'all' || genre !== 'all' || selectedRating !== undefined || titleSort !== 'recent'} onDecadeChange={setDecade} onGenreChange={setGenre} onRatingChange={(value) => router.push(`/profile/${encodeURIComponent(username)}/films${value === 'any' ? '' : `?rating=${encodeURIComponent(value)}`}`)} onReset={() => { setQuery(''); setDecade('all'); setGenre('all'); setTitleSort('recent'); if (selectedRating !== undefined) router.push(`/profile/${encodeURIComponent(username)}/films`) }} onSortChange={setTitleSort} rating={selectedRating === undefined ? 'any' : String(selectedRating)} recentLabel={typeof selectedRating === 'number' ? 'Recently rated' : 'Recently watched'} selectedDecade={decade} selectedGenre={genre} showRating={owner} sort={titleSort} {...(ratingsUnavailableState ? { unavailableRatings: 'all' as const } : {})} /> : null}
          {section === 'lists' ? (
            <div className="flex flex-wrap items-center gap-3">
              {owner ? (
                <label className="flex min-h-10 items-center gap-2 text-xs text-[var(--fs-muted)]">Show
                  <select aria-label="Filter lists by visibility" className="h-10 rounded-control border border-[var(--fs-field-border)] bg-[var(--fs-field)] px-3 text-xs font-bold text-[var(--fs-ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" onChange={(event) => setListVisibility(event.currentTarget.value as 'all' | 'public' | 'private')} value={listVisibility}>
                    <option value="all">All lists</option><option value="public">Public</option><option value="private">Private</option>
                  </select>
                </label>
              ) : null}
              <label className="flex min-h-10 items-center gap-2 text-xs text-[var(--fs-muted)]">Sort
                <select aria-label="Sort profile lists" className="h-10 rounded-control border border-[var(--fs-field-border)] bg-[var(--fs-field)] px-3 text-xs font-bold text-[var(--fs-ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" onChange={(event) => setListSort(event.currentTarget.value as 'recent' | 'title' | 'size')} value={listSort}>
                  <option value="recent">Recently updated</option><option value="title">Title A–Z</option><option value="size">Most titles</option>
                </select>
              </label>
            </div>
          ) : null}
          {selectedTag ? <Link className="text-xs font-bold text-[var(--fs-accent)] underline underline-offset-4" href={`/profile/${encodeURIComponent(username)}/tags`}>Browse all tags</Link> : null}
        </div>
      ) : null}
      {section === 'films' && owner && ratingsUnavailableState ? <p className="mt-3 text-xs text-[var(--fs-muted)]" role="status">Personal rating filters could not load. Reload to retry; rating filters are unavailable until then.</p> : null}
      {section === 'films' && page.nextCursor ? <p className="mt-3 text-xs text-[var(--fs-muted)]" role="status">Search, genre, decade, rating ranges, and sorting apply to loaded titles. Load more to include older watches.</p> : null}
      {section === 'films' && (query.trim() !== '' || genre !== 'all' || decade !== 'all' || (typeof selectedRating === 'string' && selectedRating !== 'none')) ? <p className="mt-3 text-xs tabular-nums text-[var(--fs-muted)]" role="status">{visibleTitleCount} {visibleTitleCount === 1 ? 'title' : 'titles'} shown from {page.items.length} loaded</p> : null}
      {section === 'lists' && page.nextCursor ? <p className="mt-3 text-xs text-[var(--fs-muted)]" role="status">Search, visibility, and sorting apply to loaded lists. Load more to include older collections.</p> : null}
      {entries}
      {'nextCursor' in page && page.nextCursor ? <div className="mt-8 flex flex-col items-center gap-3">{loadError ? <p className="text-sm text-[var(--fs-danger)]" role="alert">This archive page could not load. Try again.</p> : null}{catalogError ? <p className="text-xs text-[var(--fs-muted)]" role="status">Some poster details could not load; the titles are still listed.</p> : null}<button className={buttonVariants({ variant: 'secondary' })} disabled={loading} onClick={() => void loadMore()} type="button">{loading ? <><LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> Loading more…</> : 'Load more'}</button></div> : null}
      {page.collection === 'tags' && page.items.length === 100 ? <p className="mt-4 text-center text-xs text-[var(--fs-muted)]">Showing the 100 most used tags.</p> : null}
    </section>
  </ProfileArchiveShell>
}
