'use client'

import type { AnimeBrowseSort, AnimeFormat, AnimePage, AnimeTitleSummary } from '@consumit/contracts'
import { ArtworkFrame, Button, Select } from '@consumit/ui'
import { ArrowLeft, ArrowRight, SlidersHorizontal, Star } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useRef, useState } from 'react'

import { useAnimeFeed, type AnimeFeedQuery } from './use-anime-feed'
import { TitleCard } from '../shared/title-card'

function animeHref(anime: AnimeTitleSummary) {
  return `/anime/${anime.anilistId}`
}

function AnimeFeaturedRail({ items }: { items: AnimeTitleSummary[] }) {
  const railRef = useRef<HTMLUListElement>(null)
  if (items.length === 0) return null
  function move(direction: number) {
    const rail = railRef.current
    rail?.scrollBy({ left: rail.clientWidth * 0.8 * direction, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
  }
  const scrollButtonClass = 'grid size-11 cursor-pointer place-items-center rounded-xl border border-[var(--fs-field-border)] bg-[var(--fs-field)] text-[var(--fs-muted)] outline-none transition-colors hover:text-[var(--fs-accent)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]'
  return (
    <section aria-labelledby="featured-heading" className="mb-10 sm:mb-12">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="font-display text-2xl tracking-[-0.02em] text-[var(--fs-ink)] sm:text-3xl" id="featured-heading">Trending Now</h2>
        <div className="flex gap-1.5">
          <button aria-label="Scroll featured titles left" className={scrollButtonClass} onClick={() => move(-1)} type="button"><ArrowLeft aria-hidden="true" className="size-4" /></button>
          <button aria-label="Scroll featured titles right" className={scrollButtonClass} onClick={() => move(1)} type="button"><ArrowRight aria-hidden="true" className="size-4" /></button>
        </div>
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
        <p className="text-xs tabular-nums text-[var(--fs-muted)]" role="status">{page ? `${items.length} titles` : 'Finding titles…'}</p>
      </div>
      <ul aria-busy={loading} className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-7 lg:grid-cols-4 xl:grid-cols-6">
        {items.map((anime) => <TitleCard className="min-w-0 [content-visibility:auto] [contain-intrinsic-size:auto_300px]" key={`anime:${anime.anilistId}`} title={{ id: anime.anilistId, kind: 'anime', title: anime.titles.preferred, year: anime.seasonYear, posterUrl: anime.coverImage.url, tmdbRating: anime.averageScore === null ? null : anime.averageScore / 10 }} />)}
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
    <div className="min-w-0 flex-1 sm:w-44 sm:flex-none">
      <Select hideLabel label={label} onValueChange={onChange} options={options} placeholder={label} value={value} />
    </div>
  )
}

const GRID_HEADINGS: Record<AnimeBrowseSort, string> = {
  popular: 'Popular now',
  'top-rated': 'Top rated',
  new: 'New releases',
  old: 'Old releases',
}

export function AnimeBrowseContent({ trending, initial, currentYear }: { trending: AnimePage; initial: AnimePage; currentYear: number }) {
  const [genre, setGenre] = useState('')
  const [year, setYear] = useState('')
  const [format, setFormat] = useState('')
  const [sort, setSort] = useState<AnimeBrowseSort>('popular')
  const genres = [...new Set([...trending.items, ...initial.items].flatMap((anime) => anime.genres))].sort()
  const formats = [...new Set([...trending.items, ...initial.items].map((anime) => anime.format))].sort()
  const years = useMemo(() => Array.from({ length: currentYear + 2 - 1917 }, (_, index) => currentYear + 1 - index), [currentYear])
  const feedQuery = useMemo<AnimeFeedQuery>(() => ({
    sort,
    ...(genre ? { genre } : {}),
    ...(year ? { year: Number(year) } : {}),
    ...(format && (formats as readonly string[]).includes(format) ? { format: format as AnimeFormat } : {}),
  }), [sort, genre, year, format, formats])
  const isDefault = sort === 'popular' && !genre && !year && !format
  function reset() { setGenre(''); setYear(''); setFormat(''); setSort('popular') }
  return (
    <main className="consumit-anime-browse w-full">
      <div className="mb-7 flex flex-col gap-6 sm:mb-8 lg:flex-row lg:items-end lg:justify-between">
        <div className="shrink-0">
          <h1 className="font-display text-[2.75rem] leading-tight tracking-[-0.025em] text-[var(--fs-ink)] sm:text-5xl">Anime<span className="text-[var(--fs-accent)]">.</span></h1>
          <p className="mt-2 text-sm text-[var(--fs-muted)]">Discover anime from AniList.</p>
        </div>
        <div aria-label="Filter anime" className="grid grid-cols-3 items-center gap-2 max-[359px]:grid-cols-2 sm:flex sm:flex-wrap" role="group">
          <SlidersHorizontal aria-hidden="true" className="mr-2 hidden size-4 text-[var(--fs-muted)] xl:block" />
          <BrowseSelect label="Genre" onChange={setGenre} options={[{ label: 'All genres', value: '' }, ...genres.map((name) => ({ label: name, value: name }))]} value={genre} />
          <BrowseSelect label="Year" onChange={setYear} options={[{ label: 'All years', value: '' }, ...years.map((value) => ({ label: String(value), value: String(value) }))]} value={year} />
          <BrowseSelect label="Format" onChange={setFormat} options={[{ label: 'All formats', value: '' }, ...formats.map((f) => ({ label: f, value: f }))]} value={format} />
          <BrowseSelect label="Sort by" onChange={(value) => setSort(value === 'top-rated' || value === 'new' || value === 'old' ? value : 'popular')} options={[{ label: 'Popular', value: 'popular' }, { label: 'Top rated', value: 'top-rated' }, { label: 'New releases', value: 'new' }, { label: 'Old releases', value: 'old' }]} value={sort} />
          {!isDefault ? <Button className="col-span-3 justify-self-end max-[359px]:col-span-2" onClick={reset} size="sm" variant="ghost">Reset</Button> : null}
        </div>
      </div>
      <AnimeFeaturedRail items={trending.items} />
      <AnimeFeed heading={GRID_HEADINGS[sort]} initialPage={isDefault ? initial : undefined} key={`${sort}:${genre}:${year}:${format}`} onReset={reset} query={feedQuery} />
    </main>
  )
}
