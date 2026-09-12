'use client'

import { titleHref, type CatalogKind, type CatalogPage, type CatalogTitleSummary } from '@consumit/contracts'
import { ArtworkFrame, Button } from '@consumit/ui'
import { ArrowLeft, ArrowRight, ChevronDown, SlidersHorizontal } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useRef, useState, type ReactNode } from 'react'

import type { BrowseCatalogQuery } from '@/lib/catalog-browser'

import { useCatalogFeed } from './use-catalog-feed'

function BrowsePoster({ title }: { title: CatalogTitleSummary }) {
  return (
    <li className="min-w-0 [content-visibility:auto] [contain-intrinsic-size:auto_300px]">
      <Link aria-label={title.title} className="group block rounded-card outline-none" href={titleHref(title)} prefetch={false}>
        <ArtworkFrame alt="" className="group-focus-visible:outline-2 group-focus-visible:-outline-offset-2 group-focus-visible:outline-orange" src={title.posterUrl ?? undefined}>
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/65 to-transparent px-3 pt-12 pb-3 opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none [@media(hover:none)]:opacity-100">
            <p className="line-clamp-3 text-sm font-bold text-white">{title.title}</p>
            {title.year ? <p className="mt-1 text-xs text-white/80">{title.year}</p> : null}
          </div>
          {!title.posterUrl ? <p className="absolute inset-x-3 top-3 text-sm font-bold text-ink">{title.title}</p> : null}
        </ArtworkFrame>
      </Link>
    </li>
  )
}

