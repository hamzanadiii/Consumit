import { titleHref, type CatalogResponseMeta, type CatalogTitleSummary } from '@consumit/contracts'
import { AlertTriangle, RotateCcw } from 'lucide-react'
import type { ReactNode } from 'react'

import { Badge, buttonVariants, ContentCard, ErrorState, SectionHeading } from '@consumit/ui'

import { deterministicTaste } from '@/lib/catalog-registry'

import { ScreenShell } from '../screens/screen-shell'

export function titleMeta(title: CatalogTitleSummary) {
  const kind = title.kind === 'movie' ? 'Film' : 'Series'
  return [title.year, kind, title.genreNames.slice(0, 2).join(' · ')].filter(Boolean).join(' · ')
}

export function memberRating(title: CatalogTitleSummary) {
  return title.tmdbRating === null ? 'New' : `${title.tmdbRating.toFixed(1)} TMDB`
}

export function CatalogStaleNotice({ meta }: { meta: CatalogResponseMeta }) {
  if (!meta.stale) return null
  return (
    <p className="flex items-center gap-2 border-b border-border bg-surface px-5 py-3 text-xs text-copy sm:px-8" role="status">
      <AlertTriangle aria-hidden="true" className="size-4 text-orange" />
      Showing the latest saved catalog data while TMDB reconnects.
    </p>
  )
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
      {visible.map((title, index) => (
        <ContentCard
          artworkSrc={title.posterUrl ?? undefined}
          badge={<Badge tone="lilac">{deterministicTaste(title, index)}% match</Badge>}
          href={titleHref(title)}
          key={`${title.kind}:${title.id}`}
          meta={titleMeta(title)}
          signal={memberRating(title)}
          title={title.title}
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
      <main className="mx-auto min-h-[70vh] w-full max-w-[90rem] px-5 py-16 sm:px-8 lg:px-[62px]">
        <CatalogFailure {...(detail ? { detail } : {})} />
      </main>
    </ScreenShell>
  )
}
