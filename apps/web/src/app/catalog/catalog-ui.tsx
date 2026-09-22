import { titleHref, watchHref, type CatalogPerson, type CatalogTitleSummary } from '@consumit/contracts'
import { RotateCcw } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { Badge, buttonVariants, ErrorState, SectionHeading, WatchCard } from '@consumit/ui'

import { ScreenShell } from '../screens/screen-shell'

import { SaveTitleButton } from './save-title-button'

export function titleMeta(title: CatalogTitleSummary) {
  const kind = title.kind === 'movie' ? 'Film' : 'Series'
  return [title.year, kind, title.genreNames.slice(0, 2).join(' · ')].filter(Boolean).join(' · ')
}

export function heroMeta(title: CatalogTitleSummary) {
  const rating = title.tmdbRating === null ? null : `★ ${title.tmdbRating.toFixed(1)}`
  return [rating, titleMeta(title)].filter(Boolean).join(' · ')
}

/**
 * Detail-shaped hero data. Full title details satisfy this outright;
 * plain summaries degrade gracefully to meta-only heroes.
 */
export type HeroDetail = CatalogTitleSummary & {
  certification?: string | null | undefined
  contentRating?: string | null | undefined
  creators?: readonly Pick<CatalogPerson, 'name' | 'role'>[] | undefined
  episodeRuntimeMinutes?: number | null | undefined
  runtimeMinutes?: number | null | undefined
  seasons?: readonly { number: number }[] | undefined
  tagline?: string | null | undefined
}

export function detailMeta(detail: HeroDetail) {
  const seasons = detail.seasons ?? []
  const duration = detail.kind === 'movie'
    ? (detail.runtimeMinutes ? `${Math.floor(detail.runtimeMinutes / 60)}h ${detail.runtimeMinutes % 60}m` : null)
    : (seasons.length ? `${seasons.length} ${seasons.length === 1 ? 'season' : 'seasons'}` : null)
  const rating = detail.kind === 'series' ? detail.contentRating : detail.certification
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {detail.tmdbRating !== null ? <strong className="text-ink">★ {detail.tmdbRating.toFixed(1)}</strong> : null}
      {detail.year ? <strong className="text-ink">{detail.year}</strong> : null}
      {duration ? <span>{duration}</span> : null}
      {detail.genreNames.length ? <span>{detail.genreNames.slice(0, 3).join(' · ')}</span> : null}
      {rating ? <Badge tone="neutral">{rating}</Badge> : null}
    </span>
  )
}

export function makerByline(detail: Pick<HeroDetail, 'creators' | 'kind'>): string | undefined {
  const makers = detail.kind === 'movie'
    ? (detail.creators ?? []).filter((person) => person.role === 'Director').map((person) => person.name)
    : (detail.creators ?? []).map((person) => person.name)
  if (makers.length === 0) return undefined
  return `${detail.kind === 'movie' ? 'Directed' : 'Created'} by ${makers.slice(0, 3).join(', ')}`
}

export function CatalogGrid({
  items,
  limit,
}: {
  items: readonly CatalogTitleSummary[]
  limit?: number | undefined
}) {
  const visible = limit === undefined ? items : items.slice(0, limit)
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {visible.map((title) => (
        <WatchCard
          artworkSrc={title.posterUrl ?? undefined}
          bookmark={<SaveTitleButton id={title.id} kind={title.kind} title={title.title} />}
          href={watchHref(title)}
          key={`${title.kind}:${title.id}`}
          linkComponent={Link}
          meta={titleMeta(title)}
          rating={title.tmdbRating ?? undefined}
          title={title.title}
          titleHref={titleHref(title)}
        />
      ))}
    </div>
  )
}

export function CatalogShelf({
  action,
  description,
  id,
  items,
  title,
}: {
  action?: ReactNode | undefined
  description?: string | undefined
  id: string
  items: readonly CatalogTitleSummary[]
  title: string
}) {
  return (
    <section className="border-t border-border py-12 sm:py-16" aria-labelledby={id}>
      <SectionHeading action={action} description={description} id={id} title={title} />
      <div className="mt-8">
        <CatalogGrid items={items} limit={5} />
      </div>
    </section>
  )
}

export function CatalogFailure({ detail }: { detail?: string | undefined }) {
  return (
    <ErrorState
      action={(
        <a className={buttonVariants()} href="">
          <RotateCcw aria-hidden="true" /> Retry catalog
        </a>
      )}
      description="Real title metadata is temporarily unavailable. Consumit will never replace it with made-up catalog data."
      detail={detail}
      title="The catalog missed its cue"
    />
  )
}

export function CatalogUnavailableScreen({
  activeHref = '',
  error,
}: {
  activeHref?: string | undefined
  error: unknown
}) {
  const catalogError = typeof error === 'object' && error !== null && 'code' in error && 'retryable' in error
    ? error as { code: unknown; retryable: unknown }
    : null
  const detail = catalogError?.code === 'CATALOG_NOT_CONFIGURED'
    ? 'The catalog connection is not configured yet. Add the server-only TMDB API Read Access Token, then restart the API.'
    : catalogError?.retryable === true
      ? 'The catalog service did not answer in time. Try again in a moment.'
      : undefined

  return (
    <ScreenShell activeHref={activeHref}>
      <main className="mx-auto min-h-[70vh] w-full max-w-[90rem] px-5 py-16 sm:px-8 lg:px-[50px]">
        <CatalogFailure {...(detail ? { detail } : {})} />
      </main>
    </ScreenShell>
  )
}
