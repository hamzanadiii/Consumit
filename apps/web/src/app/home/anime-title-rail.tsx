'use client'

import type { AnimeTitleSummary } from '@consumit/contracts'
import { ArtworkFrame } from '@consumit/ui'
import { ChevronLeft, ChevronRight, Star } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState, type ReactNode } from 'react'

function animeHref(anime: AnimeTitleSummary) {
  return `/anime/${anime.anilistId}`
}

function AnimeCard({ anime }: { anime: AnimeTitleSummary }) {
  const rating = anime.averageScore === null ? null : (anime.averageScore / 10).toFixed(1)
  return (
    <li className="w-40 shrink-0 snap-start sm:w-44 lg:w-48">
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

export type AnimeTitleRailProps = {
  id: string
  title: string
  items: readonly AnimeTitleSummary[]
  description?: string | undefined
  viewAllHref?: string | undefined
  icon?: ReactNode | undefined
}

export function AnimeTitleRail({ id, title, items, description, viewAllHref, icon }: AnimeTitleRailProps) {
  const scrollRef = useRef<HTMLUListElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const checkScroll = () => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 15)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 15)
  }

  useEffect(() => {
    checkScroll()
    const el = scrollRef.current
    if (!el) return
    el.addEventListener('scroll', checkScroll, { passive: true })
    window.addEventListener('resize', checkScroll)
    return () => {
      el.removeEventListener('scroll', checkScroll)
      window.removeEventListener('resize', checkScroll)
    }
  }, [items])

  const scroll = (direction: 'left' | 'right') => {
    const el = scrollRef.current
    if (!el) return
    const amount = el.clientWidth * 0.75
    el.scrollBy({ left: direction === 'left' ? -amount : amount, behavior: 'smooth' })
  }

  if (!items.length) return null

  return (
    <section aria-labelledby={`${id}-heading`} className="group/rail relative mt-8">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
        <div>
          <h2 className="flex items-center gap-2 font-display text-2xl tracking-[-0.02em] text-[var(--fs-ink)]" id={`${id}-heading`}>
            {title}
            {icon}
          </h2>
          {description ? <p className="mt-1 text-xs text-[var(--fs-muted)]">{description}</p> : null}
        </div>
        {viewAllHref ? (
          <Link
            className="flex items-center gap-1 text-xs font-bold text-[var(--fs-muted)] outline-none transition-colors hover:text-[var(--fs-ink)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]"
            href={viewAllHref}
          >
            View All
            <span aria-hidden="true">&rarr;</span>
          </Link>
        ) : null}
      </div>

      <div className="relative mt-4">
        {canScrollLeft ? (
          <button
            aria-label={`Scroll ${title} left`}
            className="absolute -left-3 top-1/2 z-20 hidden size-10 -translate-y-1/2 cursor-pointer place-items-center rounded-full border border-white/20 bg-black/80 text-white shadow-xl backdrop-blur-md transition-all hover:scale-110 hover:bg-black focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)] sm:grid"
            onClick={() => scroll('left')}
            type="button"
          >
            <ChevronLeft aria-hidden="true" className="size-5" />
          </button>
        ) : null}

        <ul
          aria-label={`${title} titles`}
          className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain rounded-xl py-2 pr-1 pb-3 fs-noscroll outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)] sm:gap-4"
          ref={scrollRef}
          role="region"
          tabIndex={0}
        >
          {items.map((anime) => (
            <AnimeCard key={`anime:${anime.anilistId}`} anime={anime} />
          ))}
        </ul>

        {canScrollRight ? (
          <button
            aria-label={`Scroll ${title} right`}
            className="absolute -right-3 top-1/2 z-20 hidden size-10 -translate-y-1/2 cursor-pointer place-items-center rounded-full border border-white/20 bg-black/80 text-white shadow-xl backdrop-blur-md transition-all hover:scale-110 hover:bg-black focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)] sm:grid"
            onClick={() => scroll('right')}
            type="button"
          >
            <ChevronRight aria-hidden="true" className="size-5" />
          </button>
        ) : null}
      </div>
    </section>
  )
}
