'use client'

import { watchHref, type CatalogSeason, type CatalogSeriesDetail } from '@consumit/contracts'
import { ChevronLeft, ChevronRight, Play, RotateCcw } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

import { ArtworkFrame, Button, SeasonSelector, SectionHeading } from '@consumit/ui'

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

function EpisodeCard({ detail, episode }: {
  detail: CatalogSeriesDetail
  episode: CatalogSeason['episodes'][number]
}) {
  const href = watchHref(detail, { episode: episode.episodeNumber, season: episode.seasonNumber })
  const meta = [episode.runtimeMinutes ? `${episode.runtimeMinutes} min` : null, episode.airDate].filter(Boolean).join(' · ')
  return (
    <article className="group flex min-w-0 flex-col overflow-hidden rounded-[16px] border border-[var(--fs-field-border)] bg-[var(--fs-field)] transition-all duration-200 ease-out hover:-translate-y-1 hover:border-[var(--fs-accent)]/50 hover:shadow-[0_12px_32px_rgba(0,0,0,0.35)] motion-reduce:transition-none motion-reduce:transform-none" data-filscreen-episode-card>
      <Link
        aria-label={`Watch Episode ${episode.episodeNumber}: ${episode.title}`}
        className="relative block outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--fs-focus)]"
        href={href}
      >
        <ArtworkFrame
          alt={`${episode.title} episode still`}
          className="rounded-none border-0"
          ratio="landscape"
          src={episode.stillUrl ?? undefined}
        >
          <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent opacity-80 transition-opacity duration-200 group-hover:opacity-100 motion-reduce:transition-none" />
          <span aria-hidden="true" className="absolute inset-0 grid place-items-center opacity-0 transition-all duration-200 ease-out group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none [@media(hover:none)]:opacity-100">
            <span className="grid size-12 place-items-center rounded-full bg-[var(--fs-accent)] text-[var(--fs-on-accent)] shadow-lg transition-transform duration-200 group-hover:scale-110 motion-reduce:transition-none motion-reduce:transform-none">
              <Play aria-hidden="true" className="size-5 fill-current" />
            </span>
          </span>
        </ArtworkFrame>
      </Link>
      <div className="flex min-w-0 flex-1 flex-col gap-1 p-4">
        <p className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-[var(--fs-accent)]">Episode {episode.episodeNumber}</p>
        <h3 className="font-display text-lg leading-snug text-[var(--fs-ink)]">{episode.title}</h3>
        {meta ? <p className="text-xs tabular-nums text-[var(--fs-muted)]">{meta}</p> : null}
        {episode.overview ? <p className="mt-1 text-xs leading-5 text-[var(--fs-secondary)] line-clamp-2">{episode.overview}</p> : null}
        <div className="mt-3">
          <Link
            className="inline-flex min-h-9 items-center gap-1.5 rounded-xl bg-[var(--fs-accent-soft)] px-4 text-xs font-bold text-[var(--fs-ink)] outline-none transition-colors hover:bg-[var(--fs-accent-soft-hover)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]"
            href={href}
          >
            <Play aria-hidden="true" className="size-3 fill-current" />
            Watch
          </Link>
        </div>
      </div>
    </article>
  )
}

/**
 * FilScreen episodes world: season choice, a still-led episode grid, and
 * pagination. State first (eyebrow), then title and evidence, then a
 * distinct Watch action — the established episode contract, dressed in the
 * FilScreen card language.
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
                <EpisodeCard detail={detail} episode={episode} />
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
