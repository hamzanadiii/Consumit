import { ArtworkFrame, cn } from '@consumit/ui'
import { Star } from 'lucide-react'
import Link from 'next/link'
import { Fragment } from 'react'

export type LandscapeCardMeta = {
  /** Type label, e.g. Movie or Series. */
  kind?: string | undefined
  /** TMDB score or AniList score on the 1–10 scale. */
  rating?: number | null | undefined
  year?: number | null | undefined
}

export type LandscapeCardProps = {
  artworkSrc?: string | null | undefined
  href: string
  meta?: LandscapeCardMeta | undefined
  /** Quiet secondary line, e.g. a format or genre. */
  note?: string | undefined
  title: string
}

/** Landscape catalog card for the browse grids: artwork first, then a
 *  persistent caption with rating, year, and kind — no hover-only text, so
 *  scanning and touch stay honest. */
export function LandscapeCard({ artworkSrc, href, meta, note, title }: LandscapeCardProps) {
  const rating = meta?.rating
  const facts = [
    meta?.year ? String(meta.year) : null,
    meta?.kind ?? null,
    note ?? null,
  ].filter(Boolean) as string[]
  return (
    <article className="group min-w-0" data-consumit-landscape-card>
      <ArtworkFrame
        alt={`${title} artwork`}
        className={cn(
          'rounded-[6px] border border-[var(--fs-line)] bg-[var(--fs-field)] transition-[transform,border-color,box-shadow] duration-200 ease-out group-hover:-translate-y-0.5 group-hover:border-[var(--fs-accent)]/60 group-hover:shadow-[0_6px_16px_rgba(0,0,0,0.12)] group-focus-within:border-[var(--fs-accent)] group-focus-within:ring-2 group-focus-within:ring-[var(--fs-focus)] motion-reduce:transition-none motion-reduce:transform-none',
        )}
        ratio="landscape"
        src={artworkSrc ?? undefined}
      >
        <Link
          aria-label={title}
          className="absolute inset-0 z-[1] rounded-[6px] outline-none"
          href={href}
          prefetch={false}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/70 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100 motion-reduce:transition-none"
        />
        {rating !== undefined && rating !== null ? (
          <span className="pointer-events-none absolute top-2 left-2 inline-flex items-center gap-1 rounded-[3px] bg-black/70 px-1.5 py-0.5 text-[0.6875rem] font-bold tabular-nums text-white opacity-0 transition-opacity duration-200 group-hover:opacity-100 motion-reduce:transition-none">
            <Star aria-hidden="true" className="size-3 fill-current text-[var(--fs-star)]" />
            {rating.toFixed(1)}
          </span>
        ) : null}
      </ArtworkFrame>
      <div className="mt-2.5 min-w-0">
        <p className="truncate text-sm font-bold leading-snug text-[var(--fs-ink)] transition-colors duration-150 group-hover:text-[var(--fs-accent)]">
          {title}
        </p>
        <Caption facts={facts} rating={rating} />
      </div>
    </article>
  )
}

function Caption({ facts, rating }: { facts: readonly string[]; rating?: number | null | undefined }) {
  const hasRating = typeof rating === 'number'
  if (!hasRating && facts.length === 0) return null
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs tabular-nums text-[var(--fs-muted)]">
      {hasRating ? (
        <span className="inline-flex items-center gap-1 font-bold text-[var(--fs-ink)]">
          <Star aria-hidden="true" className="size-3 fill-current text-[var(--fs-star)]" />
          {rating?.toFixed(1)}
          <span className="sr-only">out of 10</span>
        </span>
      ) : null}
      {facts.map((fact, index) => (
        <Fragment key={`${fact}:${index}`}>
          {hasRating || index > 0 ? <span aria-hidden="true">·</span> : null}
          <span className="truncate">{fact}</span>
        </Fragment>
      ))}
    </p>
  )
}
