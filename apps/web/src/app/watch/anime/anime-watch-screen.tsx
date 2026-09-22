'use client'

import type { AnimeTitleDetail } from '@consumit/contracts'
import { ArtworkFrame, SegmentedControl } from '@consumit/ui'
import { ArrowLeft, Bell, ChevronLeft, ChevronRight, Play, Search } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState } from 'react'

import { WatchPlayback } from '../watch-playback'
import type { WatchEpisode, WatchTitle } from '../watch-screen'

const EPISODES_PER_PAGE = 24
const FILTER_MATCH_LIMIT = 100

function toWatchTitle(detail: AnimeTitleDetail): WatchTitle {
  return {
    kind: 'anime',
    id: detail.anilistId,
    title: detail.titles.preferred,
    year: detail.seasonYear,
    overview: detail.description || null,
    posterUrl: detail.coverImage.url || null,
    backdropUrl: detail.bannerImage,
    logoUrl: null,
    runtimeMinutes: null,
    episodeRuntimeMinutes: detail.episodeDuration,
  }
}

function toWatchEpisode(detail: AnimeTitleDetail, episode: number): WatchEpisode {
  return {
    title: `Episode ${episode}`,
    episodeNumber: episode,
    overview: null,
    runtimeMinutes: detail.episodeDuration,
    stillUrl: null,
  }
}

function formatDuration(minutes: number | null): string | null {
  if (minutes === null) return null
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function formatAirDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })
}

