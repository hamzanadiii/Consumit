import type { ComponentProps, ReactNode } from 'react'
import { Check } from 'lucide-react'

import { cn } from '../lib/cn'
import { ArtworkFrame } from '../media/media'
import { Badge } from '../signals/signals'

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
  const safeProgress = progress === undefined ? undefined : Math.min(Math.max(progress, 0), 100)

  return (
    <article className={cn('group relative min-w-0', className)} data-consumit-saved-title-card {...props}>
      <ArtworkFrame alt={`${title} poster`} src={artworkSrc}>
        {badge ? <div className="absolute top-3 left-3">{badge}</div> : null}
        {saved && !action ? (
          <span className="absolute top-3 right-3 grid size-8 place-items-center rounded-full bg-canvas/85 text-orange">
            <Check aria-hidden="true" className="size-4" />
            <span className="sr-only">Saved</span>
          </span>
        ) : null}
        {action ? <div className="absolute top-3 right-3 z-10">{action}</div> : null}
        {safeProgress !== undefined ? (
          <span className="absolute inset-x-0 bottom-0 h-1 bg-surface-raised">
            <span className="block h-full bg-orange" style={{ width: `${safeProgress}%` }} />
            <span className="sr-only">{safeProgress}% watched</span>
          </span>
        ) : null}
      </ArtworkFrame>
      <div className="mt-3 min-w-0">
        {href ? (
          <a className="consumit-card-title inline-flex min-h-11 items-center font-bold text-ink outline-none transition-colors hover:text-orange focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none" href={href}>{title}</a>
        ) : (
          <h3 className="text-sm font-bold text-ink">{title}</h3>
        )}
        <div className="mt-1 text-xs text-muted">{meta}</div>
        {signal ? <div className="mt-2 text-xs text-copy">{signal}</div> : null}
        {footer ? <div className="relative z-10 mt-3">{footer}</div> : null}
      </div>
    </article>
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
      className={cn('grid min-w-0 grid-cols-[2.25rem_4.5rem_1fr] gap-3 rounded-card border border-border bg-surface p-3 sm:grid-cols-[2.5rem_6.5rem_1fr_auto] sm:items-center sm:gap-5', className)}
      data-consumit-ordered-title-row
      {...props}
    >
      <span className="self-start font-display text-3xl tabular-nums text-muted sm:text-4xl">{rank}</span>
      <ArtworkFrame alt={`${title} artwork`} className="rounded-control" ratio="square" src={artworkSrc} />
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
