import { titleHref, watchHref, type CatalogPerson, type CatalogTitleSummary } from '@consumit/contracts'
import { RotateCcw } from 'lucide-react'

import { buttonVariants, ErrorState } from '@consumit/next-ui'

import { FilScreenShell } from '../home/filscreen-shell'
import { TitleCard } from '../shared/title-card'

import { SaveTitleButton } from './save-title-button'

/** Heuristic: a TMDB title that quacks like anime (Animation genre with a
 *  Japanese origin) gets an AniList cross-link lookup. Countries arrive as
 *  names on movies but ISO codes on series — accept both. Server-safe. */
export function looksLikeAnime(detail: { genreNames: readonly string[]; countries: readonly string[]; languages: readonly string[] }): boolean {
  if (!detail.genreNames.includes('Animation')) return false
  return detail.countries.includes('Japan') || detail.countries.includes('JP') || detail.languages.includes('Japanese')
}

export function titleMeta(title: CatalogTitleSummary) {
  const kind = title.kind === 'movie' ? 'Film' : 'Series'
  return [title.year, kind, title.genreNames.slice(0, 2).join(' · ')].filter(Boolean).join(' · ')
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
    <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {visible.map((title) => (
        <TitleCard
          action={<SaveTitleButton id={title.id} kind={title.kind} title={title.title} />}
          href={watchHref(title)}
          key={`${title.kind}:${title.id}`}
          meta={titleMeta(title)}
          titleHref={titleHref(title)}
          title={title}
        />
      ))}
    </ul>
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
      description="We couldn’t load this page’s titles. Please try again."
      detail={detail}
      title="The catalog missed its cue"
    />
  )
}

export function CatalogUnavailableScreen({
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
    : catalogError?.code === 'RATE_LIMITED'
      ? 'Too many catalog requests arrived at once. Wait a moment, then retry.'
    : catalogError?.retryable === true
      ? 'The catalog is temporarily unavailable. Try again in a moment.'
      : undefined

  return (
    <FilScreenShell pageHeading={undefined}>
      <main className="mx-auto min-h-[70vh] w-full max-w-[90rem]">
        <CatalogFailure {...(detail ? { detail } : {})} />
      </main>
    </FilScreenShell>
  )
}
