'use client'

import { type CatalogMovieDetail, type CatalogPerson, type CatalogSeason, type CatalogSeriesDetail, type CatalogTitleDetail, type CatalogTitleSummary } from '@consumit/contracts'
import { Star } from 'lucide-react'
import Image from 'next/image'
import { useRef, useState } from 'react'

import { CastCard, SectionHeading, Tabs } from '@consumit/next-ui'

import { browserCatalogSeason } from '@/lib/catalog-browser'
import { makerByline } from './catalog-ui'
import { EpisodesSection } from './episodes-section'
import { MemberActionPanel } from './member-action-panel'
import { AdSlot } from '../shared/ad-slot'
import { TitleReviews } from './title-reviews'
import { TitlePlayAction } from './title-play-action'
import { FilScreenShell, TitleRail } from '../shared'

function CastRail({ cast }: { cast: readonly CatalogPerson[] }) {
  // One person can appear as both cast and creator under the same id;
  // collapse duplicates (cast entry wins) so keys stay unique.
  const seen = new Set<number>()
  const people = cast.filter((person) => {
    if (seen.has(person.id)) return false
    seen.add(person.id)
    return true
  })
  return (
    <div className="mt-8 grid auto-cols-[minmax(9.5rem,42vw)] grid-flow-col gap-4 overflow-x-auto pb-4 sm:auto-cols-[11rem] xl:grid-flow-row xl:grid-cols-6 xl:overflow-visible xl:pb-0">
      {people.slice(0, 6).map((person) => (
        <CastCard
          character={person.character ?? undefined}
          className="transition-transform duration-200 hover:-translate-y-1 motion-reduce:transition-none motion-reduce:transform-none"
          imageSrc={person.profileUrl ?? undefined}
          key={person.id}
          name={person.name}
          role={person.role ?? undefined}
        />
      ))}
    </div>
  )
}

