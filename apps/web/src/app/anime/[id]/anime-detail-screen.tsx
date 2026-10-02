'use client'

import type { AnimeTitleDetail, AnimeFranchise, AnimeAiringSchedule, AnimeEpisode } from '@consumit/contracts'
import { watchHref } from '@consumit/contracts'
import { ArtworkFrame, CastCard, SectionHeading, Tabs } from '@consumit/ui'
import { CalendarClock, ChevronLeft, ChevronRight, Play, Star } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'

import { browserAnimeEpisodes } from '@/lib/anime-browser'

import { TitleCard } from '../../shared/title-card'

import { MemberActionPanel } from '../../catalog/member-action-panel'
import { TitleReviews } from '../../catalog/title-reviews'

import { FilScreenShell, AnimeTitleRail } from '@/app/shared'

const ANIME_EPISODES_PER_PAGE = 8

function formatScore(score: number | null): string | null {
  if (score === null) return null
  return (score / 10).toFixed(1)
}

function formatDuration(minutes: number | null): string | null {
  if (minutes === null) return null
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function formatStatus(status: string): string {
  return status.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatSeason(season: string | null, year: number | null): string | null {
  if (!season || !year) return null
  return `${season.charAt(0) + season.slice(1).toLowerCase()} ${year}`
}

function formatAirDate(iso: string): string {
  // Explicit locale + timezone: bare toLocaleDateString renders the server
  // locale during SSR and the browser locale on hydration, which splits the
  // tree. This stays identical on both sides.
  return new Date(iso).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'numeric', day: 'numeric', year: 'numeric' })
}

/** Hero title: TMDB logo art when the title matched confidently, serif
 *  display type otherwise. Exported for tests. */
export function AnimeHeroTitle({ logoUrl, title }: { logoUrl: string | null; title: string }) {
  if (logoUrl) {
    return (
      <div>
        <Image
          alt={title}
          className="h-auto max-h-24 w-auto max-w-full [filter:drop-shadow(0_2px_16px_rgb(0_0_0/0.65))] sm:max-h-28"
          height={240}
          priority
          src={logoUrl}
          width={640}
        />
        <h1 className="sr-only">{title}</h1>
      </div>
    )
  }
  return (
    <h1 className="font-display text-[clamp(2.5rem,5vw,4.5rem)] leading-[0.95] font-normal tracking-[-0.025em] text-white">
      {title}
    </h1>
  )
}

