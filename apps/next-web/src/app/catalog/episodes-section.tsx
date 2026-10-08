'use client'

import { watchHref, type CatalogSeason, type CatalogSeriesDetail } from '@consumit/contracts'
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react'
import { useState } from 'react'

import { Button, SeasonSelector, SectionHeading } from '@consumit/next-ui'

import { EpisodeCard } from '../shared/episode-card'

const EPISODES_PER_PAGE = 8

export type EpisodesSectionProps = {
  detail: CatalogSeriesDetail
  failedSeason: number | null
  loadingSeason: boolean
  onRetrySeason: () => void
  onSelectSeason: (seasonNumber: number) => void
  season: CatalogSeason | null
  seasons: CatalogSeriesDetail['seasons']
}

/**
 * FilScreen episodes world: season choice, a still-led episode grid, and
 * pagination. Both episodic title kinds share the Anime card presentation;
 * this section owns Series season identity and availability.
 */
export function EpisodesSection({
  detail,
  failedSeason,
  loadingSeason,
  onRetrySeason,
  onSelectSeason,
  season,
  seasons,
}: EpisodesSectionProps) {
  const [page, setPage] = useState(1)
  const episodes = season?.episodes ?? []
  const totalPages = Math.max(1, Math.ceil(episodes.length / EPISODES_PER_PAGE))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * EPISODES_PER_PAGE
  const visible = episodes.slice(start, start + EPISODES_PER_PAGE)

  return (
    <div data-filscreen-episodes>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <SectionHeading id="episodes-heading" title="Episodes" />
        {seasons.length ? (
          <SeasonSelector
            className="w-full sm:w-64"
            disabled={loadingSeason}
            onValueChange={(value) => onSelectSeason(Number(value))}
            options={seasons.map((item) => ({ label: `${item.name} · ${item.episodeCount} episodes`, value: String(item.number) }))}
            value={String(season?.seasonNumber ?? seasons[0]?.number ?? 1)}
          />
        ) : null}
      </div>
      {loadingSeason ? <p className="mt-5 text-xs text-[var(--fs-muted)]" role="status">Loading season…</p> : null}
      {failedSeason !== null ? (
        <div className="mt-6 flex flex-wrap items-center gap-4 rounded-xl border border-[var(--fs-line)] bg-[var(--fs-field)] p-5" role="alert">
          <p className="text-sm text-[var(--fs-ink)]">Season {failedSeason} could not be loaded. The current season is still here.</p>
          <Button onClick={onRetrySeason} size="sm" variant="secondary"><RotateCcw aria-hidden="true" /> Retry</Button>
        </div>
      ) : null}
      {episodes.length ? (
        <>
          <ul aria-label={`Season ${season?.seasonNumber ?? ''} episodes, page ${safePage} of ${totalPages}`} className="mt-8 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map((episode) => (
              <li className="min-w-0" key={episode.id}>
                <EpisodeCard airDate={episode.airDate} duration={episode.runtimeMinutes ? `${episode.runtimeMinutes} min` : null} episode={episode.episodeNumber} fallbackArt={detail.backdropUrl ?? detail.posterUrl} href={watchHref(detail, { episode: episode.episodeNumber, season: episode.seasonNumber })} stillUrl={episode.stillUrl} summary={episode.overview} title={episode.title} />
              </li>
            ))}
          </ul>
          {totalPages > 1 ? (
            <nav aria-label="Episode pages" className="mt-8 flex flex-wrap items-center gap-3">
              <p className="w-full text-xs tabular-nums text-[var(--fs-muted)] sm:w-auto sm:flex-1" role="status">
                Showing {start + 1}–{Math.min(start + EPISODES_PER_PAGE, episodes.length)} of {episodes.length} episodes
              </p>
              <div className="flex items-center gap-1.5">
                <button
                  aria-label="Go to previous episode page"
                  className="grid size-11 cursor-pointer place-items-center rounded-xl border border-[var(--fs-field-border)] bg-[var(--fs-field)] text-[var(--fs-muted)] outline-none transition-colors hover:text-[var(--fs-accent)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)] disabled:cursor-default disabled:opacity-40 disabled:hover:text-[var(--fs-muted)]"
                  disabled={safePage === 1}
                  onClick={() => setPage(safePage - 1)}
                  type="button"
                >
                  <ChevronLeft aria-hidden="true" className="size-4" />
                </button>
                {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
                  <button
                    aria-current={pageNumber === safePage ? 'page' : undefined}
                    aria-label={`Go to episode page ${pageNumber}`}
                    className={
                      pageNumber === safePage
                        ? 'grid h-11 min-w-11 cursor-pointer place-items-center rounded-xl bg-[var(--fs-accent-soft)] px-3 text-sm font-bold text-[var(--fs-ink)] shadow-[inset_0_0_0_1px_var(--fs-accent)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]'
                        : 'grid h-11 min-w-11 cursor-pointer place-items-center rounded-xl px-3 text-sm text-[var(--fs-secondary)] outline-none transition-colors hover:bg-[var(--fs-hover)] hover:text-[var(--fs-ink)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]'
                    }
                    key={pageNumber}
                    onClick={() => setPage(pageNumber)}
                    type="button"
                  >
                    <span className="tabular-nums">{pageNumber}</span>
                  </button>
                ))}
                <button
                  aria-label="Go to next episode page"
                  className="grid size-11 cursor-pointer place-items-center rounded-xl border border-[var(--fs-field-border)] bg-[var(--fs-field)] text-[var(--fs-muted)] outline-none transition-colors hover:text-[var(--fs-accent)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)] disabled:cursor-default disabled:opacity-40 disabled:hover:text-[var(--fs-muted)]"
                  disabled={safePage === totalPages}
                  onClick={() => setPage(safePage + 1)}
                  type="button"
                >
                  <ChevronRight aria-hidden="true" className="size-4" />
                </button>
              </div>
            </nav>
          ) : null}
        </>
      ) : (!failedSeason ? <p className="mt-8 text-sm text-[var(--fs-muted)]">No regular episodes are listed for this season.</p> : null)}
    </div>
  )
}
