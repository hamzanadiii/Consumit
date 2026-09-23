'use client'

import { ArtworkFrame } from '@consumit/ui'
import { ChevronLeft, ChevronRight, Play, Search } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

export type RailEpisode = {
  number: number
  /** Clean display title (no "Episode N -" prefix); null renders the eyebrow only. */
  title: string | null
  stillUrl?: string | null | undefined
  meta?: string | null | undefined
  /** Absent renders a disabled upcoming row. */
  href?: string | undefined
  current?: boolean | undefined
  upcoming?: boolean | undefined
}

export type EpisodeArt = {
  title: string | null
  thumbnail: string | null
}

/** Shared episode picker for the anime and series watch rails: full-bleed
 *  still cards with overlaid titles, filter, and paging. Art resolves
 *  streaming still → `loadArt` (canonical episode endpoint) → placeholder;
 *  failures stay placeholder, never an error state. */
export function EpisodeRail({ actions, countLabel, currentLabel, episodes, heading, loadArt, pageSize = 24 }: {
  actions?: React.ReactNode | undefined
  countLabel: string
  currentLabel: string
  episodes: readonly RailEpisode[]
  heading: string
  loadArt?: ((episode: number) => Promise<EpisodeArt | null>) | undefined
  pageSize?: number | undefined
}) {
  const [filter, setFilter] = useState('')
  const [page, setPage] = useState(1)
  const query = filter.trim().toLowerCase()
  const matches = useMemo(() => {
    if (!query) return [...episodes]
    return episodes.filter((item) => {
      if (String(item.number) === query) return true
      if (`episode ${item.number}`.includes(query)) return true
      return item.title?.toLowerCase().includes(query) ?? false
    }).slice(0, 100)
  }, [episodes, query])
  const totalPages = Math.max(1, Math.ceil(matches.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const visible = query ? matches : matches.slice((safePage - 1) * pageSize, safePage * pageSize)

  return (
    <section aria-labelledby="episode-rail-heading" className="flex min-w-0 flex-col rounded-[16px] border border-[var(--fs-field-border)] bg-[var(--fs-field)] p-4">
      <div className="flex items-baseline justify-between gap-2 px-1">
        <h2 id="episode-rail-heading" className="text-[11px] font-bold tracking-[0.12em] text-[var(--fs-muted)] uppercase">
          {heading}
        </h2>
        <p className="text-xs tabular-nums text-[var(--fs-muted)]" role="status">
          {query ? `${visible.length} match${visible.length === 1 ? '' : 'es'}` : countLabel}
        </p>
      </div>
      {actions ? <div className="mt-3 px-1">{actions}</div> : null}
      <div className="mt-3 flex items-center gap-2">
        <div className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-[var(--fs-field-border)] bg-[var(--fs-rail)] px-3 outline-none transition-colors focus-within:border-[var(--fs-focus)]">
          <Search aria-hidden="true" className="size-4 shrink-0 text-[var(--fs-muted)]" />
          <label className="sr-only" htmlFor="episode-rail-filter">Filter episodes</label>
          <input
            autoComplete="off"
            className="h-11 min-w-0 flex-1 bg-transparent text-sm text-[var(--fs-ink)] outline-none placeholder:text-[var(--fs-muted)]"
            id="episode-rail-filter"
            onChange={(event) => { setFilter(event.currentTarget.value); setPage(1) }}
            placeholder="Filter episodes..."
            type="search"
            value={filter}
          />
        </div>
      </div>
      {visible.length ? (
        <ul aria-label="Episode picker" className="mt-3 flex max-h-[50vh] flex-col gap-3 overflow-y-auto pr-0.5 lg:max-h-[44rem]">
          {visible.map((item) => (
            <RailRow currentLabel={currentLabel} key={item.number} item={item} loadArt={loadArt} />
          ))}
        </ul>
      ) : (
        <div className="mt-3 rounded-xl border border-dashed border-[var(--fs-field-border)] px-4 py-8 text-center">
          <p className="text-sm text-[var(--fs-muted)]">No episodes match “{filter.trim()}”.</p>
          <button
            className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-[var(--fs-field-border)] px-4 text-sm font-bold text-[var(--fs-ink)] outline-none transition-colors hover:border-[var(--fs-focus)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]"
            onClick={() => setFilter('')}
            type="button"
          >
            Clear filter
          </button>
        </div>
      )}
      {!query && totalPages > 1 ? (
        <nav aria-label="Episode pages" className="mt-3 flex items-center gap-2 border-t border-[var(--fs-line)] px-1 pt-3">
          <p className="flex-1 text-xs tabular-nums text-[var(--fs-muted)]" role="status">
            Page {safePage} of {totalPages}
          </p>
          <button
            aria-label="Go to previous episode page"
            className="grid size-11 cursor-pointer place-items-center rounded-xl border border-[var(--fs-field-border)] bg-[var(--fs-rail)] text-[var(--fs-muted)] outline-none transition-colors hover:text-[var(--fs-accent)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)] disabled:cursor-default disabled:opacity-40 disabled:hover:text-[var(--fs-muted)]"
            disabled={safePage === 1}
            onClick={() => setPage(safePage - 1)}
            type="button"
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
          </button>
          <button
            aria-label="Go to next episode page"
            className="grid size-11 cursor-pointer place-items-center rounded-xl border border-[var(--fs-field-border)] bg-[var(--fs-rail)] text-[var(--fs-muted)] outline-none transition-colors hover:text-[var(--fs-accent)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)] disabled:cursor-default disabled:opacity-40 disabled:hover:text-[var(--fs-muted)]"
            disabled={safePage === totalPages}
            onClick={() => setPage(safePage + 1)}
            type="button"
          >
            <ChevronRight aria-hidden="true" className="size-4" />
          </button>
        </nav>
      ) : null}
    </section>
  )
}

function RailRow({ currentLabel, item, loadArt }: {
  currentLabel: string
  item: RailEpisode
  loadArt?: ((episode: number) => Promise<EpisodeArt | null>) | undefined
}) {
  const [art, setArt] = useState<EpisodeArt | null>(null)
  useEffect(() => {
    setArt(null)
    if (item.stillUrl || item.upcoming || !loadArt) return
    let active = true
    let retry: ReturnType<typeof setTimeout> | undefined
    const load = (attempt: number) => {
      void loadArt(item.number).then(
        (found) => {
          if (!active) return
          if (found && (found.thumbnail || found.title)) {
            setArt(found)
          } else if (attempt === 0) {
            retry = setTimeout(() => { if (active) load(1) }, 3_000)
          }
        },
        () => {
          if (active && attempt === 0) retry = setTimeout(() => { if (active) load(1) }, 3_000)
        },
      )
    }
    load(0)
    return () => {
      active = false
      clearTimeout(retry)
    }
  }, [item.number, item.stillUrl, item.upcoming, loadArt])
  const still = item.stillUrl ?? art?.thumbnail ?? undefined
  const title = item.title ?? art?.title ?? `Episode ${item.number}`
  const status = item.current ? currentLabel : item.upcoming ? 'Not aired yet' : null
  const meta = [item.meta, status].filter(Boolean).join(' · ')
  const rowClass = item.current
    ? 'group block min-w-0 overflow-hidden rounded-xl bg-[var(--fs-accent-soft)] text-left shadow-[inset_0_0_0_1px_var(--fs-accent)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]'
    : 'group block min-w-0 overflow-hidden rounded-xl border border-transparent text-left outline-none transition-all duration-200 ease-out hover:-translate-y-0.5 hover:border-[var(--fs-accent)]/50 hover:shadow-[0_12px_32px_rgba(0,0,0,0.35)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)] motion-reduce:transition-none motion-reduce:transform-none'
  const body = (
    <ArtworkFrame
      alt={`${title} still`}
      className="rounded-xl border-0"
      ratio="wide"
      src={still}
    >
      <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/35 to-black/10" />
      <span className="absolute top-2 left-2 flex items-center gap-1.5">
        <span className="rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white uppercase">
          EP {item.number}
        </span>
        {item.current ? (
          <span className="grid size-6 place-items-center rounded-full bg-[var(--fs-accent)] text-[var(--fs-on-accent)]">
            <Play aria-hidden="true" className="size-3 fill-current" />
          </span>
        ) : null}
      </span>
      <span className="absolute inset-x-0 bottom-0 flex min-w-0 flex-col gap-px p-2.5">
        <span className="text-[0.625rem] font-bold tracking-[0.14em] text-white/75 uppercase">
          Episode {item.number}
        </span>
        <span className="line-clamp-2 text-sm leading-5 font-bold text-white [text-shadow:0_1px_10px_rgba(0,0,0,0.9)]">
          {title}
        </span>
        {meta ? (
          <span className="text-[11px] tabular-nums text-white/65">
            {meta}
          </span>
        ) : null}
      </span>
    </ArtworkFrame>
  )
  return (
    <li className="min-w-0">
      {!item.href ? (
        <span aria-disabled="true" title={item.upcoming ? 'Not aired yet' : undefined} className={`${rowClass} cursor-not-allowed opacity-70`}>
          {body}
        </span>
      ) : (
        <Link
          aria-current={item.current ? 'page' : undefined}
          aria-label={`Watch episode ${item.number}${item.current ? ', now playing' : ''}`}
          className={rowClass}
          href={item.href}
        >
          {body}
        </Link>
      )}
    </li>
  )
}