function AnimeHero({ detail }: { detail: AnimeTitleDetail }) {
  const score = formatScore(detail.averageScore)
  const seasonLabel = formatSeason(detail.season, detail.seasonYear)
  const episodeCount = detail.episodes ? `${detail.episodes} ep` : null
  const duration = formatDuration(detail.episodeDuration)

  return (
    <header
      className="relative isolate overflow-hidden rounded-card border border-[var(--fs-line)] bg-[#09090b] text-white"
      data-consumit-anime-masthead
    >
      {detail.bannerImage ? (
        <Image
          alt=""
          className="object-cover"
          fill
          priority
          sizes="(max-width: 1280px) 100vw, 1400px"
          src={detail.bannerImage}
        />
      ) : detail.coverImage.url ? (
        <Image
          alt=""
          className="object-cover"
          fill
          priority
          sizes="(max-width: 1280px) 100vw, 1400px"
          src={detail.coverImage.url}
        />
      ) : (
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{ background: `radial-gradient(120% 90% at 78% 8%, ${detail.coverImage.color ?? '#6b3c32'} 0%, #3a211d 40%, #09090b 100%)` }}
        />
      )}
      <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(90deg,rgba(10,18,32,0.94)_0%,rgba(10,18,32,0.72)_50%,rgba(10,18,32,0.18)_100%)]" />
      <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(0deg,rgba(10,18,32,0.98)_0%,rgba(10,18,32,0.4)_40%,transparent_100%)]" />

      <div className="relative flex min-h-[480px] flex-col justify-center gap-8 p-6 sm:p-10 lg:grid lg:min-h-[520px] lg:grid-cols-[minmax(0,1fr)_340px] lg:items-center lg:p-12">
        <div className="flex max-w-2xl flex-col justify-center gap-3">
          <AnimeHeroTitle logoUrl={detail.logoUrl} title={detail.titles.preferred} />

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            {score ? (
              <strong className="inline-flex items-center gap-1 font-bold text-orange tabular-nums">
                <Star aria-hidden="true" className="size-3.5 fill-current" />
                ★ {score}
                <span className="sr-only">on AniList</span>
              </strong>
            ) : null}
            {detail.seasonYear ? <span className="font-bold text-white tabular-nums">{detail.seasonYear}</span> : null}
            {seasonLabel ? <span className="text-white/70">{seasonLabel}</span> : null}
            {episodeCount ? <span className="text-white/70">{episodeCount}</span> : null}
            {duration ? <span className="text-white/70">{duration}</span> : null}
            {detail.genres.length ? <span className="text-white/70">{detail.genres.slice(0, 3).join(' · ')}</span> : null}
            <span className="rounded border border-white/30 bg-black/40 px-1.5 py-0.5 text-[11px] font-bold text-white">
              {detail.format.replace(/_/g, ' ')}
            </span>
          </div>

          {detail.description ? (
            <p className="max-w-[62ch] text-sm leading-6 text-white/85 line-clamp-3">
              {detail.description}
            </p>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Link
              className="inline-flex min-h-11 items-center gap-2 rounded-control bg-orange px-6 text-sm font-bold text-canvas transition-[filter,transform] hover:brightness-110 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none"
              href={watchHref({ kind: 'anime', id: detail.anilistId }, { episode: 1, season: 1 })}
            >
              <Play aria-hidden="true" className="size-4 fill-current" />
              Play
            </Link>
          </div>
        </div>

        {/* Next-airing box above the Member Action Shelf, same shelf the
            movie and series heroes carry. */}
        <div className="flex w-full max-w-2xl flex-col gap-4 lg:max-w-none">
          {detail.nextAiringEpisode ? (
            <div className="rounded-xl border border-[var(--fs-accent)]/30 bg-[var(--fs-accent)]/5 px-4 py-3">
              <p className="text-xs font-bold text-[var(--fs-accent)]">
                Next Episode: #{detail.nextAiringEpisode.episode}
              </p>
              <p className="mt-0.5 text-xs text-white/70">
                Airing {formatAirDate(detail.nextAiringEpisode.airingAt)}
              </p>
            </div>
          ) : null}
          <MemberActionPanel
            id={detail.anilistId}
            kind="anime"
            posterUrl={detail.coverImage.url ?? undefined}
            title={detail.titles.preferred}
            year={detail.seasonYear}
          />
        </div>
      </div>
    </header>
  )
}