function RelatedRail({ current, items }: {
  current: Pick<CatalogTitleSummary, 'id' | 'kind'>
  items: readonly CatalogTitleSummary[]
}) {
  const seen = new Set<string>()
  const related = items.filter((item) => {
    if (item.id === current.id && item.kind === current.kind) return false
    const key = `${item.kind}:${item.id}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  if (related.length === 0) return null
  return (
    <TitleRail
      description="Real titles recommended by TMDB"
      id="detail-related-titles"
      items={related.slice(0, 15)}
      title={current.kind === 'movie' ? 'If this stays with you' : 'Watch next'}
    />
  )
}

function DetailFacts({ detail }: { detail: CatalogTitleDetail }) {
  const creators = detail.creators.map((person) => person.name).join(', ') || 'Not listed'
  const facts = [
    [detail.kind === 'movie' ? 'Director / writer' : 'Created by', creators],
    ['Countries', detail.countries.join(' · ') || 'Not listed'],
    ['Languages', detail.languages.join(' · ') || 'Not listed'],
    ['Status', detail.status ?? 'Not listed'],
    ['Released', detail.releaseDate ?? 'Not listed'],
  ]
  return (
    <dl className="mt-9 grid gap-x-8 gap-y-6 border-t border-[var(--fs-line)] pt-7 text-xs sm:grid-cols-2 2xl:grid-cols-3">
      {facts.map(([term, value]) => (
        <div className="grid grid-cols-[7rem_1fr] gap-3" key={term}>
          <dt className="text-[var(--fs-muted)]">{term}</dt>
          <dd className="font-bold text-[var(--fs-ink)]">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function FilScreenTitleHero({ detail }: { detail: CatalogTitleDetail }) {
  const byline = makerByline(detail)
  const seasonCount = detail.kind === 'series' ? (detail.seasons?.length ?? 0) : 0
  const duration = detail.kind === 'movie'
    ? (detail.runtimeMinutes ? `${Math.floor(detail.runtimeMinutes / 60)}h ${detail.runtimeMinutes % 60}m` : null)
    : (seasonCount > 0 ? `${seasonCount} ${seasonCount === 1 ? 'season' : 'seasons'}` : null)
  const contentRating = detail.kind === 'series' ? detail.contentRating : detail.certification
  const rating = detail.tmdbRating !== null ? detail.tmdbRating.toFixed(1) : null

  return (
    <header
      className="relative isolate overflow-hidden rounded-card border border-[var(--fs-line)] bg-[#09090b] text-white"
      data-consumit-title-masthead
    >
      {detail.backdropUrl ? (
        <Image
          alt=""
          className="object-cover"
          fill
          priority
          sizes="(max-width: 1280px) 100vw, 1400px"
          src={detail.backdropUrl}
        />
      ) : (
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{ background: 'radial-gradient(120% 90% at 78% 8%, #6b3c32 0%, #3a211d 34%, #211412 66%, #09090b 100%)' }}
        />
      )}
      {/* Dark atmospheric cinematic overlays matching Home hero */}
      <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(90deg,rgba(9,9,11,0.94)_0%,rgba(9,9,11,0.72)_50%,rgba(9,9,11,0.18)_100%)]" />
      <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(0deg,rgba(9,9,11,0.98)_0%,rgba(9,9,11,0.4)_40%,transparent_100%)]" />

      <div className="relative flex min-h-[480px] flex-col justify-center gap-8 p-6 sm:p-10 lg:grid lg:min-h-[520px] lg:grid-cols-[minmax(0,1fr)_340px] lg:items-center lg:p-12">
        <div className="flex max-w-2xl flex-col justify-center gap-3">
          {detail.logoUrl ? (
            <div>
              <Image
                alt={detail.title}
                className="h-auto max-h-24 w-auto max-w-full [filter:drop-shadow(0_2px_16px_rgb(0_0_0/0.65))] sm:max-h-28"
                height={240}
                priority
                src={detail.logoUrl}
                width={640}
              />
              <h1 className="sr-only">{detail.title}</h1>
            </div>
          ) : (
            <h1 className="font-display text-[clamp(2.5rem,5vw,4.5rem)] leading-[0.95] font-normal tracking-[-0.025em] text-white">
              {detail.title}
            </h1>
          )}

          {detail.tagline ? (
            <p className="max-w-[48ch] font-display text-xl sm:text-2xl leading-snug text-white/95">
              {detail.tagline}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            {rating ? (
              <strong className="inline-flex items-center gap-1 font-bold text-orange tabular-nums">
                <Star aria-hidden="true" className="size-3.5 fill-current" />
                ★ {rating}
                <span className="sr-only">on TMDB</span>
              </strong>
            ) : null}
            {detail.year ? <span className="font-bold text-white tabular-nums">{detail.year}</span> : null}
            {duration ? <span className="text-white/70">{duration}</span> : null}
            {detail.genreNames.length ? <span className="text-white/70">{detail.genreNames.slice(0, 3).join(' · ')}</span> : null}
            {contentRating ? (
              <span className="rounded border border-white/30 bg-black/40 px-1.5 py-0.5 text-[11px] font-bold text-white">
                {contentRating}
              </span>
            ) : null}
          </div>

          {byline ? <p className="text-xs font-bold tracking-wide text-white/75">{byline}</p> : null}

          {detail.overview ? (
            <p className="max-w-[62ch] text-sm leading-6 text-white/85 line-clamp-3">
              {detail.overview}
            </p>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center gap-3">
            <TitlePlayAction id={detail.id} kind={detail.kind} {...(detail.kind === 'series' ? { seasons: detail.seasons } : {})} />
          </div>
        </div>

        {/* Member Action Shelf */}
        <div className="w-full max-w-2xl lg:max-w-none">
          <MemberActionPanel
            id={detail.id}
            kind={detail.kind}
            posterUrl={detail.posterUrl ?? undefined}
            title={detail.title}
            year={detail.year}
          />
        </div>
      </div>
    </header>
  )
}

export function TitleDetailScreen({ detail }: { detail: CatalogMovieDetail }) {
  return (
    <FilScreenShell activeKindTab="movies" pageHeading={undefined}>
      <main className="mx-auto w-full max-w-[90rem]" data-consumit-title-detail data-tmdb-id={detail.id}>
        <FilScreenTitleHero detail={detail} />
        <div className="mt-8 px-1 sm:px-3 lg:px-4"><AdSlot placement="detail" position="early" /></div>
        <div className="mt-8 px-1 sm:px-3 lg:px-4">
          <Tabs
            activeValue="overview"
            aria-label={`${detail.title} sections`}
            items={[
              { href: '#overview', label: 'Overview', value: 'overview' },
              { href: '#reviews', label: 'Reviews', value: 'reviews' },
              { href: '#cast', label: 'Cast & crew', value: 'cast' },
              { href: '#related', label: 'Related', value: 'related' },
            ]}
          />
          <section className="grid gap-8 py-10 sm:py-12 lg:py-14 xl:grid-cols-[minmax(0,1fr)_300px]" id="overview" aria-labelledby="movie-about-heading">
            <div className="min-w-0 max-w-5xl">
              <SectionHeading id="movie-about-heading" title="About the film" />
              <p className="mt-5 max-w-[70ch] text-sm leading-7 text-[var(--fs-secondary)]">{detail.overview || 'No synopsis is currently available.'}</p>
              <DetailFacts detail={detail} />
            </div>
            <div className="hidden xl:block"><AdSlot placement="detail" shape="rectangle" /></div>
          </section>
          <section className="border-t border-[var(--fs-line)] py-10 sm:py-12 lg:py-14" id="cast" aria-labelledby="movie-cast-heading">
            <SectionHeading id="movie-cast-heading" title="Cast & crew" />
            <CastRail cast={[...detail.cast, ...detail.creators]} />
          </section>
          <section className="border-t border-[var(--fs-line)] py-10 sm:py-12 lg:py-14" id="reviews" aria-labelledby="movie-reviews-heading">
            <SectionHeading id="movie-reviews-heading" title="Member reviews" />
            <TitleReviews
              id={detail.id}
              kind={detail.kind}
              posterUrl={detail.posterUrl}
              title={detail.title}
              year={detail.year}
            />
          </section>
          <div className="my-8 xl:hidden"><AdSlot placement="detail" /></div>
          <section className="border-t border-[var(--fs-line)] py-10 sm:py-12 lg:py-14" id="related" aria-labelledby="movie-related-heading">
            <RelatedRail current={detail} items={detail.recommendations} />
          </section>
        </div>
      </main>
    </FilScreenShell>
  )
}

type SeriesDetailScreenProps = { detail: CatalogSeriesDetail; initialSeason: CatalogSeason | null }

export function SeriesDetailScreen({ detail, initialSeason }: SeriesDetailScreenProps) {
  const [season, setSeason] = useState(initialSeason)
  const [failedSeason, setFailedSeason] = useState<number | null>(initialSeason ? null : (detail.seasons[0]?.number ?? 1))
  const [loadingSeason, setLoadingSeason] = useState(false)
  const controller = useRef<AbortController | null>(null)

  async function loadSeason(number: number) {
    if (number === season?.seasonNumber) return
    controller.current?.abort()
    const nextController = new AbortController()
    controller.current = nextController
    setLoadingSeason(true)
    setFailedSeason(null)
    try {
      const response = await browserCatalogSeason(detail.id, number, nextController.signal)
      setSeason(response.item)
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) setFailedSeason(number)
    } finally {
      if (controller.current === nextController) setLoadingSeason(false)
    }
  }

  return (
    <FilScreenShell activeKindTab="series" pageHeading={undefined}>
      <main className="mx-auto w-full max-w-[90rem]" data-consumit-series-detail data-tmdb-id={detail.id}>
        <FilScreenTitleHero detail={detail} />
        <div className="mt-8 px-1 sm:px-3 lg:px-4"><AdSlot placement="detail" position="early" /></div>
        <div className="mt-8 px-1 sm:px-3 lg:px-4">
          <Tabs
            activeValue="episodes"
            aria-label={`${detail.title} sections`}
            items={[
              { href: '#episodes', label: 'Episodes', value: 'episodes' },
              { href: '#overview', label: 'Overview', value: 'overview' },
              { href: '#reviews', label: 'Reviews', value: 'reviews' },
              { href: '#cast', label: 'Cast & crew', value: 'cast' },
            ]}
          />
          <section className="py-10 sm:py-12 lg:py-14" id="episodes" aria-labelledby="episodes-heading">
            {/* Keyed by season so pagination restarts on the first page for each season. */}
            <EpisodesSection
              detail={detail}
              failedSeason={failedSeason}
              key={season?.seasonNumber ?? 'no-season'}
              loadingSeason={loadingSeason}
              onRetrySeason={() => failedSeason !== null && void loadSeason(failedSeason)}
              onSelectSeason={(number) => void loadSeason(number)}
              season={season}
              seasons={detail.seasons}
            />
          </section>
          <section className="grid gap-8 border-t border-[var(--fs-line)] py-10 sm:py-12 lg:py-14 xl:grid-cols-[minmax(0,1fr)_300px]" id="overview" aria-labelledby="series-about-heading">
            <div className="min-w-0">
              <SectionHeading id="series-about-heading" title={`About ${detail.title}`} />
              <p className="mt-5 max-w-[72ch] text-sm leading-7 text-[var(--fs-secondary)]">{detail.overview || 'No synopsis is currently available.'}</p>
              <DetailFacts detail={detail} />
            </div>
            <div className="hidden xl:block"><AdSlot placement="detail" shape="rectangle" /></div>
          </section>
          <section className="border-t border-[var(--fs-line)] py-10 sm:py-12 lg:py-14" id="cast" aria-labelledby="series-cast-heading">
            <SectionHeading id="series-cast-heading" title="Cast & crew" />
            <CastRail cast={[...detail.cast, ...detail.creators]} />
          </section>
          <section className="border-t border-[var(--fs-line)] py-10 sm:py-12 lg:py-14" id="reviews" aria-labelledby="series-reviews-heading">
            <SectionHeading id="series-reviews-heading" title="Member reviews" />
            <TitleReviews
              id={detail.id}
              kind={detail.kind}
              posterUrl={detail.posterUrl}
              title={detail.title}
              year={detail.year}
            />
          </section>
          <div className="my-8 xl:hidden"><AdSlot placement="detail" /></div>
          <section className="border-t border-[var(--fs-line)] py-10 sm:py-12 lg:py-14" aria-labelledby="series-related-heading">
            <RelatedRail current={detail} items={detail.recommendations} />
          </section>
        </div>
      </main>
    </FilScreenShell>
  )
}
