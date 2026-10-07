'use client'

import { kindLabel, titleHref, type CatalogKind, type CatalogPage, type CatalogTitleSummary } from '@consumit/contracts'
import { ArtworkFrame, Button, Select } from '@consumit/ui'
import { ArrowLeft, ArrowRight, SlidersHorizontal, Star } from 'lucide-react'
import Link from 'next/link'
import { Fragment, useMemo, useRef, useState } from 'react'

import type { BrowseCatalogQuery } from '@/lib/catalog-browser'

import { BrowseHero } from '../shared/browse-hero'
import { LandscapeCard } from '../shared/landscape-card'
import { AdPlaceholder } from '../shared/ad-placeholder'
import { useCatalogFeed } from './use-catalog-feed'

function FeaturedRail({ items, kind }: { items: CatalogTitleSummary[]; kind: CatalogKind }) {
  const railRef = useRef<HTMLUListElement>(null)
  if (items.length === 0) return null
  function move(direction: number) {
    const rail = railRef.current
    rail?.scrollBy({ left: rail.clientWidth * 0.8 * direction, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
  }
  const scrollButtonClass = 'grid size-11 cursor-pointer place-items-center rounded-xl border border-[var(--fs-field-border)] bg-[var(--fs-field)] text-[var(--fs-muted)] outline-none transition-colors hover:text-[var(--fs-accent)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]'
  return (
    <section aria-labelledby="featured-heading" className="mb-8 sm:mb-10">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="font-display text-2xl tracking-[-0.02em] text-[var(--fs-ink)] sm:text-3xl" id="featured-heading">{kind === 'movie' ? 'Now Playing' : 'Trending Now'}</h2>
        <div className="flex gap-1.5">
          <button aria-label="Scroll featured titles left" className={scrollButtonClass} onClick={() => move(-1)} type="button"><ArrowLeft aria-hidden="true" className="size-4" /></button>
          <button aria-label="Scroll featured titles right" className={scrollButtonClass} onClick={() => move(1)} type="button"><ArrowRight aria-hidden="true" className="size-4" /></button>
        </div>
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
                    <p className="truncate font-display text-lg leading-tight text-white transition-colors duration-150 group-hover:text-[var(--fs-accent)] sm:text-xl">{title.title}</p>
                    <p className="mt-1.5 flex items-center gap-2 text-xs tabular-nums text-white/80 sm:text-sm">
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
        <h2 className="font-display text-2xl tracking-[-0.02em] text-[var(--fs-ink)]" id="browse-results-heading">{query.feed === 'top-rated' ? 'Top rated' : 'Popular now'}</h2>
        <p className="text-xs tabular-nums text-[var(--fs-muted)]" role="status">{page ? `${page.items.length.toLocaleString('en-US')} titles shown` : 'Finding titles…'}</p>
      </div>
      {page?.meta.stale ? <p className="mb-4 text-sm text-[var(--fs-muted)]">Showing saved catalog results. Some details may have changed.</p> : null}
      <ul aria-busy={loading} className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {page?.items.map((title, index) => (
          <Fragment key={`${title.kind}:${title.id}`}>
            <li className="min-w-0 [content-visibility:auto] [contain-intrinsic-size:auto_260px]">
              <LandscapeCard
                artworkSrc={title.backdropUrl ?? title.posterUrl}
                href={titleHref(title)}
                meta={{ kind: kindLabel(title.kind), rating: title.tmdbRating, year: title.year }}
                title={title.title}
              />
            </li>
            {index === 5 ? <li className="col-span-full hidden py-3 sm:block lg:hidden"><AdPlaceholder placement="catalog" /></li> : null}
            {index === 7 ? <li className="col-span-full py-3 sm:hidden lg:block xl:hidden"><AdPlaceholder placement="catalog" /></li> : null}
            {index === 11 ? <li className="col-span-full hidden py-3 xl:block"><AdPlaceholder placement="catalog" /></li> : null}
          </Fragment>
        ))}
        {loading ? Array.from({ length: 6 }, (_, index) => <li aria-hidden="true" className="aspect-video animate-pulse rounded-[6px] border border-[var(--fs-line)] bg-[var(--fs-field)] motion-reduce:animate-none" key={`loading-${index}`} />) : null}
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

function BrowseSelect({ label, onChange, options, value }: { label: string; onChange: (value: string) => void; options: readonly { label: string; value: string }[]; value: string }) {
  return (
    <div className="min-w-0 grow basis-[calc(50%-0.25rem)] sm:w-44 sm:flex-none sm:basis-auto sm:grow-0">
      <Select hideLabel label={label} onValueChange={onChange} options={options} placeholder={label} value={value} />
    </div>
  )
}

export function CatalogBrowseContent({ current, currentYear, kind, popular }: { current: CatalogPage; currentYear: number; kind: CatalogKind; popular: CatalogPage }) {
  const [genre, setGenre] = useState('')
  const [year, setYear] = useState('')
  const [feed, setFeed] = useState<'popular' | 'top-rated'>('popular')
  const genres = [...new Set([...popular.items, ...current.items].flatMap((title) => title.genreNames))].sort()
  const query = useMemo(() => ({ kind, feed, genre: genre || undefined, year: year ? Number(year) : undefined }), [kind, feed, genre, year])
  const isDefault = !genre && !year && feed === 'popular'
  const backdrops = useMemo(
    () => [...popular.items, ...current.items].map((title) => title.backdropUrl ?? title.posterUrl),
    [current.items, popular.items],
  )
  function reset() { setGenre(''); setYear(''); setFeed('popular') }
  return (
    <main className="consumit-catalog-browse w-full">
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
          <BrowseSelect label="Genre" onChange={setGenre} options={[{ label: 'All genres', value: '' }, ...genres.map((name) => ({ label: name, value: name }))]} value={genre} />
          <BrowseSelect label="Year" onChange={setYear} options={[{ label: 'All years', value: '' }, ...Array.from({ length: currentYear - 1899 }, (_, index) => currentYear + 1 - index).map((value) => ({ label: String(value), value: String(value) }))]} value={year} />
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {!isDefault ? <Button onClick={reset} size="sm" variant="ghost">Reset</Button> : null}
          <BrowseSelect label="Sort by" onChange={(value) => setFeed(value === 'top-rated' ? 'top-rated' : 'popular')} options={[{ label: 'Popular', value: 'popular' }, { label: 'Top rated', value: 'top-rated' }]} value={feed} />
        </div>
      </div>
      {current.items.length > 0 ? <div className="mb-8 sm:mb-10"><AdPlaceholder placement="catalog" position="early" /></div> : null}
      <CatalogFeed initialPage={isDefault ? popular : undefined} key={`${kind}:${feed}:${genre}:${year}`} query={query} reset={reset} />
    </main>
  )
}
