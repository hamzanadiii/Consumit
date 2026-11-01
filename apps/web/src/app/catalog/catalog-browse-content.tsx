'use client'

import { titleHref, type CatalogKind, type CatalogPage, type CatalogTitleSummary } from '@consumit/contracts'
import { ArtworkFrame, Button, Select } from '@consumit/ui'
import { ArrowLeft, ArrowRight, SlidersHorizontal, Star } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

import { catalogBrowseFeed, type BrowseCatalogFeed, type BrowseCatalogQuery } from '@/lib/catalog-browser'

import { BrowseHero } from '../shared/browse-hero'
import { TitleCard } from '../shared/title-card'
import { useHorizontalRail } from '../shared/use-horizontal-rail'
import { useCatalogFeed } from './use-catalog-feed'

function FeaturedRail({ items, kind }: { items: CatalogTitleSummary[]; kind: CatalogKind }) {
  const { railRef, canScroll, atStart, atEnd, move: moveRail } = useHorizontalRail(Math.min(items.length, 10))
  if (items.length === 0) return null
  const scrollButtonClass = 'grid size-11 cursor-pointer place-items-center rounded-xl border border-[var(--fs-field-border)] bg-[var(--fs-field)] text-[var(--fs-muted)] outline-none transition-colors hover:text-[var(--fs-accent)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)] disabled:cursor-default disabled:opacity-40'
  return (
    <section aria-labelledby="featured-heading" className="mb-8 sm:mb-10">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="font-display text-2xl tracking-[-0.02em] text-[var(--fs-ink)] sm:text-3xl" id="featured-heading">{kind === 'movie' ? 'Now Playing' : 'Trending Now'}</h2>
        {canScroll ? <div className="flex gap-1.5">
          <button aria-label="Scroll featured titles left" className={scrollButtonClass} disabled={atStart} onClick={() => moveRail(-1)} type="button"><ArrowLeft aria-hidden="true" className="size-4" /></button>
          <button aria-label="Scroll featured titles right" className={scrollButtonClass} disabled={atEnd} onClick={() => moveRail(1)} type="button"><ArrowRight aria-hidden="true" className="size-4" /></button>
        </div> : null}
      </div>
      <ul className="flex snap-x snap-mandatory scroll-px-2 gap-4 overflow-x-auto overscroll-x-contain -mx-2 px-2 pt-2 pb-6 sm:gap-5" ref={railRef} style={{ scrollbarWidth: 'none' }}>
        {items.slice(0, 10).map((title) => {
          const rating = title.tmdbRating === null ? null : title.tmdbRating.toFixed(1)
          return (
            <li className="w-[85%] max-w-[26rem] shrink-0 snap-start sm:w-[52%] lg:w-[38%] xl:w-[32%]" key={`${title.kind}:${title.id}`}>
              <Link aria-label={title.title} className="group block overflow-hidden rounded-xl border border-[var(--fs-line)] bg-[var(--fs-field)] shadow-[0_2px_6px_rgba(0,0,0,0.06)] outline-none transition-[transform,border-color,box-shadow] duration-200 ease-out hover:-translate-y-1 hover:border-[var(--fs-accent)]/50 hover:shadow-[0_6px_16px_rgba(0,0,0,0.12)] focus-visible:shadow-[0_6px_16px_rgba(0,0,0,0.12)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)] motion-reduce:transition-none motion-reduce:transform-none" href={titleHref(title)} prefetch={false}>
                <ArtworkFrame alt="" className="rounded-none border-0" ratio="landscape" src={title.backdropUrl ?? title.posterUrl ?? undefined}>
                  <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent" />
                  <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/60 to-transparent opacity-60" />
                  <div className="absolute inset-x-0 bottom-0 p-4 pt-8">
                    <p className="line-clamp-2 font-display text-lg leading-tight text-white transition-colors duration-150 group-hover:text-[var(--fs-accent)] sm:text-xl">{title.title}</p>
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs tabular-nums text-white/80 sm:text-sm">
                      {title.year ? <span>{title.year}</span> : null}
                      {title.year && (rating || title.genreNames[0]) ? <span aria-hidden="true">·</span> : null}
                      {rating ? (
                        <span className="inline-flex items-center gap-1 font-bold text-white">
                          <Star aria-hidden="true" className="size-3.5 fill-current text-orange" />
                          {rating}
                          <span className="sr-only">score</span>
                        </span>
                      ) : null}
                      {rating && title.genreNames[0] ? <span aria-hidden="true">·</span> : null}
                      {title.genreNames[0] ? <span>{title.genreNames[0]}</span> : null}
                    </p>
                  </div>
                </ArtworkFrame>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function CatalogFeed({ initialPage, query, reset }: { initialPage?: CatalogPage | undefined; query: BrowseCatalogQuery; reset: () => void }) {
  const { page, loading, error, hasMore, loadMore, sentinelRef } = useCatalogFeed(query, initialPage)
  return (
    <section aria-labelledby="browse-results-heading">
      <div className="mb-5 flex items-baseline justify-between gap-4 border-b border-[var(--fs-line)] pb-4">
        <h2 className="font-display text-2xl tracking-[-0.02em] text-[var(--fs-ink)]" id="browse-results-heading">{query.feed === 'top-rated' ? 'Top rated' : query.feed === 'trending' ? 'Trending now' : 'Popular now'}</h2>
        <p className="text-xs tabular-nums text-[var(--fs-muted)]" role="status">{page ? `${page.items.length.toLocaleString('en-US')} ${page.items.length === 1 ? 'title' : 'titles'} shown` : 'Finding titles…'}</p>
      </div>
      {page?.meta.stale ? <p className="mb-4 text-sm text-[var(--fs-muted)]">Showing saved catalog results. Some details may have changed.</p> : null}
      <ul aria-busy={loading} className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-7 lg:grid-cols-4 xl:grid-cols-6">
        {page?.items.map((title) => (
            <TitleCard className="min-w-0 [content-visibility:auto] [contain-intrinsic-size:auto_300px]" key={`${title.kind}:${title.id}`} title={title} />
        ))}
        {loading ? Array.from({ length: 6 }, (_, index) => <li aria-hidden="true" className="aspect-[2/3] animate-pulse rounded-[16px] border border-[var(--fs-line)] bg-[var(--fs-field)] motion-reduce:animate-none" key={`loading-${index}`} />) : null}
      </ul>
      {!loading && !error && page?.items.length === 0 ? (
        <div className="py-16 text-center">
          <h3 className="font-display text-2xl text-[var(--fs-ink)]">No titles found</h3>
          <p className="mt-3 mb-6 text-sm text-[var(--fs-muted)]">Try another genre or year to find something to watch.</p>
          <Button onClick={reset} variant="secondary">Clear filters</Button>
        </div>
      ) : null}
      <div className="flex min-h-40 flex-col items-center justify-center gap-4 py-10" ref={sentinelRef}>
        {error ? <p className="max-w-md text-center text-sm text-[var(--fs-ink)]" role="alert">We couldn’t load {page ? 'more' : 'these'} titles. Please try again.</p> : null}
        {hasMore ? <Button loading={loading} onClick={() => void loadMore()} variant="secondary">{loading ? 'Loading titles…' : error ? 'Try again' : 'Load more'}</Button> : null}
        {!hasMore && (page?.items.length ?? 0) > 0 ? <p className="text-sm text-[var(--fs-muted)]">You’re all caught up. Try another genre or year.</p> : null}
      </div>
    </section>
  )
}

function BrowseSelect({ disabled = false, label, onChange, options, value }: { disabled?: boolean | undefined; label: string; onChange: (value: string) => void; options: readonly { label: string; value: string }[]; value: string }) {
  return (
    <div className="min-w-0 grow basis-[calc(50%-0.25rem)] sm:w-44 sm:flex-none sm:basis-auto sm:grow-0">
      <Select disabled={disabled} hideLabel label={label} onValueChange={onChange} options={options} placeholder={label} value={value} />
    </div>
  )
}

type BrowseState = { feed: BrowseCatalogFeed; genre: string; year: string }

function normalizeBrowseState(state: BrowseState, currentYear: number): BrowseState {
  const feed = catalogBrowseFeed(state.feed)
  const genre = feed === 'trending' || state.genre.trim().length > 60 ? '' : state.genre.trim()
  const yearNumber = Number(state.year)
  const year = feed !== 'trending' && Number.isInteger(yearNumber) && yearNumber >= 1900 && yearNumber <= currentYear + 1
    ? String(yearNumber)
    : ''
  return { feed, genre, year }
}

function stateFromSearchParams(params: URLSearchParams, currentYear: number): BrowseState {
  return normalizeBrowseState({
    feed: catalogBrowseFeed(params.get('feed') ?? undefined),
    genre: params.get('genre') ?? '',
    year: params.get('year') ?? '',
  }, currentYear)
}

function browseUrl(state: BrowseState, currentUrl: URL) {
  const nextUrl = new URL(currentUrl)
  if (state.feed === 'popular') nextUrl.searchParams.delete('feed')
  else nextUrl.searchParams.set('feed', state.feed)
  if (state.genre) nextUrl.searchParams.set('genre', state.genre)
  else nextUrl.searchParams.delete('genre')
  if (state.year) nextUrl.searchParams.set('year', state.year)
  else nextUrl.searchParams.delete('year')
  return `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`
}

function currentBrowseUrl() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

function writeBrowseUrl(state: BrowseState, replace = false) {
  const nextUrl = browseUrl(state, new URL(window.location.href))
  if (replace) window.history.replaceState(null, '', nextUrl)
  else window.history.pushState(null, '', nextUrl)
}

export function CatalogBrowseContent({ current, currentYear, initialFeed = 'popular', initialGenre = '', initialYear = '', kind, popular }: { current: CatalogPage; currentYear: number; initialFeed?: BrowseCatalogFeed | undefined; initialGenre?: string | undefined; initialYear?: string | undefined; kind: CatalogKind; popular: CatalogPage }) {
  const initialState = useMemo(() => normalizeBrowseState({ feed: initialFeed, genre: initialGenre, year: initialYear }, currentYear), [currentYear, initialFeed, initialGenre, initialYear])
  const [genre, setGenre] = useState(initialState.genre)
  const [year, setYear] = useState(initialState.year)
  const [feed, setFeed] = useState<BrowseCatalogFeed>(initialState.feed)
  const genres = [...new Set([...popular.items, ...current.items].flatMap((title) => title.genreNames).concat(genre ? [genre] : []))].sort()
  const filtersDisabled = feed === 'trending'
  const query = useMemo(() => ({ kind, feed, genre: genre || undefined, year: year ? Number(year) : undefined }), [kind, feed, genre, year])
  const isDefault = !genre && !year && feed === 'popular'
  const backdrops = useMemo(
    () => [...popular.items, ...current.items].map((title) => title.backdropUrl ?? title.posterUrl),
    [current.items, popular.items],
  )
  useEffect(() => {
    const canonicalUrl = browseUrl(initialState, new URL(window.location.href))
    if (currentBrowseUrl() !== canonicalUrl) window.history.replaceState(null, '', canonicalUrl)
    function restoreFromUrl() {
      const next = stateFromSearchParams(new URLSearchParams(window.location.search), currentYear)
      setGenre(next.genre)
      setYear(next.year)
      setFeed(next.feed)
      const normalizedUrl = browseUrl(next, new URL(window.location.href))
      if (currentBrowseUrl() !== normalizedUrl) window.history.replaceState(null, '', normalizedUrl)
    }
    window.addEventListener('popstate', restoreFromUrl)
    return () => window.removeEventListener('popstate', restoreFromUrl)
  }, [currentYear, initialState])

  function applyState(nextState: BrowseState) {
    const next = normalizeBrowseState(nextState, currentYear)
    setGenre(next.genre)
    setYear(next.year)
    setFeed(next.feed)
    writeBrowseUrl(next)
  }
  function reset() { applyState({ feed: 'popular', genre: '', year: '' }) }
  return (
    <main id="consumit-main-content" tabIndex={-1} className="consumit-catalog-browse w-full">
      <BrowseHero
        backdrops={backdrops}
        description={kind === 'movie' ? 'Find your next great watch.' : 'Find your next can’t-stop-watching.'}
        title={kind === 'movie' ? 'Movies' : 'Series'}
      />
      <div className="mt-7 sm:mt-8">
        <FeaturedRail items={current.items} kind={kind} />
      </div>
      <div
        aria-label="Filter titles"
        className="mb-7 flex flex-wrap items-center gap-2 border-y border-[var(--fs-line)] py-3"
        role="group"
      >
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
          <SlidersHorizontal aria-hidden="true" className="mr-1 hidden size-4 shrink-0 text-[var(--fs-muted)] xl:block" />
          <BrowseSelect disabled={filtersDisabled} label="Genre" onChange={(value) => applyState({ feed, genre: value, year })} options={[{ label: 'All genres', value: '' }, ...genres.map((name) => ({ label: name, value: name }))]} value={genre} />
          <BrowseSelect disabled={filtersDisabled} label="Year" onChange={(value) => applyState({ feed, genre, year: value })} options={[{ label: 'All years', value: '' }, ...Array.from({ length: currentYear - 1899 }, (_, index) => currentYear + 1 - index).map((value) => ({ label: String(value), value: String(value) }))]} value={year} />
          {filtersDisabled ? <p className="basis-full text-xs text-[var(--fs-muted)]" role="status">Choose Popular or Top rated to filter by genre or year.</p> : null}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {!isDefault ? <Button onClick={reset} size="sm" variant="ghost">Reset</Button> : null}
          <BrowseSelect label="Sort by" onChange={(value) => {
            const nextFeed = catalogBrowseFeed(value)
            applyState({ feed: nextFeed, genre: nextFeed === 'trending' ? '' : genre, year: nextFeed === 'trending' ? '' : year })
          }} options={[{ label: 'Popular', value: 'popular' }, { label: 'Trending', value: 'trending' }, { label: 'Top rated', value: 'top-rated' }]} value={feed} />
        </div>
      </div>
      <CatalogFeed initialPage={isDefault ? popular : undefined} key={`${kind}:${feed}:${genre}:${year}`} query={query} reset={reset} />
    </main>
  )
}
