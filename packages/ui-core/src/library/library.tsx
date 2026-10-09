import type { ComponentProps, ReactNode } from 'react'
import { cn } from '../lib/cn'
import { ArtworkFrame } from '../media/media'
import { Badge } from '../signals/signals'
import { WatchCard } from '../cards/content-cards'

export type SavedTitleCardProps = Omit<ComponentProps<'article'>, 'children'> & {
  action?: ReactNode | undefined
  artworkSrc?: string | undefined
  badge?: ReactNode | undefined
  footer?: ReactNode | undefined
  href?: string | undefined
  meta: ReactNode
  progress?: number | undefined
  saved?: boolean | undefined
  signal?: ReactNode | undefined
  title: string
}

export function SavedTitleCard({
  action,
  artworkSrc,
  badge,
  className,
  footer,
  href,
  meta,
  progress,
  saved = true,
  signal,
  title,
  ...props
}: SavedTitleCardProps) {
  return (
    <WatchCard
      action={action}
      artworkSrc={artworkSrc}
      badge={badge}
      className={cn('min-w-0', className)}
      data-consumit-saved-title-card
      footer={footer}
      meta={meta}
      progress={progress}
      saved={saved}
      signal={signal}
      title={title}
      titleHref={href}
      {...props}
    />
  )
}

export type OrderedTitleRowProps = Omit<ComponentProps<'article'>, 'children'> & {
  action?: ReactNode | undefined
  artworkSrc?: string | undefined
  href?: string | undefined
  index: number
  match?: number | undefined
  meta: ReactNode
  proof?: ReactNode | undefined
  quote?: string | undefined
  title: string
}

export function OrderedTitleRow({
  action,
  artworkSrc,
  className,
  href,
  index,
  match,
  meta,
  proof,
  quote,
  title,
  ...props
}: OrderedTitleRowProps) {
  const rank = String(Math.max(0, Math.round(index))).padStart(2, '0')

  return (
    <article
      className={cn('grid min-w-0 grid-cols-[2.25rem_4.5rem_1fr] gap-3 border-b border-border py-5 sm:grid-cols-[2.5rem_6.5rem_1fr_auto] sm:items-center sm:gap-5', className)}
      data-consumit-ordered-title-row
      {...props}
    >
      <span className="self-start font-display text-3xl tabular-nums text-muted sm:text-4xl">{rank}</span>
      <ArtworkFrame alt={`${title} artwork`} className="rounded-control" ratio="portrait" src={artworkSrc} />
      <div className="min-w-0">
        {href ? (
          <a className="font-display text-2xl leading-tight text-ink outline-none hover:text-orange focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 focus-visible:ring-offset-canvas" href={href}>{title}</a>
        ) : (
          <h3 className="font-display text-2xl leading-tight text-ink">{title}</h3>
        )}
        <div className="mt-1 text-xs text-muted">{meta}</div>
        {quote ? <p className="mt-3 text-sm leading-6 text-copy">“{quote}”</p> : null}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {match !== undefined ? <Badge tone="orange">{Math.round(match)}% match</Badge> : null}
          {proof ? <div className="text-xs text-muted">{proof}</div> : null}
        </div>
      </div>
      {action ? <div className="col-start-3 sm:col-start-auto">{action}</div> : null}
    </article>
  )
}
