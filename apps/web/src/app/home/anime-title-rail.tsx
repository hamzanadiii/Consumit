'use client'

import type { AnimeTitleSummary } from '@consumit/contracts'
import { ArrowUpRight, ChevronLeft, ChevronRight } from 'lucide-react'
import { SectionHeading } from '@consumit/ui'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { useHorizontalRail } from '../shared/use-horizontal-rail'
import { TitleCard } from '../shared/title-card'

export type AnimeTitleRailProps = {
  id: string
  title: string
  items: readonly AnimeTitleSummary[]
  description?: string | undefined
  viewAllHref?: string | undefined
  icon?: ReactNode | undefined
}

export function AnimeTitleRail({ id, title, items, description, viewAllHref, icon }: AnimeTitleRailProps) {
  const { railRef, canScroll, atStart, atEnd, move } = useHorizontalRail(items.length, { scrollFraction: 0.75 })

  if (!items.length) return null

  return (
    <section aria-labelledby={`${id}-heading`} className="group/rail relative mt-8">
      <SectionHeading id={`${id}-heading`} title={title} description={description} icon={icon} action={viewAllHref ? (
          <Link
            className="flex min-h-10 items-center gap-1 text-xs text-[var(--fs-muted)] outline-none transition-colors hover:text-[var(--fs-accent)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]"
            href={viewAllHref}
          >
            View All
            <ArrowUpRight aria-hidden="true" className="size-3.5" />
          </Link>
        ) : null} />

      <div className="relative mt-4">
        {canScroll && !atStart ? (
          <button
            aria-label={`Scroll ${title} left`}
            className="absolute -left-3 top-1/2 z-20 hidden size-10 -translate-y-1/2 cursor-pointer place-items-center rounded-full border border-white/20 bg-black/80 text-white shadow-xl backdrop-blur-md transition-[transform,background-color] hover:scale-110 hover:bg-black focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)] motion-reduce:transition-none motion-reduce:transform-none sm:grid"
            onClick={() => move(-1)}
            type="button"
          >
            <ChevronLeft aria-hidden="true" className="size-5" />
          </button>
        ) : null}

        <ul
          aria-label={`${title} titles`}
          className="flex snap-x snap-mandatory gap-3 overflow-x-auto overscroll-x-contain rounded-xl py-2 pr-1 pb-3 fs-noscroll outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)] sm:gap-4"
          ref={railRef}
          tabIndex={0}
        >
          {items.map((anime) => (
            <TitleCard
              className="w-40 shrink-0 snap-start sm:w-44 lg:w-48"
              key={`anime:${anime.anilistId}`}
              title={{ id: anime.anilistId, kind: 'anime', title: anime.titles.preferred, year: anime.seasonYear, posterUrl: anime.coverImage.url, backdropUrl: anime.bannerImage, tmdbRating: anime.averageScore === null ? null : anime.averageScore / 10 }}
            />
          ))}
        </ul>

        {canScroll && !atEnd ? (
          <button
            aria-label={`Scroll ${title} right`}
            className="absolute -right-3 top-1/2 z-20 hidden size-10 -translate-y-1/2 cursor-pointer place-items-center rounded-full border border-white/20 bg-black/80 text-white shadow-xl backdrop-blur-md transition-[transform,background-color] hover:scale-110 hover:bg-black focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)] motion-reduce:transition-none motion-reduce:transform-none sm:grid"
            onClick={() => move(1)}
            type="button"
          >
            <ChevronRight aria-hidden="true" className="size-5" />
          </button>
        ) : null}
      </div>
    </section>
  )
}
