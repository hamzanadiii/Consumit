'use client'

import type { AnimePage, AnimeSeason, AnimeTitleSummary } from '@consumit/contracts'
import { ArtworkFrame, Button, Select } from '@consumit/ui'
import { ArrowLeft, ArrowRight, SlidersHorizontal, Star } from 'lucide-react'
import Link from 'next/link'
import { useMemo, useRef, useState } from 'react'

import { useAnimeFeed, type AnimeFeedQuery } from './use-anime-feed'

function animeHref(anime: AnimeTitleSummary) {
  return `/anime/${anime.anilistId}`
}

function AnimePosterCard({ anime }: { anime: AnimeTitleSummary }) {
  const rating = anime.averageScore === null ? null : (anime.averageScore / 10).toFixed(1)
  return (
    <li className="min-w-0 w-40 shrink-0 snap-start sm:w-44 lg:w-48 [content-visibility:auto] [contain-intrinsic-size:auto_300px]">
      <Link
        aria-label={`${anime.titles.preferred}${anime.seasonYear ? `, ${anime.seasonYear}` : ''}`}
        className="group block rounded-card outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]"
        href={animeHref(anime)}
        prefetch={false}
      >
        <ArtworkFrame
          alt={`${anime.titles.preferred} poster`}
          className="transition-colors duration-200 group-hover:border-[var(--fs-accent)] motion-reduce:transition-none"
          ratio="portrait"
          src={anime.coverImage.url || undefined}
        >
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-3 pt-8 pb-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none [@media(hover:none)]:opacity-100">
            <p className="truncate text-sm font-bold text-white">{anime.titles.preferred}</p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-white/80 tabular-nums">
              {anime.seasonYear ? <span>{anime.seasonYear}</span> : null}
              {rating ? (
                <span className="inline-flex items-center gap-1 font-bold text-white">
                  <Star aria-hidden="true" className="size-3 fill-current" />
                  {rating}
                  <span className="sr-only">score</span>
                </span>
              ) : null}
            </p>
          </div>
        </ArtworkFrame>
      </Link>
    </li>
  )
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
      <ul className="flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain py-1 pr-1 pb-3 sm:gap-5" ref={railRef} style={{ scrollbarWidth: 'none' }}>
        {items.slice(0, 10).map((anime) => {
          const rating = anime.averageScore === null ? null : (anime.averageScore / 10).toFixed(1)
          return (
            <li className="w-[85%] max-w-[26rem] shrink-0 snap-start sm:w-[52%] lg:w-[38%] xl:w-[32%]" key={`anime:${anime.anilistId}`}>
              <Link aria-label={anime.titles.preferred} className="group block overflow-hidden rounded-xl border border-[var(--fs-line)] bg-[var(--fs-field)] shadow-sm outline-none transition-all duration-200 ease-out hover:-translate-y-1 hover:border-[var(--fs-accent)]/50 hover:shadow-[0_12px_32px_rgba(0,0,0,0.35)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)] motion-reduce:transition-none motion-reduce:transform-none" href={animeHref(anime)} prefetch={false}>
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
                          <Star aria-hidden="true" className="size-3.5 fill-current text-[#ffb800]" />
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

function AnimeGrid({ items, loading, error, hasMore, loadMore, sentinelRef, onReset }: { items: AnimeTitleSummary[]; loading: boolean; error: boolean; hasMore: boolean; loadMore: () => void; sentinelRef: React.RefObject<HTMLDivElement | null>; onReset: () => void }) {
  return (
    <section aria-labelledby="browse-results-heading">
      <div className="mb-5 flex items-baseline justify-between gap-4 border-b border-[var(--fs-line)] pb-4">
        <h2 className="font-display text-2xl tracking-[-0.02em] text-[var(--fs-ink)]" id="browse-results-heading">Popular this season</h2>
        <p className="text-xs tabular-nums text-[var(--fs-muted)]" role="status">{items.length > 0 ? `${items.length} titles` : 'Finding titles…'}</p>
      </div>
      <ul aria-busy={loading} className="grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-3 sm:gap-x-4 sm:gap-y-7 lg:grid-cols-4 xl:grid-cols-6">
        {items.map((anime) => <AnimePosterCard key={`anime:${anime.anilistId}`} anime={anime} />)}
        {loading ? Array.from({ length: 6 }, (_, index) => <li aria-hidden="true" className="aspect-[2/3] animate-pulse rounded-[16px] border border-[var(--fs-line)] bg-[var(--fs-field)] motion-reduce:animate-none" key={`loading-${index}`} />) : null}
      </ul>
      {!loading && !error && items.length === 0 ? (
        <div className="py-16 text-center">
          <h3 className="font-display text-2xl text-[var(--fs-ink)]">No titles found</h3>
          <p className="mt-3 mb-6 text-sm text-[var(--fs-muted)]">Try another genre or format to find something to watch.</p>
          <Button onClick={onReset} variant="secondary">Clear filters</Button>
        </div>
      ) : null}
      <div className="flex min-h-40 flex-col items-center justify-center gap-4 py-10" ref={sentinelRef}>
        {error ? <p className="max-w-md text-center text-sm text-[var(--fs-ink)]" role="alert">We couldn't load {items.length > 0 ? 'more' : 'these'} titles. Please try again.</p> : null}
        {hasMore ? <Button loading={loading} onClick={() => void loadMore()} variant="secondary">{loading ? 'Loading titles…' : error ? 'Try again' : 'Load more'}</Button> : null}
        {!hasMore && items.length > 0 ? <p className="text-sm text-[var(--fs-muted)]">You're all caught up. Try another genre or format.</p> : null}
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

export function AnimeBrowseContent({ trending, seasonal, season, year }: { trending: AnimePage; seasonal: AnimePage; season: AnimeSeason; year: number }) {
  const [genre, setGenre] = useState('')
  const [format, setFormat] = useState('')
  const feedQuery = useMemo<AnimeFeedQuery>(() => ({ season, year }), [season, year])
  const { page, loading, error, hasMore, loadMore, sentinelRef } = useAnimeFeed(feedQuery, seasonal)
  const allItems = useMemo(() => [...trending.items, ...(page?.items ?? [])], [trending.items, page?.items])
  const genres = [...new Set(allItems.flatMap((anime) => anime.genres))].sort()
  const formats = [...new Set(allItems.map((anime) => anime.format))].sort()
  const filtered = useMemo(() => {
    let items = page?.items ?? seasonal.items
    if (genre) items = items.filter((anime) => anime.genres.includes(genre))
    if (format) items = items.filter((anime) => anime.format === format)
    return items
  }, [page, seasonal, genre, format])
  const isDefault = !genre && !format
  function reset() { setGenre(''); setFormat('') }
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
          <BrowseSelect label="Format" onChange={setFormat} options={[{ label: 'All formats', value: '' }, ...formats.map((f) => ({ label: f, value: f }))]} value={format} />
          {!isDefault ? <Button className="col-span-3 justify-self-end max-[359px]:col-span-2" onClick={reset} size="sm" variant="ghost">Reset</Button> : null}
        </div>
      </div>
      <AnimeFeaturedRail items={trending.items} />
      <AnimeGrid items={isDefault ? (page?.items ?? seasonal.items) : filtered} loading={loading} error={error} hasMore={hasMore} loadMore={loadMore} sentinelRef={sentinelRef} onReset={reset} />
    </main>
  )
}