function AnimeEpisodeCard({ anilistId, airDate, duration, episode, fallbackArt, stillUrl, summary, title, upcoming }: {
  anilistId: number
  airDate?: string | null | undefined
  duration: string | null
  episode: number
  fallbackArt?: string | null | undefined
  stillUrl?: string | null | undefined
  summary?: string | null | undefined
  title?: string | null | undefined
  upcoming: boolean
}) {
  return (
    <article className="group flex min-w-0 flex-col overflow-hidden rounded-card border border-[var(--fs-field-border)] bg-[var(--fs-field)] transition-colors hover:border-[var(--fs-accent)]/60 motion-reduce:transition-none" data-filscreen-episode-card>
      <ArtworkFrame
        alt={stillUrl ? title ? `${title} still` : `Episode ${episode} still` : `Episode ${episode} title artwork`}
        className="rounded-none border-0"
        ratio="landscape"
        src={stillUrl ?? fallbackArt ?? undefined}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1 p-4">
        <p className="flex flex-wrap items-center gap-2 text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-[var(--fs-accent)]">
          Episode {episode}
          {upcoming ? (
            <span className="rounded border border-white/30 bg-black/40 px-1.5 py-0.5 text-[10px] font-bold normal-case tracking-normal text-white">
              Upcoming
            </span>
          ) : null}
        </p>
        {title ? <p className="truncate text-sm font-bold text-[var(--fs-ink)]" title={title}>{title}</p> : null}
        {!stillUrl && fallbackArt ? <p className="text-[10px] text-[var(--fs-muted)]">Title artwork</p> : null}
        {duration || airDate ? <p className="text-xs tabular-nums text-[var(--fs-muted)]">{[duration, airDate ? new Date(`${airDate}T00:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }) : null].filter(Boolean).join(' · ')}</p> : null}
        {summary ? <p className="line-clamp-2 text-xs leading-5 text-[var(--fs-muted)]">{summary}</p> : null}
        <div className="mt-3">
          {upcoming ? (
            <span className="inline-flex min-h-9 cursor-not-allowed items-center gap-1.5 rounded-control border border-[var(--fs-line)] px-4 text-xs font-bold text-[var(--fs-muted)]">
              <Play aria-hidden="true" className="size-3 fill-current" />
              Upcoming
            </span>
          ) : (
            <Link
              className="inline-flex min-h-9 items-center gap-1.5 rounded-control bg-orange px-4 text-xs font-bold text-canvas outline-none transition-[filter,transform] hover:brightness-110 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none"
              href={watchHref({ kind: 'anime', id: anilistId }, { episode, season: 1 })}
            >
              <Play aria-hidden="true" className="size-3 fill-current" />
              Play episode
            </Link>
          )}
        </div>
      </div>
    </article>
  )
}

/** AniList streaming episodes keyed by canonical number, same rule as the
 *  watch rail: titles arrive as "Episode N - Name" with artwork where the
 *  licensor supplied it. Exported for tests. */
export function indexStreamingMeta(detail: AnimeTitleDetail): Map<number, { title: string; thumbnail: string | null }> {
  const indexed = new Map<number, { title: string; thumbnail: string | null }>()
  for (const entry of detail.streamingEpisodes ?? []) {
    const match = /^episode\s+(\d+)/i.exec(entry.title.trim())
    if (!match) continue
    const number = Number(match[1])
    if (!Number.isInteger(number) || number <= 0 || indexed.has(number)) continue
    indexed.set(number, { title: entry.title, thumbnail: entry.thumbnail })
  }
  return indexed
}

/** Episode details come from the current page's bounded batch. Streaming
 *  art can fill a missing still; title art is labeled when neither has one. */
function AnimeEpisodeWithArt({ anilistId, art, duration, episode, fallbackArt, stream, upcoming }: {
  anilistId: number
  art?: AnimeEpisode | null | undefined
  duration: string | null
  episode: number
  fallbackArt?: string | null | undefined
  stream: { title: string; thumbnail: string | null } | undefined
  upcoming: boolean
}) {
  const name = stream?.title?.replace(/^episode\s+\d+\s*[-–:]\s*/i, '').trim()
    || art?.title || null
  return (
    <AnimeEpisodeCard
      anilistId={anilistId}
      airDate={art?.airDate}
      duration={art?.duration ? formatDuration(art.duration) : duration}
      episode={episode}
      fallbackArt={fallbackArt}
      stillUrl={stream?.thumbnail ?? art?.thumbnail ?? null}
      summary={art?.description}
      title={name}
      upcoming={upcoming}
    />
  )
}

function AnimeEpisodesSection({ detail }: { detail: AnimeTitleDetail }) {
  const [page, setPage] = useState(1)
  const [episodeArt, setEpisodeArt] = useState<{ id: number; results: Record<number, AnimeEpisode | null> }>({ id: detail.anilistId, results: {} })
  const streaming = useMemo(() => indexStreamingMeta(detail), [detail])
  // AniList omits the count for some long-runners; the airing position still
  // tells us how many episodes have aired. Streaming entries carry titles
  // and stills where the licensor supplied them; unmapped episodes keep
  // the honest number-only card.
  const airedBefore = detail.nextAiringEpisode ? detail.nextAiringEpisode.episode - 1 : null
  const total = detail.episodes ?? (airedBefore !== null && airedBefore > 0 ? airedBefore : 0)
  const upcomingFrom = detail.nextAiringEpisode?.episode ?? null
  const episodes = total > 0 ? Array.from({ length: total }, (_, index) => index + 1) : []
  const duration = formatDuration(detail.episodeDuration)
  const totalPages = Math.max(1, Math.ceil(episodes.length / ANIME_EPISODES_PER_PAGE))
  const safePage = Math.min(page, totalPages)
  const start = (safePage - 1) * ANIME_EPISODES_PER_PAGE
  const visible = episodes.slice(start, start + ANIME_EPISODES_PER_PAGE)
  const cachedArt = episodeArt.id === detail.anilistId ? episodeArt.results : {}
  const missing = visible.filter((number) => (upcomingFrom === null || number < upcomingFrom) && cachedArt[number] === undefined).join(',')
  useEffect(() => {
    if (!missing) return
    let active = true
    const numbers = missing.split(',').map(Number)
    void browserAnimeEpisodes(detail.anilistId, numbers).then((found) => {
      if (active) setEpisodeArt((previous) => ({ id: detail.anilistId, results: { ...(previous.id === detail.anilistId ? previous.results : {}), ...Object.fromEntries(numbers.map((number, index) => [number, found[index] ?? null])) } }))
    }).catch(() => { if (active) setEpisodeArt((previous) => ({ id: detail.anilistId, results: { ...(previous.id === detail.anilistId ? previous.results : {}), ...Object.fromEntries(numbers.map((number) => [number, null])) } })) })
    return () => { active = false }
  }, [detail.anilistId, missing])

  return (
    <div data-filscreen-episodes>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <SectionHeading id="episodes-heading" title="Episodes" />
        {episodes.length ? (
          <p className="text-xs tabular-nums text-[var(--fs-muted)]">
            {episodes.length} {episodes.length === 1 ? 'episode' : 'episodes'}
          </p>
        ) : null}
      </div>
      <p className="mt-3 text-xs leading-5 text-[var(--fs-muted)]">
        Episode numbers and airing state come from AniList. Unaired episodes unlock as they broadcast.
      </p>
      {episodes.length ? (
        <>
          <ul aria-label={`Episodes, page ${safePage} of ${totalPages}`} className="mt-8 grid list-none gap-4 p-0 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map((episode) => {
              // Streaming titles arrive as "Episode 130 - Scent of Danger";
              // the eyebrow already carries the number, so cards show the
              // name part only. Episodes without a mapped entry fall back
              // to Kitsu art, then the honest number-only card.
              return (
                <li className="min-w-0" key={episode}>
                  <AnimeEpisodeWithArt
                    anilistId={detail.anilistId}
                    art={cachedArt[episode]}
                    duration={duration}
                    episode={episode}
                    fallbackArt={detail.bannerImage ?? detail.coverImage.url}
                    stream={streaming.get(episode)}
                    upcoming={upcomingFrom !== null && episode >= upcomingFrom}
                  />
                </li>
              )
            })}
          </ul>
          {totalPages > 1 ? (
            <nav aria-label="Episode pages" className="mt-8 flex flex-wrap items-center gap-3">
              <p className="w-full text-xs tabular-nums text-[var(--fs-muted)] sm:w-auto sm:flex-1" role="status">
                Showing {start + 1}–{Math.min(start + ANIME_EPISODES_PER_PAGE, episodes.length)} of {episodes.length} episodes
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
                {totalPages <= 10 ? (
                  Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
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
                  ))
                ) : (
                  <p aria-current="page" className="px-2 text-sm tabular-nums text-[var(--fs-secondary)]">
                    Page {safePage} of {totalPages}
                  </p>
                )}
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
      ) : (
        <p className="mt-8 text-sm text-[var(--fs-muted)]">No episode list is available for this anime yet.</p>
      )}
    </div>
  )
}

function AnimeCastRail({ characters }: { characters: AnimeTitleDetail['characters'] }) {
  if (!characters.length) return null
  return (
    <div className="mt-8 grid auto-cols-[minmax(9.5rem,42vw)] grid-flow-col gap-4 overflow-x-auto pb-4 sm:auto-cols-[11rem] xl:grid-flow-row xl:grid-cols-6 xl:overflow-visible xl:pb-0">
      {characters.slice(0, 6).map((char) => (
        <CastCard
          character={char.name}
          className="transition-transform duration-200 hover:-translate-y-1 motion-reduce:transition-none motion-reduce:transform-none"
          imageSrc={char.image ?? undefined}
          key={char.id}
          name={char.name}
          role={char.voiceActors[0]?.name ? `VA: ${char.voiceActors[0].name}` : undefined}
        />
      ))}
    </div>
  )
}

function formatCountdown(totalSeconds: number): string {
  if (totalSeconds <= 0) return 'Airing now'
  const days = Math.floor(totalSeconds / 86_400)
  const hours = Math.floor((totalSeconds % 86_400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  if (days > 0) return `in ${days}d ${hours}h`
  if (hours > 0) return `in ${hours}h ${minutes}m`
  return `in ${minutes}m`
}

function AnimeAiringSection({ airing }: { airing: AnimeAiringSchedule }) {
  if (!airing.episodes.length) return <p className="mt-8 text-sm text-[var(--fs-muted)]">No upcoming episodes are scheduled right now.</p>
  return (
    <ul className="mt-8 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
      {airing.episodes.slice(0, 12).map((entry) => (
        <li
          className="flex items-center gap-4 rounded-[16px] border border-[var(--fs-field-border)] bg-[var(--fs-field)] p-4"
          key={`${entry.mediaTitle}:${entry.episode}`}
        >
          <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--fs-accent-soft)] text-[var(--fs-accent)]">
            <CalendarClock className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-[var(--fs-ink)]">Episode {entry.episode}</p>
            <p className="mt-0.5 text-xs tabular-nums text-[var(--fs-muted)]">
              {formatCountdown(entry.timeUntilAiring)} · {formatAirDate(entry.airingAt)}
            </p>
          </div>
        </li>
      ))}
    </ul>
  )
}

function AnimeDetailFacts({ detail }: { detail: AnimeTitleDetail }) {
  const facts = [
    ['Format', detail.format.replace(/_/g, ' ')],
    ['Episodes', detail.episodes ? String(detail.episodes) : 'Ongoing'],
    ['Duration', formatDuration(detail.episodeDuration) ?? 'Not listed'],
    ['Status', formatStatus(detail.status)],
    ['Season', formatSeason(detail.season, detail.seasonYear) ?? 'Not listed'],
    ['Source', detail.source ?? 'Not listed'],
    ['Origin', detail.countryOfOrigin ?? 'Not listed'],
  ]
  return (
    <dl className="mt-9 grid gap-x-8 gap-y-6 border-t border-[var(--fs-line)] pt-7 text-xs sm:grid-cols-2 xl:grid-cols-3">
      {facts.map(([term, value]) => (
        <div className="grid grid-cols-[7rem_1fr] gap-3" key={term}>
          <dt className="text-[var(--fs-muted)]">{term}</dt>
          <dd className="font-bold text-[var(--fs-ink)]">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function AnimeDetailScreen({ airing, detail, relations }: {
  airing: AnimeAiringSchedule | null
  detail: AnimeTitleDetail
  relations: AnimeFranchise | null
}) {
  const related = useMemo(() => {
    const seen = new Set([detail.anilistId])
    const priority = (type: string) => type === 'PREQUEL' ? 0 : type === 'SEQUEL' ? 1 : 2
    return (relations?.relations ?? []).filter(relation => {
      if (seen.has(relation.anime.anilistId)) return false
      seen.add(relation.anime.anilistId)
      return true
    }).sort((a, b) => priority(a.type) - priority(b.type))
  }, [detail.anilistId, relations])
  const recommendations = useMemo(() => {
    const seen = new Set<number>()
    return detail.recommendations.filter((item) => {
      if (item.anilistId === detail.anilistId || seen.has(item.anilistId)) return false
      seen.add(item.anilistId)
      return true
    })
  }, [detail])
  const tabs = [
    { href: '#episodes', label: 'Episodes', value: 'episodes' },
    { href: '#overview', label: 'Overview', value: 'overview' },
    { href: '#reviews', label: 'Reviews', value: 'reviews' },
    { href: '#cast', label: 'Characters', value: 'cast' },
    ...(airing && airing.episodes.length ? [{ href: '#airing', label: 'Airing', value: 'airing' }] : []),
    ...(related.length ? [{ href: '#related', label: 'Related anime', value: 'related' }] : []),
    ...(recommendations.length ? [{ href: '#recommendations', label: 'Recommendations', value: 'recommendations' }] : []),
  ]
  return (
    <FilScreenShell activeKindTab="anime" pageHeading={undefined}>
      <main className="mx-auto w-full max-w-[90rem]" data-consumit-anime-detail data-anilist-id={detail.anilistId}>
        <AnimeHero detail={detail} />
        <div className="mt-8 px-1 sm:px-3 lg:px-4">
          <Tabs
            activeValue="episodes"
            aria-label={`${detail.titles.preferred} sections`}
            items={tabs}
          />
          <section className="py-10 sm:py-12 lg:py-14" id="episodes" aria-labelledby="episodes-heading">
            <AnimeEpisodesSection detail={detail} key={detail.anilistId} />
          </section>
          {related.length ? <section className="border-t border-[var(--fs-line)] py-10 sm:py-12 lg:py-14" id="related" aria-labelledby="anime-related-heading">
            <SectionHeading description="Explore the seasons and stories connected to this anime." id="anime-related-heading" title="Related anime" />
            <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8">{related.map(({ anime, type }) => {
              const format = anime.format === 'MOVIE' ? 'Film' : anime.format.replace(/_/g, ' ')
              const relation = type === 'PREQUEL' ? anime.format === 'MOVIE' ? 'Previous film' : 'Previous season' : type === 'SEQUEL' ? anime.format === 'MOVIE' ? 'Next film' : 'Next season' : type.replace(/_/g, ' ').toLowerCase().replace(/^./, character => character.toUpperCase())
              return <TitleCard className="min-w-0" footer={<p className="text-xs leading-5 text-[var(--fs-muted)]">{relation} <span className="text-[var(--fs-faint)]">· {format}</span></p>} key={anime.anilistId} meta={[anime.seasonYear, format].filter(Boolean).join(' · ')} rating={null} title={{ id: anime.anilistId, kind: 'anime', title: anime.titles.preferred, posterUrl: anime.coverImage.url, year: anime.seasonYear }} />
            })}</ul>
          </section> : relations === null ? <p className="border-t border-[var(--fs-line)] py-6 text-sm text-[var(--fs-muted)]" role="status">Related anime could not load. Refresh to try again.</p> : null}
          <section className="border-t border-[var(--fs-line)] py-10 sm:py-12 lg:py-14" id="overview" aria-labelledby="anime-about-heading">
            <div className="max-w-5xl">
              <SectionHeading id="anime-about-heading" title={`About ${detail.titles.preferred}`} />
              <p className="mt-5 max-w-[70ch] text-sm leading-7 text-[var(--fs-secondary)]">
                {detail.description || 'No synopsis is currently available.'}
              </p>
              <AnimeDetailFacts detail={detail} />
            </div>
          </section>
          <section className="border-t border-[var(--fs-line)] py-10 sm:py-12 lg:py-14" id="cast" aria-labelledby="anime-cast-heading">
            <SectionHeading id="anime-cast-heading" title="Characters & voice actors" />
            <AnimeCastRail characters={detail.characters} />
          </section>
          <section className="border-t border-[var(--fs-line)] py-10 sm:py-12 lg:py-14" id="reviews" aria-labelledby="anime-reviews-heading">
            <SectionHeading id="anime-reviews-heading" title="Member reviews" />
            <TitleReviews
              id={detail.anilistId}
              kind="anime"
              posterUrl={detail.coverImage.url}
              title={detail.titles.preferred}
              year={detail.seasonYear}
            />
          </section>
          {airing && airing.episodes.length ? (
            <section className="border-t border-[var(--fs-line)] py-10 sm:py-12 lg:py-14" id="airing" aria-labelledby="anime-airing-heading">
              <SectionHeading description="Broadcast schedule from AniList" id="anime-airing-heading" title="Airing schedule" />
              <AnimeAiringSection airing={airing} />
            </section>
          ) : null}
          {recommendations.length ? (
            <section className="border-t border-[var(--fs-line)] py-10 sm:py-12 lg:py-14" id="recommendations" aria-labelledby="anime-recommendations-heading">
              <AnimeTitleRail
                description="Real titles recommended by AniList"
                id="anime-detail-recommendations"
                items={recommendations.slice(0, 15)}
                title="Watch next"
              />
            </section>
          ) : null}
        </div>
      </main>
    </FilScreenShell>
  )
}
