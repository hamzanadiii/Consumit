import type { ComponentProps, ReactNode } from 'react'

import { cn } from '../lib/cn'
import { ArtworkFrame } from '../media/media'
import { RatingDisplay } from '../signals/signals'

export type DiaryRowProps = Omit<ComponentProps<'article'>, 'children'> & {
  action?: ReactNode | undefined
  artworkSrc?: string | undefined
  date: string
  detail?: ReactNode | undefined
  href?: string | undefined
  note?: string | undefined
  rating?: number | undefined
  title: string
}

export function DiaryRow({
  action,
  artworkSrc,
  className,
  date,
  detail,
  href,
  note,
  rating,
  title,
  ...props
}: DiaryRowProps) {
  return (
    <article
      className={cn(
        'grid min-w-0 grid-cols-[3.5rem_4rem_1fr] items-center gap-3 border-b border-border py-4 sm:grid-cols-[4rem_5rem_1fr_auto] sm:gap-5',
        className,
      )}
      data-consumit-diary-row
      {...props}
    >
      <time className="text-xs uppercase leading-5 tracking-[0.08em] text-muted">
        {date}
      </time>
      <ArtworkFrame
        alt={`${title} artwork`}
        className="rounded-control"
        ratio="square"
        src={artworkSrc}
      />
      <div className="min-w-0">
        {href ? (
          <a
            className="inline-flex min-h-11 items-center font-bold text-ink outline-none transition-colors hover:text-orange focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none"
            href={href}
          >
            {title}
          </a>
        ) : (
          <h3 className="text-sm font-bold text-ink">{title}</h3>
        )}
        {rating !== undefined ? (
          <RatingDisplay className="mt-1" value={rating} />
        ) : null}
        {detail ? <div className="mt-1 text-xs text-muted">{detail}</div> : null}
        {note ? <p className="mt-2 text-sm leading-6 text-copy">“{note}”</p> : null}
      </div>
      {action ? <div className="col-start-3 sm:col-start-auto">{action}</div> : null}
    </article>
  )
}
