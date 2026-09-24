import type { ComponentProps, ElementType, ReactNode } from 'react'
import { Star } from 'lucide-react'

import { Avatar } from '../identity/identity'
import { cn } from '../lib/cn'
import {
  ArtworkFrame,
  MissingArtwork,
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
        'group relative overflow-hidden rounded-card border border-border bg-surface p-4',
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
      <div className="grid grid-cols-4 gap-1.5 overflow-hidden rounded-control">
        {artworkSources.slice(0, 4).map((src, index) => (
          <div className="aspect-[2/3] overflow-hidden" key={`${src ?? 'missing'}-${index}`}>
            {src ? (
              <img
                alt=""
                className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none"
                loading="lazy"
                src={src}
              />
            ) : (
              <MissingArtwork label="List artwork unavailable" />
            )}
          </div>
        ))}
      </div>
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
  artworkSrc?: string | undefined
  bookmark?: ReactNode | undefined
  href: string
  linkComponent?: ElementType | undefined
  meta?: ReactNode | undefined
  rating?: number | null | undefined
  title: string
  titleHref?: string | undefined
}

export function WatchCard({
  artworkSrc,
  bookmark,
  className,
  href,
  linkComponent: LinkComponent = 'a',
  meta,
  rating,
  title,
  titleHref = href,
  ...props
}: WatchCardProps) {
  return (
    <article
      className={cn('group relative min-w-0', className)}
      data-consumit-watch-card
      {...props}
    >
      <ArtworkFrame
        alt={`${title} poster`}
        className="transition-all duration-200 group-hover:border-orange group-hover:ring-1 group-hover:ring-orange/60 group-focus-within:border-orange group-focus-within:ring-1 group-focus-within:ring-orange/60"
        src={artworkSrc}
      >
        {titleHref ? (
          <LinkComponent
            aria-hidden="true"
            className="absolute inset-0 outline-none"
            href={titleHref}
            tabIndex={-1}
          />
        ) : null}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-canvas/60 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none"
        />
        {bookmark ? (
          <div className="absolute top-3 right-3 z-10 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none [@media(hover:none)]:opacity-100">
            {bookmark}
          </div>
        ) : null}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-[linear-gradient(180deg,transparent_0%,rgba(9,9,11,0.72)_55%,rgba(9,9,11,0.94)_100%)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none"
        />
      </ArtworkFrame>
        <div className="pt-3">
          {titleHref ? (
            <LinkComponent
              className="block truncate py-1 font-bold text-ink outline-none transition-colors hover:text-orange focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none"
              href={titleHref}
            >
              {title}
            </LinkComponent>
          ) : (
            <h3 className="font-interface text-sm font-bold text-ink">{title}</h3>
          )}
          <p className="mt-1 flex items-center gap-2 text-xs text-muted">
            {meta ? <span>{meta}</span> : null}
            {rating === undefined || rating === null ? null : (
              <span className="inline-flex items-center gap-1">
                <Star aria-hidden="true" className="size-3 fill-orange text-orange" />
                <span className="sr-only">Rated {rating.toFixed(1)} out of 10.</span>
                <span aria-hidden="true">{rating.toFixed(1)}</span>
              </span>
            )}
          </p>
        </div>
    </article>
  )
}
