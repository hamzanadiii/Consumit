'use client'

import { ArtworkFrame, Button } from '@consumit/ui'
import { ChevronLeft, ChevronRight, Play, Search } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useId, useMemo, useState } from 'react'
import styles from './watch-surface.module.css'

export type RailEpisode = {
  number: number
  /** Clean display title (no "Episode N -" prefix); null renders the eyebrow only. */
  title: string | null
  stillUrl?: string | null | undefined
  meta?: string | null | undefined
  airDate?: string | null | undefined
  /** Absent renders a disabled upcoming row. */
  href?: string | undefined
  current?: boolean | undefined
  upcoming?: boolean | undefined
}

export type EpisodeArt = {
  title: string | null
  thumbnail: string | null
  airDate?: string | null
  duration?: number | null
}

/** Shared episode picker for anime and series Watch. The visible page loads
 *  canonical details in one batch; missing stills use labeled title art. */
export function EpisodeRail({ actions, countLabel, currentLabel, episodes, fallbackArt, heading, loadPage, pageSize = 24 }: {
  actions?: React.ReactNode | undefined
  countLabel: string
  currentLabel: string
  episodes: readonly RailEpisode[]
  fallbackArt?: string | null | undefined
  heading: string
  loadPage?: ((episodes: number[]) => Promise<Record<number, EpisodeArt | null>>) | undefined
  pageSize?: number | undefined
}) {
  const filterId = useId()
  const headingId = useId()
  const currentEpisodeIndex = episodes.findIndex((item) => item.current)
  const currentPage = currentEpisodeIndex < 0 ? 1 : Math.floor(currentEpisodeIndex / pageSize) + 1
  const [filter, setFilter] = useState('')
  const [pageOverride, setPageOverride] = useState<{ currentPage: number; value: number } | null>(null)
  const page = pageOverride?.currentPage === currentPage ? pageOverride.value : currentPage
  const changePage = (value: number) => setPageOverride({ currentPage, value })
  const [artCache, setArtCache] = useState<{ loader: typeof loadPage; art: Record<number, EpisodeArt | null> }>({ loader: loadPage, art: {} })
  const pageArt = useMemo(() => artCache.loader === loadPage ? artCache.art : {}, [artCache, loadPage])
  const query = filter.trim().toLowerCase()
  const matches = useMemo(() => {
    if (!query) return [...episodes]
    return episodes.filter((item) => {
      if (String(item.number) === query) return true
      if (`episode ${item.number}`.includes(query)) return true
      return (item.title ?? pageArt[item.number]?.title)?.toLowerCase().includes(query) ?? false
    }).slice(0, 100)
  }, [episodes, pageArt, query])
  const totalPages = Math.max(1, Math.ceil(matches.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const visible = query ? matches : matches.slice((safePage - 1) * pageSize, safePage * pageSize)
  const missingNumbers = visible.filter((episode) => !episode.upcoming && pageArt[episode.number] === undefined).map((episode) => episode.number)
  const missingKey = missingNumbers.join(',')
  useEffect(() => {
    const loader = loadPage
    if (!loader || !missingKey) return
    let active = true
    void loader(missingKey.split(',').map(Number)).then((found) => { if (active) setArtCache((previous) => ({ loader, art: { ...(previous.loader === loader ? previous.art : {}), ...found } })) }).catch(() => {
      if (active) setArtCache((previous) => ({ loader, art: { ...(previous.loader === loader ? previous.art : {}), ...Object.fromEntries(missingKey.split(',').map((number) => [number, null])) } }))
    })
    return () => { active = false }
  }, [loadPage, missingKey])

  return (
    <section aria-labelledby={headingId} className={styles.episodeRail}>
      <div className={styles.railHeading}>
        <h2 id={headingId}>
          {heading}
        </h2>
        <p className={styles.railCount} role="status">
          {query ? `${visible.length} match${visible.length === 1 ? '' : 'es'}` : countLabel}
        </p>
      </div>
      {actions ? <div className={styles.railActions}>{actions}</div> : null}
      <div className={styles.filter}>
          <Search aria-hidden="true" className="size-4 shrink-0 text-[var(--fs-muted)]" />
          <label className="sr-only" htmlFor={filterId}>Filter episodes</label>
          <input
            autoComplete="off"
            className={styles.filterInput}
            id={filterId}
            onChange={(event) => { const value = event.currentTarget.value; setFilter(value); changePage(value ? 1 : currentPage) }}
            placeholder="Filter episodes..."
            type="search"
            value={filter}
          />
      </div>
      {visible.length ? (
        <ul aria-label="Episode picker" className={styles.episodeList}>
          {visible.map((item) => (
            <RailRow currentLabel={currentLabel} fallbackArt={fallbackArt} key={item.number} item={item} art={pageArt[item.number]} />
          ))}
        </ul>
      ) : (
        <div className={styles.railEmpty}>
          <p className="text-sm text-[var(--fs-muted)]">No episodes match “{filter.trim()}”.</p>
          <Button
            className="mt-3 min-h-11"
            onClick={() => { setFilter(''); changePage(currentPage) }}
            variant="secondary"
          >
            Clear filter
          </Button>
        </div>
      )}
      {!query && totalPages > 1 ? (
        <nav aria-label="Episode pages" className={styles.railPages}>
          <p className="flex-1 text-xs tabular-nums text-[var(--fs-muted)]" role="status">
            Page {safePage} of {totalPages}
          </p>
          <button
            aria-label="Go to previous episode page"
            className={styles.pageButton}
            disabled={safePage === 1}
            onClick={() => changePage(safePage - 1)}
            type="button"
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
          </button>
          <button
            aria-label="Go to next episode page"
            className={styles.pageButton}
            disabled={safePage === totalPages}
            onClick={() => changePage(safePage + 1)}
            type="button"
          >
            <ChevronRight aria-hidden="true" className="size-4" />
          </button>
        </nav>
      ) : null}
    </section>
  )
}

function RailRow({ currentLabel, item, art, fallbackArt }: {
  currentLabel: string
  item: RailEpisode
  art?: EpisodeArt | null | undefined
  fallbackArt?: string | null | undefined
}) {
  const still = item.stillUrl ?? art?.thumbnail ?? undefined
  const title = item.title ?? art?.title ?? `Episode ${item.number}`
  const active = item.current && !item.upcoming
  const status = item.upcoming ? 'Not aired yet' : active ? currentLabel : null
  const airDate = item.airDate ?? art?.airDate
  // Explicit locale: bare toLocaleDateString renders the server locale during
  // SSR and the browser locale on hydration, which splits the tree.
  const date = airDate ? new Date(`${airDate}T00:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }) : null
  const meta = [item.meta ?? (art?.duration ? `${art.duration}m` : null), date].filter(Boolean).join(' · ')
  const rowClass = `${styles.episodeRow}${active ? ` ${styles.currentEpisode}` : ''}`
  const body = (
    <>
      <ArtworkFrame
        alt={still ? `${title} still` : `${title} title artwork`}
        className={styles.episodeArt}
        ratio="wide"
        src={still ?? fallbackArt ?? undefined}
      />
      <span className={styles.episodeCopy}>
        <span className={styles.episodeNumber}>Episode {item.number}</span>
        <span className={styles.episodeName}>{title}</span>
        {meta ? <span className={styles.episodeMeta}>{meta}</span> : null}
        {!still && fallbackArt ? <span className={styles.episodeMeta}>Title artwork</span> : null}
        {status ? <span className={active ? styles.playingLabel : styles.episodeMeta}>{status}</span> : null}
      </span>
      {active ? <Play aria-hidden="true" className={styles.playingIcon} size={14} /> : null}
    </>
  )
  return (
    <li className="min-w-0">
      {!item.href ? (
        <span aria-disabled="true" title={item.upcoming ? 'Not aired yet' : undefined} className={rowClass}>
          {body}
        </span>
      ) : (
        <Link
          aria-current={item.current ? 'page' : undefined}
          aria-label={`Watch episode ${item.number}${item.current ? ', now playing' : ''}: ${title}`}
          className={rowClass}
          href={item.href}
          title={title}
        >
          {body}
        </Link>
      )}
    </li>
  )
}
