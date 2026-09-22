'use client'

import type { CatalogTitleSummary } from '@consumit/contracts'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState, type ReactNode } from 'react'

import { TitleCard } from './title-card'

export type TitleRailProps = {
  id: string
  title: string
  items: readonly CatalogTitleSummary[]
  description?: string | undefined
  viewAllHref?: string | undefined
  icon?: ReactNode | undefined
}

export function TitleRail({ id, title, items, description, viewAllHref, icon }: TitleRailProps) {
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
          {items.map((item) => (
            <TitleCard key={`${item.kind}:${item.id}`} title={item} />
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
