'use client'

import { kindLabel, titleHref, type CatalogTitleSummary, type MemberRating, type MemberTitleRecord } from '@consumit/contracts'
import { ArrowUpRight, Bookmark, LayoutGrid, List, LockKeyhole, RefreshCw, Search } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useState } from 'react'

import { ArtworkFrame, buttonVariants } from '@consumit/next-ui'

import { SaveTitleButton } from '../catalog/save-title-button'
import { TitleCollectionFilters, titleDecade, type TitleCollectionSort } from '../shared/title-collection-filters'
import { TitleCard } from '../shared/title-card'
import { matchesRatingFilter } from '../shared/rating-filter'

import { browserCatalogBatches } from '@/lib/catalog-browser'
import { getMemberLibraryPage, getMemberRatingsForTitles } from '@/lib/identity-browser'

function refKey(ref: Pick<MemberTitleRecord, 'id' | 'kind'>) { return `${ref.kind}:${ref.id}` }

type TitleKindFilter = 'all' | 'movie' | 'series' | 'anime'

export function WatchlistCollection({ catalogDetailsLimited = false, catalogUnavailable = false, initialItems, initialNextCursor, initialRatings = [], ratingsUnavailable = false, titles: initialTitles }: {
  catalogDetailsLimited?: boolean
  catalogUnavailable?: boolean
  initialItems: readonly MemberTitleRecord[]
  initialNextCursor: string | null
  initialRatings?: readonly MemberRating[]
  ratingsUnavailable?: boolean
  titles: readonly CatalogTitleSummary[]
}) {
  const [items, setItems] = useState<readonly MemberTitleRecord[]>(initialItems)
  const [nextCursor, setNextCursor] = useState(initialNextCursor)
  const [details, setDetails] = useState<readonly CatalogTitleSummary[]>(initialTitles)
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState<TitleKindFilter>('all')
  const [sort, setSort] = useState<TitleCollectionSort>('recent')
  const [genre, setGenre] = useState('all')
  const [decade, setDecade] = useState('all')
  const [rating, setRating] = useState('any')
  const [ratingsByTitle, setRatingsByTitle] = useState<Record<string, number>>(() => Object.fromEntries(initialRatings.map(({ id, kind, value }) => [`${kind}:${id}`, value])))
  const [ratingsUnavailableState, setRatingsUnavailableState] = useState(ratingsUnavailable)
  const [view, setView] = useState('posters')
  const [loading, setLoading] = useState(false)
  const [pageError, setPageError] = useState(false)
  const [artworkError, setArtworkError] = useState(catalogUnavailable)
  const [artworkLoading, setArtworkLoading] = useState(false)

  const titleMap = useMemo(() => new Map(details.map((title) => [refKey(title), title])), [details])
  const genres = useMemo(() => [...new Set(details.flatMap((title) => title.genreNames))].sort((left, right) => left.localeCompare(right)), [details])
  const decades = useMemo(() => [...new Set(details.flatMap((title) => { const value = titleDecade(title.year); return value ? [value] : [] }))].sort((left, right) => Number(right) - Number(left)), [details])
  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase()
    const filtered = items.filter((item) => {
      if (kind !== 'all' && item.kind !== kind) return false
      const title = titleMap.get(refKey(item))
      if (decade !== 'all' && titleDecade(title?.year) !== decade) return false
      if (genre !== 'all' && !title?.genreNames.includes(genre)) return false
      const personalRating = ratingsByTitle[refKey(item)]
      if (rating !== 'any' && ratingsUnavailableState) return false
      if (!matchesRatingFilter(rating, personalRating)) return false
      return !normalizedQuery || (title?.title ?? `${kindLabel(item.kind)} #${item.id}`).toLocaleLowerCase().includes(normalizedQuery)
    })
    if (sort === 'title') filtered.sort((left, right) => {
      const a = titleMap.get(refKey(left))?.title ?? `${kindLabel(left.kind)} #${left.id}`
      const b = titleMap.get(refKey(right))?.title ?? `${kindLabel(right.kind)} #${right.id}`
      return a.localeCompare(b)
    })
    if (sort === 'release-newest' || sort === 'release-oldest') filtered.sort((left, right) => {
      const leftTitle = titleMap.get(refKey(left))
      const rightTitle = titleMap.get(refKey(right))
      const a = leftTitle?.releaseDate ?? (leftTitle?.year ? `${leftTitle.year}-01-01` : null)
      const b = rightTitle?.releaseDate ?? (rightTitle?.year ? `${rightTitle.year}-01-01` : null)
      if (a === null) return b === null ? 0 : 1
      if (b === null) return -1
      return sort === 'release-newest' ? b.localeCompare(a) : a.localeCompare(b)
    })
    return filtered
  }, [decade, genre, items, kind, query, rating, ratingsByTitle, ratingsUnavailableState, sort, titleMap])

  async function loadMore() {
    if ((!nextCursor && !pageError) || loading) return
    setLoading(true)
    setPageError(false)
    try {
      const page = await getMemberLibraryPage('saved', nextCursor ?? undefined)
      if (page.collection !== 'saved') throw new Error('WATCHLIST_COLLECTION_MISMATCH')
      let ratings: readonly MemberRating[] = []
      try { ratings = await getMemberRatingsForTitles(page.items) }
      catch { setRatingsUnavailableState(true) }
      setItems((current) => {
        const known = new Set(current.map(refKey))
        return [...current, ...page.items.filter((item) => !known.has(refKey(item)))]
      })
      setNextCursor(page.nextCursor)
      if (ratings.length) setRatingsByTitle((current) => ({ ...current, ...Object.fromEntries(ratings.map(({ id, kind, value }) => [`${kind}:${id}`, value])) }))
      try {
        const loaded = await browserCatalogBatches(page.items)
        setDetails((current) => [...new Map([...current, ...loaded].map((title) => [refKey(title), title])).values()])
      } catch {
        setArtworkError(true)
      }
    } catch {
      setPageError(true)
    } finally {
      setLoading(false)
    }
  }

  const filtered = query.trim() !== '' || kind !== 'all' || genre !== 'all' || decade !== 'all' || rating !== 'any'
  const loadedCount = items.length
  function resetFilters() { setQuery(''); setKind('all'); setGenre('all'); setDecade('all'); setRating('any'); setSort('recent') }

  async function retryArtwork() {
    if (artworkLoading) return
    setArtworkLoading(true)
    try {
      const loaded = await browserCatalogBatches(items)
      setDetails((current) => [...new Map([...current, ...loaded].map((title) => [refKey(title), title])).values()])
      setArtworkError(false)
    } catch { setArtworkError(true) }
    finally { setArtworkLoading(false) }
  }

  return (
      <div className="w-full" data-consumit-watchlist-screen>
        <section className="py-5" id="saved-titles" aria-label="Saved for later">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="inline-flex items-center gap-2 text-xs leading-5 text-[var(--fs-muted)]"><LockKeyhole aria-hidden="true" className="size-3.5" />Your private collection of stories for another night.</p>
            <p className="text-xs tabular-nums text-[var(--fs-secondary)]">{loadedCount}{nextCursor ? '+' : ''} saved {loadedCount === 1 && !nextCursor ? 'title' : 'titles'}</p>
          </div>
          {artworkError ? <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--fs-line)] pb-3 text-xs text-[var(--fs-muted)]" role="status"><p>Your Watchlist is safe. Some poster details could not load.</p><button className="inline-flex min-h-9 items-center gap-1.5 rounded-control outline-none hover:text-[var(--fs-ink)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)] disabled:opacity-50" disabled={artworkLoading} onClick={() => void retryArtwork()} type="button"><RefreshCw aria-hidden="true" className={`size-3.5 ${artworkLoading ? 'animate-spin motion-reduce:animate-none' : ''}`} />{artworkLoading ? 'Loading artwork…' : 'Retry artwork'}</button></div> : null}
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-[var(--fs-line)] py-2" data-consumit-collection-toolbar>
            <label className="flex h-10 min-w-0 items-center gap-2 border-b border-transparent text-[var(--fs-muted)] focus-within:border-[var(--fs-focus)]">
              <Search aria-hidden="true" className="size-3.5 shrink-0" />
              <input aria-label="Search your Watchlist" className="w-40 min-w-0 bg-transparent text-sm text-[var(--fs-ink)] outline-none placeholder:text-[var(--fs-muted)]" onChange={(event) => setQuery(event.currentTarget.value)} placeholder="Search titles" type="search" value={query} />
            </label>
            <div aria-label="Filter Watchlist by title type" className="flex flex-wrap gap-1" role="group">
              {([['all', 'All'], ['movie', 'Movies'], ['series', 'Series'], ['anime', 'Anime']] as const).map(([value, label]) => (
                <button aria-pressed={kind === value} className={`min-h-10 border-b-2 px-2 text-xs font-medium outline-none transition-colors hover:text-[var(--fs-ink)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)] ${kind === value ? 'border-[var(--fs-accent)] text-[var(--fs-ink)]' : 'border-transparent text-[var(--fs-muted)]'}`} key={value} onClick={() => setKind(value)} type="button">{label}</button>
              ))}
            </div>
            <div className="ml-auto"><TitleCollectionFilters decades={decades} genres={genres} hasActiveFilters={filtered || sort !== 'recent'} onDecadeChange={setDecade} onGenreChange={setGenre} onRatingChange={setRating} onReset={resetFilters} onSortChange={setSort} rating={rating} recentLabel="Recently saved" selectedDecade={decade} selectedGenre={genre} showRating sort={sort} {...(ratingsUnavailableState ? { unavailableRatings: 'all' as const } : {})} /></div>
            <div aria-label="Watchlist display" className="flex gap-1 border-l border-[var(--fs-line)] pl-3" role="group">{([{ value: 'posters', label: 'Posters', icon: LayoutGrid }, { value: 'shelf', label: 'Shelf', icon: List }] as const).map(({ value, label, icon: Icon }) => <button aria-label={label} aria-pressed={view === value} className={`grid size-9 place-items-center rounded-control outline-none hover:bg-[var(--fs-hover)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)] ${view === value ? 'text-[var(--fs-ink)]' : 'text-[var(--fs-muted)]'}`} key={value} onClick={() => setView(value)} title={label} type="button"><Icon aria-hidden="true" className="size-4" /></button>)}</div>
          </div>
          {ratingsUnavailableState ? <p className="mt-3 text-xs text-[var(--fs-muted)]" role="status">Your saved titles are still here, but personal rating filters are temporarily unavailable. Reload to try again.</p> : null}

          <div className="mt-6">
          {filtered || nextCursor ? <p className="mb-4 text-xs text-[var(--fs-muted)]" role="status">
            {visibleItems.length} {visibleItems.length === 1 ? 'title' : 'titles'} shown from {loadedCount} loaded{nextCursor ? ' · load more to include older titles in filters' : ''}
          </p> : null}

          {visibleItems.length === 0 ? (
            <div className="rounded-card border border-dashed border-[var(--fs-field-border)] bg-[var(--fs-field)] px-6 py-12 text-center">
              <Bookmark aria-hidden="true" className="mx-auto size-7 text-[var(--fs-muted)]" />
              <h2 className="mt-4 font-display text-2xl text-[var(--fs-ink)]">{rating !== 'any' && ratingsUnavailableState ? 'Personal ratings are unavailable.' : filtered ? 'No titles match that shelf.' : 'Your Watchlist is ready.'}</h2>
              <p className="mx-auto mt-2 max-w-[50ch] text-sm leading-6 text-[var(--fs-muted)]">{rating !== 'any' && ratingsUnavailableState ? 'Reload the page before filtering by rating again.' : filtered ? 'Try a different search or filter.' : 'Save a movie, series, or anime while you explore, and it will be waiting here.'}</p>
              {filtered ? (
                <button className={`${buttonVariants({ variant: 'secondary' })} mt-5`} onClick={resetFilters} type="button">Clear filters</button>
              ) : (
                <Link className={`${buttonVariants({ variant: 'primary' })} mt-5`} href="/movies">Explore titles <ArrowUpRight aria-hidden="true" /></Link>
              )}
            </div>
          ) : (
            <ul className={view === 'posters' ? 'grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8' : 'divide-y divide-[var(--fs-line)]'}>
              {visibleItems.map((item) => {
                const title = titleMap.get(refKey(item))
                const label = title?.title ?? `${kindLabel(item.kind)} #${item.id}`
                const cardTitle = title ?? { id: item.id, kind: item.kind, title: label, year: null, posterUrl: null, tmdbRating: null }
                const meta = [title?.year, kindLabel(item.kind)].filter(Boolean).join(' · ')
                const saveAction = <SaveTitleButton initialSaved id={item.id} kind={item.kind} onSavedChange={(saved) => { if (!saved) setItems((current) => current.filter((entry) => refKey(entry) !== refKey(item))) }} title={label} />
                const caption = <div className="min-w-0"><p className="truncate text-sm font-medium text-[var(--fs-ink)]" title={label}>{label}</p><p className="mt-1 flex items-center justify-between gap-2 text-xs text-[var(--fs-muted)]"><span>{meta}</span>{ratingsByTitle[refKey(item)] !== undefined ? <span aria-label={`Your rating: ${ratingsByTitle[refKey(item)]} out of 10`} className="text-[var(--fs-accent)] tabular-nums">{ratingsByTitle[refKey(item)]}/10</span> : null}</p></div>
                if (view === 'shelf') return <li className="flex items-center gap-5 py-4" key={refKey(item)}><Link aria-label={label} className="flex min-w-0 flex-1 items-center gap-4 rounded-control outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" href={titleHref(item)}><ArtworkFrame alt="" className="w-14 shrink-0" src={title?.posterUrl ?? undefined} />{caption}</Link>{saveAction}</li>
                return (
                  <TitleCard
                    className="min-w-0"
                    href={titleHref(item)}
                    key={refKey(item)}
                    meta={meta}
                    title={cardTitle}
                  />
                )
              })}
            </ul>
          )}

          </div>
          {catalogDetailsLimited ? <p className="mt-5 text-xs text-[var(--fs-muted)]">Poster details load in bounded batches. Titles remain available by name even when artwork is missing.</p> : null}

          {pageError ? <p className="mt-4 text-sm text-[var(--fs-danger)]" role="alert">The next Watchlist page could not load.</p> : null}
          {nextCursor || pageError ? (
            <button className={`${buttonVariants({ variant: 'secondary' })} mt-6`} disabled={loading} onClick={() => void loadMore()} type="button">
              {loading ? 'Loading titles…' : pageError ? 'Try again' : 'Load more titles'}
            </button>
          ) : null}
        </section>
      </div>
  )
}
