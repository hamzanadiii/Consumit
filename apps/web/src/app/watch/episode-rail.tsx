'use client'

import { ArtworkFrame, Button } from '@consumit/ui'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import styles from './watch-surface.module.css'

export type RailEpisode = {
  number: number
  seasonNumber?: number | undefined
  /** Clean display title (no "Episode N -" prefix); null renders the eyebrow only. */
  title: string | null
  description?: string | null | undefined
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
  description?: string | null | undefined
  /** Existing provider art loaders may still call this field synopsis. */
  synopsis?: string | null | undefined
  thumbnail: string | null
  airDate?: string | null
  duration?: number | null
}

/** Shared episode picker for anime and series Watch. The visible page loads
 *  canonical details in one batch; missing stills use labeled title art. */
type EpisodeBrowserProps = {
  actions?: React.ReactNode | undefined
  countLabel: string
  currentLabel: string
  episodes: readonly RailEpisode[]
  fallbackArt?: string | null | undefined
  heading: string
  loadPage?: ((episodes: number[]) => Promise<Record<number, EpisodeArt | null>>) | undefined
  pending?: boolean | undefined
  pageSize?: number | undefined
}


export function EpisodeRail(props: EpisodeBrowserProps) {
  const browser = useEpisodeBrowser(props)
  return <EpisodeBrowser {...props} browser={browser} />
}

export function useEpisodeBrowser({ episodes, loadPage, pageSize = 24 }: Pick<EpisodeBrowserProps, 'episodes' | 'loadPage' | 'pageSize'>) {
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

  return { filter, setFilter, changePage, currentPage, pageArt, query, visible, totalPages, safePage }
}

export function EpisodeBrowser({ pending = false, actions, countLabel, currentLabel, fallbackArt, heading, browser }: EpisodeBrowserProps & { browser: ReturnType<typeof useEpisodeBrowser> }) {
  const filterId = useId()
  const headingId = useId()
  const listRef = useRef<HTMLUListElement | null>(null)
  const { filter, setFilter, changePage, currentPage, pageArt, query, visible, totalPages, safePage } = browser
  const scrollEpisodes = (direction: -1 | 1) => {
    const list = listRef.current
    if (list) list.scrollBy({ left: direction * Math.max(list.clientWidth * 0.78, 280), behavior: 'auto' })
  }

  return (
    <section aria-labelledby={headingId} className={styles.episodeRail} data-episode-has-actions={actions ? 'true' : 'false'}>
      <div className={styles.railHeading}>
        <h2 data-episode-browser-heading id={headingId}>
          {heading}
        </h2>
        <p data-episode-browser-count className={styles.railCount} role="status">
          {query ? `${visible.length} match${visible.length === 1 ? '' : 'es'}` : countLabel}
        </p>
      </div>
      <div className={styles.browserToolbar}>
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
      </div>
      {pending ? null : visible.length ? (
        <div className={styles.episodeCarousel} data-episode-carousel>
          {visible.length > 1 ? <>
            <button aria-label="Show previous episodes" className={`${styles.episodeCarouselArrow} ${styles.episodeCarouselPrevious}`} onClick={() => scrollEpisodes(-1)} type="button"><ChevronLeft aria-hidden="true" className="size-6" /></button>
            <button aria-label="Show more episodes" className={`${styles.episodeCarouselArrow} ${styles.episodeCarouselNext}`} onClick={() => scrollEpisodes(1)} type="button"><ChevronRight aria-hidden="true" className="size-6" /></button>
          </> : null}
          <ul aria-label="Episode picker" className={styles.episodeList} data-episode-carousel-track ref={listRef}>
            {visible.map((item) => (
              <RailRow currentLabel={currentLabel} fallbackArt={fallbackArt} key={item.number} item={item} art={pageArt[item.number]} />
            ))}
          </ul>
        </div>
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
      {!pending && !query && totalPages > 1 ? (
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
  const rowClass = `${styles.episodeRow}${active ? ` ${styles.currentEpisode}` : ''}`
  const body = (
    <>
      <span className={`${styles.episodeBadge}${active ? ` ${styles.episodeBadgeCurrent}` : ''}`}>{item.seasonNumber ? `S${item.seasonNumber}E${item.number}` : `E${item.number}`}</span>
      <ArtworkFrame
        alt={still ? `${title} still` : `${title} title artwork`}
        className={styles.episodeArt}
        ratio="wide"
        src={still ?? fallbackArt ?? undefined}
      />
      <span className={styles.episodeCopy}>
        <span className={styles.episodeName}>{title}</span>
        {active ? <span className={styles.episodeStatus}>Now playing</span> : null}
        {item.upcoming ? <span className={styles.episodeStatus}>Coming soon</span> : null}
      </span>
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
          aria-label={`Watch episode ${item.number}${item.current ? `, ${currentLabel.toLowerCase()}` : ''}: ${title}`}
          className={rowClass}
          href={item.href}
          scroll={false}
          title={title}
        >
          {body}
        </Link>
      )}
    </li>
  )
}
