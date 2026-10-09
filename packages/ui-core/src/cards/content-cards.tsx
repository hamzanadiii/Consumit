import type { ComponentProps, ElementType, ReactNode } from 'react'
import { Check, Star } from 'lucide-react'

import { Avatar } from '../identity/identity'
import { cn } from '../lib/cn'
import {
  ArtworkFrame,
  PosterStack,
} from '../media/media'

export type CuratedListCardProps = Omit<ComponentProps<'article'>, 'children'> & {
  artworkSources: readonly (string | undefined)[]
  curator: string
  curatorAvatarSrc?: string | undefined
  href?: string | undefined
  meta?: string | undefined
  saves?: string | undefined
  title: string
}

export function CuratedListCard({
  artworkSources,
  className,
  curator,
  curatorAvatarSrc,
  href,
  meta,
  saves,
  title,
  ...props
}: CuratedListCardProps) {
  return (
    <article
      className={cn(
        'group relative min-w-0 border-b border-border pb-5',
        className,
      )}
      data-consumit-curated-list-card
      {...props}
    >
      {href ? (
        <a
          aria-hidden="true"
          className="absolute inset-0 outline-none"
          href={href}
          tabIndex={-1}
        />
      ) : null}
      <PosterStack className="pointer-events-none" items={artworkSources.map((src, index) => ({ key: String(index), label: '', src }))} />
      <div className="mt-4 flex items-end gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[0.625rem] font-bold uppercase tracking-[0.1em] text-orange">
            {curator === 'You' ? 'Your list' : `${curator}'s list`}
          </p>
          {href ? (
            <a
              className="mt-1 flex min-h-11 items-center font-display text-xl leading-tight text-ink outline-none transition-colors hover:text-orange focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none"
              href={href}
            >
              {title}
            </a>
          ) : (
            <h3 className="mt-1 font-display text-xl leading-tight text-ink">
              {title}
            </h3>
          )}
          {meta || saves ? <p className="mt-2 text-xs text-muted">{meta ?? `${saves} saves`}</p> : null}
        </div>
        <Avatar name={curator} size="sm" src={curatorAvatarSrc} />
      </div>
    </article>
  )
}

export type WatchCardProps = Omit<ComponentProps<'article'>, 'children'> & {
  action?: ReactNode | undefined
  badge?: ReactNode | undefined
  artworkSrc?: string | undefined
  bookmark?: ReactNode | undefined
  footer?: ReactNode | undefined
  href?: string | undefined
  linkComponent?: ElementType | undefined
  meta?: ReactNode | undefined
  progress?: number | undefined
  rating?: number | null | undefined
  saved?: boolean | undefined
  signal?: ReactNode | undefined
  title: string
  titleHref?: string | undefined
}

export function WatchCard({
  artworkSrc,
  action,
  badge,
  bookmark,
  className,
  footer,
  href,
  linkComponent: LinkComponent = 'a',
  meta,
  progress,
  rating,
  saved = false,
  signal,
  title,
  titleHref = href,
  ...props
}: WatchCardProps) {
  const safeProgress = progress === undefined ? undefined : Math.min(Math.max(progress, 0), 100)
  const titleDestination = titleHref ?? href
  const cornerAction = action ?? bookmark

  return (
    <article
      className={cn('group relative min-w-0', className)}
      data-consumit-watch-card
      {...props}
    >
      <ArtworkFrame
        alt={`${title} poster`}
        className="consumit-poster-frame transition-[border-color,box-shadow] duration-150 group-hover:border-orange group-focus-within:border-orange group-focus-within:ring-2 group-focus-within:ring-orange motion-reduce:transition-none"
        src={artworkSrc}
      >
        {badge ? <div className="absolute top-3 left-3 z-10">{badge}</div> : null}
        {saved && !cornerAction ? (
          <span className="absolute top-3 right-3 z-10 grid size-8 place-items-center rounded-full bg-canvas/85 text-orange">
            <Check aria-hidden="true" className="size-4" />
            <span className="sr-only">Saved</span>
          </span>
        ) : null}
        {cornerAction ? (
          <div className="absolute top-3 right-3 z-10 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none [@media(hover:none)]:opacity-100">
            {cornerAction}
          </div>
        ) : null}
        {titleDestination ? (
          <LinkComponent
            aria-label={title}
            className="absolute inset-0 z-[1] outline-none"
            href={titleDestination}
          >
            <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-3 pt-8 pb-3 text-left opacity-0 outline-none transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100 motion-reduce:transition-none [@media(hover:none)]:opacity-100">
              <span className="block truncate text-sm font-bold text-white">{title}</span>
              <span className="mt-1 flex items-center gap-1.5 text-xs tabular-nums text-white/80">
                {meta ? <span className="truncate">{meta}</span> : null}
                {rating === undefined || rating === null ? null : (
                  <span className="inline-flex shrink-0 items-center gap-1 font-bold text-white">
                    <Star aria-hidden="true" className="size-3 fill-current" />
                    {rating.toFixed(1)}
                    <span className="sr-only">out of 10</span>
                  </span>
                )}
              </span>
            </span>
          </LinkComponent>
        ) : (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-3 pt-8 pb-3 opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none [@media(hover:none)]:opacity-100">
            <span className="block truncate text-sm font-bold text-white">{title}</span>
            <span className="mt-1 flex items-center gap-1.5 text-xs tabular-nums text-white/80">
              {meta ? <span className="truncate">{meta}</span> : null}
              {rating === undefined || rating === null ? null : (
                <span className="inline-flex shrink-0 items-center gap-1 font-bold text-white">
                  <Star aria-hidden="true" className="size-3 fill-current" />
                  {rating.toFixed(1)}
                </span>
              )}
            </span>
          </div>
        )}
        {safeProgress !== undefined ? (
          <span className="pointer-events-none absolute inset-x-0 bottom-0 z-20 h-1 bg-surface-raised">
            <span className="block h-full bg-orange" style={{ width: `${safeProgress}%` }} />
            <span className="sr-only">{safeProgress}% watched</span>
          </span>
        ) : null}
      </ArtworkFrame>
      {signal ? <div className="mt-2 text-xs text-copy">{signal}</div> : null}
      {footer ? <div className="relative z-10 mt-3">{footer}</div> : null}
    </article>
  )
}
