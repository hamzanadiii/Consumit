'use client'

import { titleHref, watchHref, type CatalogMovieDetail, type CatalogPerson, type CatalogSeason, type CatalogSeriesDetail, type CatalogTitleDetail, type CatalogTitleSummary } from '@consumit/contracts'
import { Play, RotateCcw } from 'lucide-react'
import Link from 'next/link'
import { useRef, useState } from 'react'

import { Button, CarouselRow, CastCard, EmptyState, EpisodeRow, SeasonSelector, SectionHeading, Tabs, TitleMasthead, WatchCard, buttonVariants } from '@consumit/ui'

import { browserCatalogSeason } from '@/lib/catalog-browser'
import { CatalogStaleNotice, detailMeta, makerByline } from './catalog-ui'
import { MemberActionPanel } from './member-action-panel'
import { SaveTitleButton } from './save-title-button'
import { ScreenShell } from '../screens/screen-shell'

function CastRail({ cast }: { cast: readonly CatalogPerson[] }) {
  return (
    <div className="mt-8 grid auto-cols-[minmax(9.5rem,42vw)] grid-flow-col gap-4 overflow-x-auto pb-4 sm:auto-cols-[11rem] xl:grid-flow-row xl:grid-cols-6 xl:overflow-visible xl:pb-0">
      {cast.slice(0, 6).map((person) => <CastCard character={person.character ?? undefined} imageSrc={person.profileUrl ?? undefined} key={person.id} name={person.name} role={person.role ?? undefined} />)}
    </div>
  )
}

function RelatedRail({ current, items }: {
  current: Pick<CatalogTitleSummary, 'id' | 'kind'>
  items: readonly CatalogTitleSummary[]
}) {
  const related = items.filter((item) => item.id !== current.id || item.kind !== current.kind)
  if (related.length === 0) return null
  return (
    <div className="mt-8">
      <CarouselRow aria-label="Related titles">
        {related.slice(0, 15).map((item) => (
          <WatchCard
            artworkSrc={item.posterUrl ?? undefined}
            bookmark={<SaveTitleButton id={item.id} kind={item.kind} title={item.title} />}
            className="w-[145px] sm:w-[170px] md:w-[195px] lg:w-[215px] shrink-0"
            href={watchHref(item)}
            key={`${item.kind}:${item.id}`}
            linkComponent={Link}
            meta={item.year ? String(item.year) : undefined}
            rating={item.tmdbRating ?? undefined}
            title={item.title}
            titleHref={titleHref(item)}
          />
        ))}
      </CarouselRow>
    </div>
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
    <dl className="mt-9 grid gap-x-8 gap-y-6 border-t border-border pt-7 text-xs sm:grid-cols-2 xl:grid-cols-3">
      {facts.map(([term, value]) => <div className="grid grid-cols-[7rem_1fr] gap-3" key={term}><dt className="text-muted">{term}</dt><dd className="font-bold text-copy">{value}</dd></div>)}
    </dl>
  )
}

function DetailMasthead({ detail }: { detail: CatalogTitleDetail }) {
  const byline = makerByline(detail)
  return (
    <TitleMasthead
      actions={(
        <Link className={buttonVariants()} href={watchHref(detail)}><Play aria-hidden="true" /> Watch</Link>
      )}
      backgroundSrc={detail.backdropUrl ?? undefined}
      byline={byline}
      className="consumit-detail-masthead px-5 py-14 sm:px-8 lg:min-h-[42rem] lg:px-[50px] lg:py-24"
      headingLevel="h1"
      lede={detail.tagline ?? undefined}
      logoUrl={detail.logoUrl ?? undefined}
      metadata={detailMeta(detail)}
      socialProof={<MemberActionPanel id={detail.id} kind={detail.kind} posterUrl={detail.posterUrl ?? undefined} title={detail.title} year={detail.year} />}
      synopsis={detail.overview || 'More information will be available soon.'}
      synopsisClassName="line-clamp-3"
      title={detail.title}
    />
  )
}

export function TitleDetailScreen({ detail, stale }: { detail: CatalogMovieDetail; stale: boolean }) {
  return (
    <ScreenShell activeHref="/movies">
      {stale ? <CatalogStaleNotice meta={{ fetchedAt: new Date(0).toISOString(), language: 'en-US', region: 'US', source: 'tmdb', stale }} /> : null}
      <main className="mx-auto w-full max-w-[90rem]" data-consumit-title-detail data-tmdb-id={detail.id}>
        <DetailMasthead detail={detail} />
        <div className="px-5 sm:px-8 lg:px-[50px]">
          <Tabs activeValue="overview" aria-label={`${detail.title} sections`} items={[{ href: '#overview', label: 'Overview', value: 'overview' }, { href: '#reviews', label: 'Reviews', value: 'reviews' }, { href: '#cast', label: 'Cast & crew', value: 'cast' }, { href: '#related', label: 'Related', value: 'related' }]} />
          <section className="py-12 sm:py-14 lg:py-16" id="overview" aria-labelledby="movie-about-heading">
            <div className="max-w-5xl"><SectionHeading id="movie-about-heading" title="About the film" /><p className="mt-5 max-w-[70ch] text-sm leading-7 text-copy">{detail.overview || 'No synopsis is currently available.'}</p><DetailFacts detail={detail} /></div>
          </section>
          <section className="border-t border-border py-12 sm:py-14 lg:py-16" id="cast" aria-labelledby="movie-cast-heading"><SectionHeading id="movie-cast-heading" title="Cast & crew" /><CastRail cast={[...detail.cast, ...detail.creators]} /></section>
          <section className="border-t border-border py-12 sm:py-14 lg:py-16" id="reviews" aria-labelledby="movie-reviews-heading"><SectionHeading id="movie-reviews-heading" title="Member reviews" /><div className="mt-8"><EmptyState description="Reviews will appear here only after members publish real writing about this film." title="No member reviews yet" /></div></section>
          <section className="border-t border-border py-12 sm:py-14 lg:py-16" id="related" aria-labelledby="movie-related-heading"><SectionHeading description="Real titles recommended by TMDB" id="movie-related-heading" title="If this stays with you" /><RelatedRail current={detail} items={detail.recommendations} /></section>
        </div>
      </main>
    </ScreenShell>
  )
}