function formatCountdown(airingAt: string): string {
  const ms = Date.parse(airingAt) - Date.now()
  if (!Number.isFinite(ms) || ms <= 0) return 'Airing now'
  const days = Math.floor(ms / 86_400_000)
  const hours = Math.floor((ms % 86_400_000) / 3_600_000)
  const minutes = Math.floor((ms % 3_600_000) / 60_000)
  if (days > 0) return `in ${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `in ${hours}h ${minutes}m`
  return `in ${minutes}m`
}

/** AniList streaming episodes are a flat, sometimes partial list titled
 *  like "Episode 12 - ...". Index them by leading episode number so the
 *  rail can show honest thumbnails/titles where they exist. */
function indexStreamingEpisodes(detail: AnimeTitleDetail): Map<number, { title: string; thumbnail: string | null }> {
  const indexed = new Map<number, { title: string; thumbnail: string | null }>()
  for (const entry of detail.streamingEpisodes) {
    const match = /^episode\s+(\d+)/i.exec(entry.title.trim())
    if (!match) continue
    const number = Number(match[1])
    if (!Number.isInteger(number) || number <= 0 || indexed.has(number)) continue
    indexed.set(number, { title: entry.title, thumbnail: entry.thumbnail })
  }
  return indexed
}

export function AnimeWatchScreen({ audio, detail, episode, nextHref, prevHref, pinnedProvider }: {
  audio: 'sub' | 'dub'
  detail: AnimeTitleDetail
  episode: number
  nextHref: string | undefined
  prevHref?: string | undefined
  pinnedProvider?: string | undefined
}) {
  const router = useRouter()
  const audioHref = (nextAudio: 'sub' | 'dub') => `/watch/anime/${detail.anilistId}?episode=${episode}&audio=${nextAudio}`
  const episodeHref = (number: number) => `/watch/anime/${detail.anilistId}?episode=${number}&audio=${audio}`
  const airedBefore = detail.nextAiringEpisode ? detail.nextAiringEpisode.episode - 1 : null
  const knownTotal = detail.episodes ?? (airedBefore !== null && airedBefore > 0 ? airedBefore : 0)
  const total = Math.min(10_000, Math.max(knownTotal, episode))
  const upcomingFrom = detail.nextAiringEpisode?.episode ?? null
  const isUpcoming = (number: number) => upcomingFrom !== null && number >= upcomingFrom
  const streaming = useMemo(() => indexStreamingEpisodes(detail), [detail])
  const duration = formatDuration(detail.episodeDuration)
  const altTitle = detail.titles.english && detail.titles.english !== detail.titles.preferred ? detail.titles.english : detail.titles.romaji

  const episodes = useMemo(() => Array.from({ length: total }, (_, index) => index + 1), [total])
  const totalPages = Math.max(1, Math.ceil(episodes.length / EPISODES_PER_PAGE))
  const initialPage = Math.min(totalPages, Math.floor((episode - 1) / EPISODES_PER_PAGE) + 1)
  const [page, setPage] = useState(initialPage)
  const [filter, setFilter] = useState('')
  const safePage = Math.min(page, totalPages)
  const query = filter.trim().toLowerCase()
  const visible = useMemo(() => {
    if (!query) return episodes.slice((safePage - 1) * EPISODES_PER_PAGE, safePage * EPISODES_PER_PAGE)
    return episodes.filter((number) => {
      if (String(number) === query || `ep ${query}` === `ep ${number}` || `episode ${number}`.includes(query)) return true
      return streaming.get(number)?.title.toLowerCase().includes(query) ?? false
    }).slice(0, FILTER_MATCH_LIMIT)
  }, [episodes, query, safePage, streaming])

  const prevNumber = episode - 1
  const prevAired = prevNumber >= 1 && !isUpcoming(prevNumber)
  const nextNumber = episode + 1
  // nextHref from the route already respects the known total; fall back to
  // the computed number so Prev/Next stay consistent when it is absent.
  const nextAiredHref = nextHref ?? (nextNumber <= total && !isUpcoming(nextNumber) ? episodeHref(nextNumber) : undefined)

  return (
    <div className="min-h-screen bg-[var(--fs-page)]" data-consumit-anime-watch>
      <header className="mx-auto flex w-full max-w-[100rem] flex-wrap items-center gap-3 px-3 py-4 sm:px-6 lg:px-8">
        <Link
          className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm text-[var(--fs-muted)] outline-none transition-colors hover:text-[var(--fs-ink)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]"
          href={`/anime/${detail.anilistId}`}
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          <span className="max-w-[60vw] truncate">Back to {detail.titles.preferred}</span>
        </Link>
        <div className="ml-auto">
          <SegmentedControl
            legend="Audio language"
            name="anime-audio"
            onValueChange={(value) => router.push(audioHref(value === 'dub' ? 'dub' : 'sub'))}
            options={[{ label: 'SUB', value: 'sub' }, { label: 'DUB', value: 'dub' }]}
            value={audio}
          />
        </div>
      </header>

      <div className="mx-auto w-full max-w-[100rem] px-3 pb-10 sm:px-6 lg:px-8">
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col gap-6">
            <WatchPlayback
              audioLanguage={audio === 'dub' ? 'en' : 'ja'}
              episode={toWatchEpisode(detail, episode)}
              key={`${detail.anilistId}:${episode}:${audio}`}
              layout="embedded"
              nextHref={nextHref}
              prevHref={prevHref}
              title={toWatchTitle(detail)}
              {...(pinnedProvider ? { pinnedProvider } : {})}
            />

            <section aria-labelledby="anime-watch-title-heading" className="rounded-[16px] border border-[var(--fs-field-border)] bg-[var(--fs-field)] p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 id="anime-watch-title-heading" className="font-display text-2xl leading-tight font-normal tracking-[-0.02em] text-[var(--fs-ink)] sm:text-3xl">
                    <span className="text-[var(--fs-accent)]">{episode}.</span> {detail.titles.preferred}
                  </h1>
                  <p className="mt-1.5 text-xs tracking-wide text-[var(--fs-muted)] uppercase">
                    {[altTitle, total ? `${total} EPS` : null, duration, detail.seasonYear].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <nav aria-label="Previous and next episode" className="flex shrink-0 items-center gap-2">
                  {prevAired ? (
                    <Link
                      aria-label={`Watch previous episode, episode ${prevNumber}`}
                      className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-[var(--fs-field-border)] bg-[var(--fs-rail)] px-4 text-sm font-bold text-[var(--fs-ink)] outline-none transition-colors hover:border-[var(--fs-focus)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]"
                      href={episodeHref(prevNumber)}
                    >
                      <ChevronLeft aria-hidden="true" className="size-4" />
                      Prev
                    </Link>
                  ) : (
                    <span aria-disabled="true" className="inline-flex min-h-11 cursor-not-allowed items-center gap-1 rounded-xl border border-[var(--fs-field-border)] px-4 text-sm font-bold text-[var(--fs-muted)] opacity-60">
                      <ChevronLeft aria-hidden="true" className="size-4" />
                      Prev
                    </span>
                  )}
                  {nextAiredHref ? (
                    <Link
                      aria-label={`Watch next episode, episode ${nextNumber}`}
                      className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-[var(--fs-field-border)] bg-[var(--fs-rail)] px-4 text-sm font-bold text-[var(--fs-ink)] outline-none transition-colors hover:border-[var(--fs-focus)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]"
                      href={nextAiredHref}
                    >
                      Next
                      <ChevronRight aria-hidden="true" className="size-4" />
                    </Link>
                  ) : (
                    <span aria-disabled="true" className="inline-flex min-h-11 cursor-not-allowed items-center gap-1 rounded-xl border border-[var(--fs-field-border)] px-4 text-sm font-bold text-[var(--fs-muted)] opacity-60">
                      Next
                      <ChevronRight aria-hidden="true" className="size-4" />
                    </span>
                  )}
                </nav>
              </div>
              {detail.description ? (
                <p className="mt-4 max-w-[70ch] text-sm leading-7 text-[var(--fs-secondary)] line-clamp-3">
                  {detail.description}
                </p>
              ) : null}
            </section>
          </div>

          <section aria-labelledby="anime-watch-episodes-heading" className="flex min-w-0 flex-col rounded-[16px] border border-[var(--fs-field-border)] bg-[var(--fs-field)] p-4">
            <div className="flex items-baseline justify-between gap-2 px-1">
              <h2 id="anime-watch-episodes-heading" className="text-[11px] font-bold tracking-[0.12em] text-[var(--fs-muted)] uppercase">
                Episodes
              </h2>
              <p className="text-xs tabular-nums text-[var(--fs-muted)]" role="status">
                {query ? `${visible.length} match${visible.length === 1 ? '' : 'es'}` : `Episode ${episode} of ${total}`}
              </p>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <div className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-[var(--fs-field-border)] bg-[var(--fs-rail)] px-3 outline-none transition-colors focus-within:border-[var(--fs-focus)]">
                <Search aria-hidden="true" className="size-4 shrink-0 text-[var(--fs-muted)]" />
                <label className="sr-only" htmlFor="anime-episode-filter">Filter episodes</label>
                <input
                  autoComplete="off"
                  className="h-11 min-w-0 flex-1 bg-transparent text-sm text-[var(--fs-ink)] outline-none placeholder:text-[var(--fs-muted)]"
                  id="anime-episode-filter"
                  onChange={(event) => { setFilter(event.currentTarget.value); setPage(1) }}
                  placeholder="Filter episodes..."
                  type="search"
                  value={filter}
                />
              </div>
            </div>
            {visible.length ? (
              <ul aria-label="Episode picker" className="mt-3 flex max-h-[50vh] flex-col gap-2 overflow-y-auto pr-0.5 lg:max-h-[44rem]">
                {visible.map((number) => {
                  const upcoming = isUpcoming(number)
                  const current = number === episode
                  const meta = streaming.get(number)
                  const rowTitle = meta?.title ?? `Episode ${number}`
                  const rowClass = current
                    ? 'grid min-h-[4.5rem] grid-cols-[112px_minmax(0,1fr)] gap-3 rounded-xl bg-[var(--fs-accent-soft)] p-2 text-left shadow-[inset_0_0_0_1px_var(--fs-accent)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]'
                    : 'grid min-h-[4.5rem] grid-cols-[112px_minmax(0,1fr)] gap-3 rounded-xl border border-transparent p-2 text-left outline-none transition-colors hover:border-[var(--fs-field-border)] hover:bg-[var(--fs-hover)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]'
                  const body = (
                    <>
                      <span className="relative block min-w-0 overflow-hidden rounded-lg">
                        <ArtworkFrame
                          alt=""
                          className="rounded-lg border-0"
                          ratio="landscape"
                          src={meta?.thumbnail ?? undefined}
                        />
                        <span className="absolute top-1 left-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white uppercase">
                          EP {number}
                        </span>
                        {current ? (
                          <span className="absolute inset-0 grid place-items-center" aria-hidden="true">
                            <span className="grid size-8 place-items-center rounded-full bg-[var(--fs-accent)] text-[var(--fs-on-accent)]">
                              <Play aria-hidden="true" className="size-4 fill-current" />
                            </span>
                          </span>
                        ) : null}
                      </span>
                      <span className="flex min-w-0 flex-col justify-center gap-1 py-0.5">
                        <span className="line-clamp-2 text-sm leading-5 font-bold text-[var(--fs-ink)]">{rowTitle}</span>
                        <span className="text-xs tabular-nums text-[var(--fs-muted)]">
                          {[duration, current ? 'Now playing' : upcoming ? 'Not aired yet' : null].filter(Boolean).join(' · ')}
                        </span>
                      </span>
                    </>
                  )
                  return (
                    <li key={number} className="min-w-0">
                      {upcoming ? (
                        <span aria-disabled="true" title="Not aired yet" className={`${rowClass} cursor-not-allowed opacity-70`}>
                          {body}
                        </span>
                      ) : (
                        <Link
                          aria-current={current ? 'page' : undefined}
                          aria-label={`Watch episode ${number}${current ? ', now playing' : ''}`}
                          className={rowClass}
                          href={episodeHref(number)}
                        >
                          {body}
                        </Link>
                      )}
                    </li>
                  )
                })}
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
            {detail.nextAiringEpisode ? (
              <p className="mt-3 flex items-center gap-2 rounded-xl bg-[var(--fs-rail)] px-3 py-2.5 text-xs tabular-nums text-[var(--fs-secondary)]" role="status">
                <Bell aria-hidden="true" className="size-4 shrink-0 text-[var(--fs-accent)]" />
                <span className="min-w-0 truncate">
                  Episode {detail.nextAiringEpisode.episode} {formatCountdown(detail.nextAiringEpisode.airingAt)} · {formatAirDate(detail.nextAiringEpisode.airingAt)}
                </span>
              </p>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  )
}