function FeaturedRail({ items, kind }: { items: CatalogTitleSummary[]; kind: CatalogKind }) {
  const railRef = useRef<HTMLUListElement>(null)
  if (items.length === 0) return null
  function move(direction: number) {
    const rail = railRef.current
    rail?.scrollBy({ left: rail.clientWidth * 0.8 * direction, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
  }
  return (
    <section aria-labelledby="featured-heading" className="mb-10 sm:mb-12">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-base font-bold text-ink" id="featured-heading">{kind === 'movie' ? 'Now playing' : 'On air'}</h2>
        <div className="flex gap-1">
          <Button aria-label="Scroll featured titles left" onClick={() => move(-1)} size="icon" variant="ghost"><ArrowLeft aria-hidden="true" /></Button>
          <Button aria-label="Scroll featured titles right" onClick={() => move(1)} size="icon" variant="ghost"><ArrowRight aria-hidden="true" /></Button>
        </div>
      </div>
      <ul className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain py-1 pr-1 pb-3 sm:gap-4" ref={railRef} style={{ scrollbarWidth: 'none' }}>
        {items.slice(0, 10).map((title) => (
          <li className="w-[76%] max-w-[20rem] shrink-0 snap-start sm:w-[36%] lg:w-[27%] xl:w-[23%]" key={`${title.kind}:${title.id}`}>
            <Link aria-label={title.title} className="group block rounded-card outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-inset" href={titleHref(title)} prefetch={false}>
              <ArtworkFrame alt="" ratio="landscape" src={title.backdropUrl ?? title.posterUrl ?? undefined}>
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-4 pt-10 pb-3">
                  <p className="line-clamp-2 text-sm font-bold text-white">{title.title}</p>
                  {title.year ? <p className="mt-1 text-xs text-white/80">{title.year}</p> : null}
                </div>
              </ArtworkFrame>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

function CatalogFeed({ initialPage, query, reset }: { initialPage?: CatalogPage | undefined; query: BrowseCatalogQuery; reset: () => void }) {
  const { page, loading, error, hasMore, loadMore, sentinelRef } = useCatalogFeed(query, initialPage)
  return (
    <section aria-labelledby="browse-results-heading">
      <div className="mb-5 flex items-baseline justify-between gap-4 border-b border-border pb-4">
        <h2 className="text-base font-bold text-ink" id="browse-results-heading">{query.feed === 'top-rated' ? 'Top rated' : 'Popular now'}</h2>
        <p className="text-xs text-muted" role="status">{page ? `${page.items.length.toLocaleString('en-US')} titles shown` : 'Finding titles…'}</p>
      </div>
      {page?.meta.stale ? <p className="mb-4 text-sm text-muted">Showing saved catalog results. Some details may have changed.</p> : null}
      <ul aria-busy={loading} className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-7 lg:grid-cols-4 xl:grid-cols-6">
        {page?.items.map((title) => <BrowsePoster key={`${title.kind}:${title.id}`} title={title} />)}
        {loading ? Array.from({ length: 6 }, (_, index) => <li aria-hidden="true" className="aspect-[2/3] animate-pulse rounded-card bg-surface-raised motion-reduce:animate-none" key={`loading-${index}`} />) : null}
      </ul>
      {!loading && !error && page?.items.length === 0 ? (
        <div className="py-16 text-center">
          <h3 className="font-display text-2xl text-ink">No titles found</h3>
          <p className="mt-3 mb-6 text-sm text-muted">Try another genre or year to find something to watch.</p>
          <Button onClick={reset} variant="secondary">Clear filters</Button>
        </div>
      ) : null}
      <div className="flex min-h-40 flex-col items-center justify-center gap-4 py-10" ref={sentinelRef}>
        {error ? <p className="max-w-md text-center text-sm text-copy" role="alert">We couldn’t load {page ? 'more' : 'these'} titles. Please try again.</p> : null}
        {hasMore ? <Button loading={loading} onClick={() => void loadMore()} variant="secondary">{loading ? 'Loading titles…' : error ? 'Try again' : 'Load more'}</Button> : null}
        {!hasMore && (page?.items.length ?? 0) > 0 ? <p className="text-sm text-muted">You’re all caught up. Try another genre or year.</p> : null}
      </div>
    </section>
  )
}

function BrowseSelect({ children, label, onChange, value }: { children: ReactNode; label: string; onChange: (value: string) => void; value: string }) {
  return (
    <label className={`relative min-w-0 flex-1 sm:flex-none ${label === 'Genre' ? 'max-[359px]:col-span-2' : ''}`}>
      <span className="sr-only">{label}</span>
      <select className="h-11 w-full appearance-none rounded-control border border-control-outline bg-surface py-2 pr-6 pl-2 text-ink outline-none hover:border-muted focus-visible:ring-2 focus-visible:ring-orange sm:max-w-48 sm:min-w-32 sm:pr-9 sm:pl-3" onChange={(event) => onChange(event.target.value)} style={{ fontSize: '0.875rem' }} title={value || label} value={value}>
        {children}
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute top-3.5 right-2 size-4 text-muted sm:right-3" />
    </label>
  )
}

export function CatalogBrowseContent({ current, currentYear, kind, popular }: { current: CatalogPage; currentYear: number; kind: CatalogKind; popular: CatalogPage }) {
  const [genre, setGenre] = useState('')
  const [year, setYear] = useState('')
  const [feed, setFeed] = useState<'popular' | 'top-rated'>('popular')
  const genres = [...new Set([...popular.items, ...current.items].flatMap((title) => title.genreNames))].sort()
  const query = useMemo(() => ({ kind, feed, genre: genre || undefined, year: year ? Number(year) : undefined }), [kind, feed, genre, year])
  const isDefault = !genre && !year && feed === 'popular'
  function reset() { setGenre(''); setYear(''); setFeed('popular') }
  return (
    <main className="mx-auto w-full max-w-[90rem] px-5 pt-9 pb-8 sm:px-8 sm:pt-12 lg:px-[50px]">
      <div className="mb-7 flex flex-col gap-6 sm:mb-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="shrink-0">
          <h1 className="font-display text-[2.75rem] leading-tight tracking-[-0.025em] text-ink sm:text-5xl">{kind === 'movie' ? 'Movies' : 'Series'}<span className="text-orange">.</span></h1>
          <p className="mt-2 text-sm text-muted">{kind === 'movie' ? 'Find your next great watch.' : 'Find your next can’t-stop-watching.'}</p>
        </div>
        <div aria-label="Filter titles" className="grid grid-cols-3 items-center gap-2 max-[359px]:grid-cols-2 sm:flex sm:flex-wrap" role="group">
          <SlidersHorizontal aria-hidden="true" className="mr-2 hidden size-4 text-muted xl:block" />
          <BrowseSelect label="Genre" onChange={setGenre} value={genre}><option value="">Genre</option>{genres.map((name) => <option key={name} value={name}>{name}</option>)}</BrowseSelect>
          <BrowseSelect label="Year" onChange={setYear} value={year}><option value="">Year</option>{Array.from({ length: currentYear - 1899 }, (_, index) => currentYear + 1 - index).map((value) => <option key={value} value={value}>{value}</option>)}</BrowseSelect>
          <BrowseSelect label="Sort by" onChange={(value) => setFeed(value === 'top-rated' ? 'top-rated' : 'popular')} value={feed}><option value="popular">Popular</option><option value="top-rated">Top rated</option></BrowseSelect>
          {!isDefault ? <Button className="col-span-3 justify-self-end max-[359px]:col-span-2" onClick={reset} size="sm" variant="ghost">Reset</Button> : null}
        </div>
      </div>
      <FeaturedRail items={current.items} kind={kind} />
      <CatalogFeed initialPage={isDefault ? popular : undefined} key={`${kind}:${feed}:${genre}:${year}`} query={query} reset={reset} />
    </main>
  )
}