type SeriesDetailScreenProps = { detail: CatalogSeriesDetail; initialSeason: CatalogSeason | null; stale: boolean }

export function SeriesDetailScreen({ detail, initialSeason, stale }: SeriesDetailScreenProps) {
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
    <ScreenShell activeHref="/series">
      {stale ? <CatalogStaleNotice meta={{ fetchedAt: new Date(0).toISOString(), language: 'en-US', region: 'US', source: 'tmdb', stale }} /> : null}
      <main className="mx-auto w-full max-w-[90rem]" data-consumit-series-detail data-tmdb-id={detail.id}>
        <DetailMasthead detail={detail} />
        <div className="px-5 sm:px-8 lg:px-[50px]">
          <Tabs activeValue="episodes" aria-label={`${detail.title} sections`} items={[{ href: '#episodes', label: 'Episodes', value: 'episodes' }, { href: '#overview', label: 'Overview', value: 'overview' }, { href: '#reviews', label: 'Reviews', value: 'reviews' }, { href: '#cast', label: 'Cast & crew', value: 'cast' }]} />
          <section className="py-12 sm:py-14 lg:py-16" id="episodes" aria-labelledby="episodes-heading">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <SectionHeading id="episodes-heading" title="Episodes" />
              {detail.seasons.length ? <SeasonSelector disabled={loadingSeason} onValueChange={(value) => void loadSeason(Number(value))} options={detail.seasons.map((item) => ({ label: `${item.name} · ${item.episodeCount} episodes`, value: String(item.number) }))} value={String(season?.seasonNumber ?? detail.seasons[0]?.number ?? 1)} /> : null}
            </div>
            {loadingSeason ? <p className="mt-5 text-xs text-muted" role="status">Loading season…</p> : null}
            {failedSeason !== null ? <div className="mt-6 flex flex-wrap items-center gap-4 rounded-card border border-border bg-surface p-5" role="alert"><p className="text-sm text-copy">Season {failedSeason} could not be loaded. The current season is still here.</p><Button onClick={() => void loadSeason(failedSeason)} size="sm" variant="secondary"><RotateCcw aria-hidden="true" /> Retry</Button></div> : null}
            {season && season.episodes.length ? <div className="mt-8 space-y-3">{season.episodes.map((episode) => <EpisodeRow action={<Link className={buttonVariants({ size: 'sm', variant: 'secondary' })} href={watchHref(detail, { episode: episode.episodeNumber, season: episode.seasonNumber })}>Watch</Link>} artworkSrc={episode.stillUrl ?? undefined} description={episode.overview || undefined} episode={`Episode ${episode.episodeNumber}`} key={episode.id} meta={[episode.runtimeMinutes ? `${episode.runtimeMinutes} min` : null, episode.airDate].filter(Boolean).join(' · ')} title={episode.title} />)}</div> : (!failedSeason ? <p className="mt-8 text-sm text-muted">No regular episodes are listed for this season.</p> : null)}
          </section>
          <section className="border-t border-border py-12 sm:py-14 lg:py-16" id="overview" aria-labelledby="series-about-heading"><SectionHeading id="series-about-heading" title={`About ${detail.title}`} /><p className="mt-5 max-w-[72ch] text-sm leading-7 text-copy">{detail.overview || 'No synopsis is currently available.'}</p><DetailFacts detail={detail} /></section>
          <section className="border-t border-border py-12 sm:py-14 lg:py-16" id="cast" aria-labelledby="series-cast-heading"><SectionHeading id="series-cast-heading" title="Cast & crew" /><CastRail cast={[...detail.cast, ...detail.creators]} /></section>
          <section className="border-t border-border py-12 sm:py-14 lg:py-16" id="reviews" aria-labelledby="series-reviews-heading"><SectionHeading id="series-reviews-heading" title="Member reviews" /><div className="mt-8"><EmptyState description="Reviews will appear here only after members publish real writing about this series." title="No member reviews yet" /></div></section>
          <section className="border-t border-border py-12 sm:py-14 lg:py-16" aria-labelledby="series-related-heading"><SectionHeading description="Real series recommended by TMDB" id="series-related-heading" title="Watch next" /><RelatedRail current={detail} items={detail.recommendations} /></section>
        </div>
      </main>
    </ScreenShell>
  )
}
