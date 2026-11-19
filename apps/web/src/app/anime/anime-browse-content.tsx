'use client'

import { animeBrowseSortSchema, animeFormatSchema } from '@consumit/contracts'
import type { AnimeBrowseSort, AnimeFormat, AnimePage, AnimeTitleSummary } from '@consumit/contracts'
import { ArtworkFrame, Button, Select } from '@consumit/ui'
import { ArrowLeft, ArrowRight, SlidersHorizontal, Star } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

import { useAnimeFeed, type AnimeFeedQuery } from './use-anime-feed'
import { BrowseHero } from '../shared/browse-hero'
import { TitleCard } from '../shared/title-card'
import { useHorizontalRail } from '../shared/use-horizontal-rail'

function animeHref(anime: AnimeTitleSummary) {
  return `/anime/${anime.anilistId}`
}

type AnimeBrowseState = { sort: AnimeBrowseSort; genre: string; year: string; format: AnimeFormat | '' }

function normalizeBrowseState(state: { sort: string; genre: string; year: string; format: string }, currentYear: number): AnimeBrowseState {
  const sort = animeBrowseSortSchema.safeParse(state.sort)
  const format = animeFormatSchema.safeParse(state.format)
  const yearNumber = Number(state.year)
  return {
    sort: sort.success ? sort.data : 'popular',
    genre: state.genre.trim().slice(0, 64),
    year: Number.isInteger(yearNumber) && yearNumber >= 1917 && yearNumber <= Math.min(currentYear + 1, 2200) ? String(yearNumber) : '',
    format: format.success ? format.data : '',
  }
}

function stateFromSearchParams(params: URLSearchParams, currentYear: number): AnimeBrowseState {
  return normalizeBrowseState({
    sort: params.get('sort') ?? 'popular',
    genre: params.get('genre') ?? '',
    year: params.get('year') ?? '',
    format: params.get('format') ?? '',
  }, currentYear)
}

function browseUrl(state: AnimeBrowseState, currentUrl: URL) {
  const nextUrl = new URL(currentUrl)
  if (state.sort === 'popular') nextUrl.searchParams.delete('sort')
  else nextUrl.searchParams.set('sort', state.sort)
  if (state.genre) nextUrl.searchParams.set('genre', state.genre)
  else nextUrl.searchParams.delete('genre')
  if (state.year) nextUrl.searchParams.set('year', state.year)
  else nextUrl.searchParams.delete('year')
  if (state.format) nextUrl.searchParams.set('format', state.format)
  else nextUrl.searchParams.delete('format')
  return `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`
}

