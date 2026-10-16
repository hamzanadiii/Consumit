import { titleHref as resolveTitleHref, type CatalogKind } from '@consumit/contracts'
import type { ReactNode } from 'react'

import { WatchCard } from '@consumit/ui'
import { OnDemandLink } from './on-demand-link'

export type TitleCardItem = {
  id: number
  kind: CatalogKind
  title: string
  year?: number | null | undefined
  posterUrl?: string | null | undefined
  tmdbRating?: number | null | undefined
}

export type TitleCardProps = {
  title: TitleCardItem
  action?: ReactNode | undefined
  footer?: ReactNode | undefined
  className?: string | undefined
  href?: string | undefined
  titleHref?: string | undefined
  meta?: ReactNode | undefined
  rating?: number | null | undefined
  signal?: ReactNode | undefined
}

export function TitleCard({
  action,
  footer,
  className = 'min-w-0',
  href,
  meta,
  rating,
  signal,
  title,
  titleHref,
}: TitleCardProps) {
  const destination = titleHref ?? resolveTitleHref(title)
  return (
    <li className={className}>
      <WatchCard
        action={action}
        footer={footer}
        artworkSrc={title.posterUrl ?? undefined}
        href={href ?? destination}
        linkComponent={OnDemandLink}
        meta={meta ?? (title.year ? String(title.year) : undefined)}
        rating={rating === undefined ? title.tmdbRating : rating}
        signal={signal}
        title={title.title}
        titleHref={destination}
      />
    </li>
  )
}
