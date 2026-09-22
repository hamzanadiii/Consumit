import { titleHref, type CatalogTitleSummary } from '@consumit/contracts'
import { Star } from 'lucide-react'
import Link from 'next/link'

import { ArtworkFrame } from '@consumit/ui'

function ratingLabel(rating: number | null) {
  return rating === null ? null : rating.toFixed(1)
}

export type TitleCardProps = {
  title: CatalogTitleSummary
  className?: string | undefined
}

export function TitleCard({ title, className = 'w-40 shrink-0 snap-start sm:w-44 lg:w-48' }: TitleCardProps) {
  const rating = ratingLabel(title.tmdbRating)
  return (
    <li className={className}>
      <Link
        aria-label={`${title.title}${title.year ? `, ${title.year}` : ''}`}
        className="group block rounded-card outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]"
        href={titleHref(title)}
        prefetch={false}
      >
        <ArtworkFrame
          alt={`${title.title} poster`}
          className="transition-colors duration-200 group-hover:border-[var(--fs-accent)] motion-reduce:transition-none"
          ratio="portrait"
          src={title.posterUrl ?? undefined}
        >
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-3 pt-8 pb-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none [@media(hover:none)]:opacity-100">
            <p className="truncate text-sm font-bold text-white">{title.title}</p>
            <p className="mt-1 flex items-center gap-1.5 text-xs text-white/80 tabular-nums">
              {title.year ? <span>{title.year}</span> : null}
              {rating ? (
                <span className="inline-flex items-center gap-1 font-bold text-white">
                  <Star aria-hidden="true" className="size-3 fill-current" />
                  {rating}
                  <span className="sr-only">on TMDB</span>
                </span>
              ) : null}
            </p>
          </div>
        </ArtworkFrame>
      </Link>
    </li>
  )
}

// Alias for backwards-compatibility with Home imports
export const RailCard = TitleCard