function currentBrowseUrl() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`
}

function writeBrowseUrl(state: AnimeBrowseState, replace = false) {
  const nextUrl = browseUrl(state, new URL(window.location.href))
  if (replace) window.history.replaceState(window.history.state, '', nextUrl)
  else window.history.pushState(window.history.state, '', nextUrl)
}

const ANIME_FORMATS: readonly { label: string; value: AnimeFormat }[] = [
  { label: 'TV', value: 'TV' },
  { label: 'TV short', value: 'TV_SHORT' },
  { label: 'Movie', value: 'MOVIE' },
  { label: 'OVA', value: 'OVA' },
  { label: 'ONA', value: 'ONA' },
  { label: 'Special', value: 'SPECIAL' },
]

function AnimeFeaturedRail({ items, discoveryBasis }: { items: AnimeTitleSummary[]; discoveryBasis: AnimePage['discoveryBasis'] }) {
  const { railRef, canScroll, atStart, atEnd, move } = useHorizontalRail(Math.min(items.length, 10))
  if (items.length === 0) return null
  const scrollButtonClass = 'grid size-11 cursor-pointer place-items-center rounded-xl border border-[var(--fs-field-border)] bg-[var(--fs-field)] text-[var(--fs-muted)] outline-none transition-colors hover:text-[var(--fs-accent)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)] disabled:cursor-default disabled:opacity-40'
  return (
    <section aria-labelledby="featured-heading" className="mb-8 sm:mb-10">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="font-display text-2xl tracking-[-0.02em] text-[var(--fs-ink)] sm:text-3xl" id="featured-heading">{discoveryBasis === 'seasonal-popularity' ? 'Popular this season' : 'Trending Now'}</h2>
        {canScroll ? <div className="flex gap-1.5">
          <button aria-label="Scroll featured titles left" className={scrollButtonClass} disabled={atStart} onClick={() => move(-1)} type="button"><ArrowLeft aria-hidden="true" className="size-4" /></button>
          <button aria-label="Scroll featured titles right" className={scrollButtonClass} disabled={atEnd} onClick={() => move(1)} type="button"><ArrowRight aria-hidden="true" className="size-4" /></button>
        </div> : null}
      </div>
      <ul className="flex snap-x snap-mandatory scroll-px-2 gap-4 overflow-x-auto overscroll-x-contain -mx-2 px-2 pt-2 pb-6 sm:gap-5" ref={railRef} style={{ scrollbarWidth: 'none' }}>
        {items.slice(0, 10).map((anime) => {
          const rating = anime.averageScore === null ? null : (anime.averageScore / 10).toFixed(1)
          return (
            <li className="w-[85%] max-w-[26rem] shrink-0 snap-start sm:w-[52%] lg:w-[38%] xl:w-[32%]" key={`anime:${anime.anilistId}`}>
              <Link aria-label={anime.titles.preferred} className="group block overflow-hidden rounded-xl border border-[var(--fs-line)] bg-[var(--fs-field)] shadow-[0_2px_6px_rgba(0,0,0,0.06)] outline-none transition-[transform,border-color,box-shadow] duration-200 ease-out hover:-translate-y-1 hover:border-[var(--fs-accent)]/50 hover:shadow-[0_6px_16px_rgba(0,0,0,0.12)] focus-visible:shadow-[0_6px_16px_rgba(0,0,0,0.12)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)] motion-reduce:transition-none motion-reduce:transform-none" href={animeHref(anime)} prefetch={false}>
                <ArtworkFrame alt="" className="rounded-none border-0" ratio="landscape" src={anime.bannerImage || anime.coverImage.url || undefined}>
                  <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-transparent" />
                  <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black/60 to-transparent opacity-60" />
                  <div className="absolute inset-x-0 bottom-0 p-4 pt-8">
                    <p className="truncate font-display text-lg leading-tight text-white transition-colors duration-150 group-hover:text-[var(--fs-accent)] sm:text-xl">{anime.titles.preferred}</p>
                    <p className="mt-1.5 flex items-center gap-2 text-xs tabular-nums text-white/80 sm:text-sm">
                      {anime.seasonYear ? <span>{anime.seasonYear}</span> : null}
                      {anime.seasonYear && (rating || anime.genres[0]) ? <span aria-hidden="true">·</span> : null}
                      {rating ? (
                        <span className="inline-flex items-center gap-1 font-bold text-white">
                          <Star aria-hidden="true" className="size-3.5 fill-current text-orange" />
                          {rating}
                          <span className="sr-only">score</span>
                        </span>
                      ) : null}
                      {rating && anime.genres[0] ? <span aria-hidden="true">·</span> : null}
                      {anime.genres[0] ? <span>{anime.genres[0]}</span> : null}
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

function AnimeFeed({ heading, initialPage, onReset, query }: { heading: string; initialPage?: AnimePage | undefined; onReset: () => void; query: AnimeFeedQuery }) {
  const { page, loading, error, hasMore, loadMore, sentinelRef } = useAnimeFeed(query, initialPage)
  const items = page?.items ?? []
  return (
    <section aria-labelledby="browse-results-heading">
      <div className="mb-5 flex items-baseline justify-between gap-4 border-b border-[var(--fs-line)] pb-4">
        <h2 className="font-display text-2xl tracking-[-0.02em] text-[var(--fs-ink)]" id="browse-results-heading">{heading}</h2>
        <p className="text-xs tabular-nums text-[var(--fs-muted)]" role="status">{page ? `${items.length.toLocaleString('en-US')} ${items.length === 1 ? 'title' : 'titles'} shown` : 'Finding titles…'}</p>
      </div>
      <ul aria-busy={loading} className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-7 lg:grid-cols-4 xl:grid-cols-6">
        {items.map((anime) => <TitleCard className="min-w-0 [content-visibility:auto] [contain-intrinsic-size:auto_300px]" key={`anime:${anime.anilistId}`} title={{ id: anime.anilistId, kind: 'anime', title: anime.titles.preferred, year: anime.seasonYear, posterUrl: anime.coverImage.url, backdropUrl: anime.bannerImage, tmdbRating: anime.averageScore === null ? null : anime.averageScore / 10 }} />)}
        {loading ? Array.from({ length: 6 }, (_, index) => <li aria-hidden="true" className="aspect-[2/3] animate-pulse rounded-[16px] border border-[var(--fs-line)] bg-[var(--fs-field)] motion-reduce:animate-none" key={`loading-${index}`} />) : null}
      </ul>
      {!loading && !error && items.length === 0 ? (
        <div className="py-16 text-center">
          <h3 className="font-display text-2xl text-[var(--fs-ink)]">No titles found</h3>
          <p className="mt-3 mb-6 text-sm text-[var(--fs-muted)]">Try another genre, year, or format to find something to watch.</p>
          <Button onClick={onReset} variant="secondary">Clear filters</Button>
        </div>
      ) : null}
      <div className="flex min-h-40 flex-col items-center justify-center gap-4 py-10" ref={sentinelRef}>
        {error ? <p className="max-w-md text-center text-sm text-[var(--fs-ink)]" role="alert">We couldn&apos;t load {items.length > 0 ? 'more' : 'these'} titles. Please try again.</p> : null}
        {hasMore ? <Button loading={loading} onClick={() => void loadMore()} variant="secondary">{loading ? 'Loading titles…' : error ? 'Try again' : 'Load more'}</Button> : null}
        {!hasMore && items.length > 0 ? <p className="text-sm text-[var(--fs-muted)]">You&apos;re all caught up. Try another genre, year, or format.</p> : null}
      </div>
    </section>
  )
}

function BrowseSelect({ label, onChange, options, value }: { label: string; onChange: (value: string) => void; options: readonly { label: string; value: string }[]; value: string }) {
  return (
    <div className="min-w-0 grow basis-[calc(50%-0.25rem)] sm:w-44 sm:flex-none sm:basis-auto sm:grow-0">
      <Select hideLabel label={label} onValueChange={onChange} options={options} placeholder={label} value={value} />
    </div>
  )
}

const GRID_HEADINGS: Record<AnimeBrowseSort, string> = {
  popular: 'Popular',
  'top-rated': 'Top rated',
  new: 'New releases',
  old: 'Old releases',
}

export function AnimeBrowseContent({ trending, initial, currentYear, initialSort = 'popular', initialGenre = '', initialYear = '', initialFormat = '' }: { trending: AnimePage; initial: AnimePage; currentYear: number; initialSort?: string | undefined; initialGenre?: string | undefined; initialYear?: string | undefined; initialFormat?: string | undefined }) {
  const initialState = useMemo(() => normalizeBrowseState({ sort: initialSort, genre: initialGenre, year: initialYear, format: initialFormat }, currentYear), [currentYear, initialFormat, initialGenre, initialSort, initialYear])
  const [browseState, setBrowseState] = useState(() => typeof window === 'undefined'
    ? initialState
    : stateFromSearchParams(new URLSearchParams(window.location.search), currentYear))
  const { sort, genre, year, format } = browseState
  const genres = [...new Set([...trending.items, ...initial.items].flatMap((anime) => anime.genres).concat(genre ? [genre] : []))].sort()
  const years = useMemo(() => Array.from({ length: currentYear + 2 - 1917 }, (_, index) => currentYear + 1 - index), [currentYear])
  const backdrops = useMemo(
    () => [...trending.items, ...initial.items].map((anime) => anime.bannerImage ?? anime.coverImage.url),
    [initial.items, trending.items],
  )
  const feedQuery = useMemo<AnimeFeedQuery>(() => ({
    sort,
    ...(genre ? { genre } : {}),
    ...(year ? { year: Number(year) } : {}),
    ...(format ? { format } : {}),
  }), [sort, genre, year, format])
  const isDefault = sort === 'popular' && !genre && !year && !format
  useEffect(() => {
    const currentState = stateFromSearchParams(new URLSearchParams(window.location.search), currentYear)
    const canonicalUrl = browseUrl(currentState, new URL(window.location.href))
    if (currentBrowseUrl() !== canonicalUrl) window.history.replaceState(window.history.state, '', canonicalUrl)
    function restoreFromUrl() {
      const next = stateFromSearchParams(new URLSearchParams(window.location.search), currentYear)
      setBrowseState(next)
      const normalizedUrl = browseUrl(next, new URL(window.location.href))
      if (currentBrowseUrl() !== normalizedUrl) window.history.replaceState(window.history.state, '', normalizedUrl)
    }
    window.addEventListener('popstate', restoreFromUrl)
    return () => window.removeEventListener('popstate', restoreFromUrl)
  }, [currentYear])

  function applyState(nextState: { sort: string; genre: string; year: string; format: string }) {
    const next = normalizeBrowseState(nextState, currentYear)
    setBrowseState(next)
    writeBrowseUrl(next)
  }
  function reset() { applyState({ sort: 'popular', genre: '', year: '', format: '' }) }
  return (
    <main id="consumit-main-content" tabIndex={-1} className="consumit-anime-browse w-full">
      <BrowseHero backdrops={backdrops} description="Discover anime from AniList." title="Anime" />
      <div className="mt-7 sm:mt-8">
        <AnimeFeaturedRail items={trending.items} discoveryBasis={trending.discoveryBasis} />
      </div>
      <div
        aria-label="Filter anime"
        className="mb-7 flex flex-wrap items-center gap-2 border-y border-[var(--fs-line)] py-3"
        role="group"
      >
        <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto sm:flex-nowrap">
          <SlidersHorizontal aria-hidden="true" className="mr-1 hidden size-4 shrink-0 text-[var(--fs-muted)] xl:block" />
          <BrowseSelect label="Genre" onChange={(value) => applyState({ sort, genre: value, year, format })} options={[{ label: 'All genres', value: '' }, ...genres.map((name) => ({ label: name, value: name }))]} value={genre} />
          <BrowseSelect label="Year" onChange={(value) => applyState({ sort, genre, year: value, format })} options={[{ label: 'All years', value: '' }, ...years.map((value) => ({ label: String(value), value: String(value) }))]} value={year} />
          <BrowseSelect label="Format" onChange={(value) => applyState({ sort, genre, year, format: value })} options={[{ label: 'All formats', value: '' }, ...ANIME_FORMATS]} value={format} />
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {!isDefault ? <Button onClick={reset} size="sm" variant="ghost">Reset</Button> : null}
          <BrowseSelect label="Sort by" onChange={(value) => applyState({ sort: value, genre, year, format })} options={[{ label: 'Popular', value: 'popular' }, { label: 'Top rated', value: 'top-rated' }, { label: 'New releases', value: 'new' }, { label: 'Old releases', value: 'old' }]} value={sort} />
        </div>
      </div>
      <AnimeFeed heading={GRID_HEADINGS[sort]} initialPage={isDefault ? initial : undefined} key={`${sort}:${genre}:${year}:${format}`} onReset={reset} query={feedQuery} />
    </main>
  )
}
