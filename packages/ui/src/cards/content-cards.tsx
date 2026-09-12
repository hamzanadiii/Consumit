import type { ComponentProps, ElementType, ReactNode } from 'react'
import { Bookmark, Check } from 'lucide-react'

import {
  Avatar,
  AvatarGroup,
  type AvatarGroupItem,
} from '../identity/identity'
import { cn } from '../lib/cn'
import {
  ArtworkFrame,
  LandscapeStill,
  MissingArtwork,
} from '../media/media'
import { Badge, RatingDisplay } from '../signals/signals'

export type ContentCardState = 'default' | 'saved' | 'watched'

export type ContentCardProps = Omit<ComponentProps<'article'>, 'children'> & {
  action?: ReactNode | undefined
  alt?: string | undefined
  artworkSrc?: string | undefined
  badge?: ReactNode | undefined
  friends?: readonly AvatarGroupItem[] | undefined
  href?: string | undefined
  linkComponent?: ElementType | undefined
  meta?: ReactNode | undefined
  signal?: ReactNode | undefined
  state?: ContentCardState | undefined
  title: string
}

export function ContentCard({
  action,
  alt,
  artworkSrc,
  badge,
  className,
  friends,
  href,
  linkComponent: LinkComponent = 'a',
  meta,
  signal,
  state = 'default',
  title,
  ...props
}: ContentCardProps) {
  return (
    <article
      className={cn('group relative min-w-0', className)}
      data-consumit-content-card
      data-state={state}
      {...props}
    >
      {href ? (
        <LinkComponent
          aria-hidden="true"
          className="absolute inset-0 outline-none"
          href={href}
          tabIndex={-1}
        />
      ) : null}
      <ArtworkFrame alt={alt ?? `${title} poster`} src={artworkSrc}>
        {badge ? <div className="absolute top-3 left-3">{badge}</div> : null}
        {state === 'watched' || state === 'saved' || action ? (
          <div className="absolute top-3 right-3 z-10 flex flex-col items-end gap-2">
            {state === 'watched' ? (
              <Badge tone="lime">
                <Check aria-hidden="true" className="mr-1 size-3" /> Watched
              </Badge>
            ) : null}
            {state === 'saved' && !action ? (
              <span className="grid size-8 place-items-center rounded-full bg-canvas/85 text-orange">
                <Bookmark aria-hidden="true" className="size-4 fill-current" />
                <span className="sr-only">Saved</span>
              </span>
            ) : null}
            {action}
          </div>
        ) : null}
        {friends && friends.length > 0 ? (
          <AvatarGroup
            className="absolute right-3 bottom-3"
            items={friends}
            label={`${friends.length} people in your circle connected to ${title}`}
            max={3}
          />
        ) : null}
      </ArtworkFrame>
      <div className="mt-3 min-w-0">
        {href ? (
            <LinkComponent
              className="mt-1 flex min-h-11 items-center font-display text-xl leading-tight text-ink outline-none transition-colors hover:text-orange focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none"
              href={href}
            >
            {title}
          </LinkComponent>
        ) : (
          <h3 className="font-interface text-sm font-bold text-ink">{title}</h3>
        )}
        {meta ? <div className="mt-1 text-xs text-muted">{meta}</div> : null}
        {signal ? <div className="mt-2 text-xs text-copy">{signal}</div> : null}
      </div>
    </article>
  )
}

export type ContinueCardProps = Omit<ComponentProps<'article'>, 'children'> & {
  alt?: string | undefined
  artworkSrc?: string | undefined
  href: string
  layout?: 'compact' | 'stacked' | undefined
  meta: ReactNode
  progress: number
  title: string
}

export function ContinueCard({
  alt,
  artworkSrc,
  className,
  href,
  layout = 'stacked',
  meta,
  progress,
  title,
  ...props
}: ContinueCardProps) {
  return (
    <article
      className={cn(
        'group min-w-0',
        layout === 'compact' && 'grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-4',
        className,
      )}
      data-consumit-continue-card
      data-layout={layout}
      {...props}
    >
      <LandscapeStill
        alt={alt ?? `${title} still`}
        playHref={href}
        playLabel={`Continue ${title}`}
        progress={progress}
        src={artworkSrc}
      />
      <div className="min-w-0">
        <a
          className={cn(
            'inline-flex min-h-11 items-center text-sm font-bold text-ink outline-none transition-colors hover:text-orange focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none',
            layout === 'stacked' && 'mt-1',
          )}
          href={href}
        >
          {title}
        </a>
        <div className="text-xs leading-5 text-muted">{meta}</div>
      </div>
    </article>
  )
}

export type TrendingCardProps = Omit<ComponentProps<'article'>, 'children'> & {
  action?: ReactNode | undefined
  alt?: string | undefined
  artworkSrc?: string | undefined
  completionProof?: string | undefined
  href?: string | undefined
  linkComponent?: ElementType | undefined
  memberScore?: number | undefined
  meta?: string | undefined
  rank: number
  title: string
}

export function TrendingCard({
  action,
  alt,
  artworkSrc,
  className,
  completionProof,
  href,
  linkComponent: LinkComponent = 'a',
  memberScore,
  meta,
  rank,
  title,
  ...props
}: TrendingCardProps) {
  return (
    <article
      className={cn('group relative min-w-0', className)}
      data-consumit-trending-card
      {...props}
    >
      {href ? (
        <LinkComponent
          aria-hidden="true"
          className="absolute inset-0 outline-none"
          href={href}
          tabIndex={-1}
        />
      ) : null}
      <span className="sr-only">Rank {rank}</span>
      <div
        className="relative min-w-0 pl-10 sm:pl-12"
        data-consumit-trending-poster
      >
        <span
          aria-hidden="true"
          className="absolute top-1/2 left-2 -translate-y-1/2 font-display text-[6.25rem] leading-[0.76] text-ink/15"
          data-consumit-trending-rank
        >
          {rank}
        </span>
        <ArtworkFrame
          alt={alt ?? `${title} poster`}
          className="relative"
          src={artworkSrc}
        >
          {memberScore === undefined ? null : (
            <Badge className="absolute top-3 left-3" tone="neutral">
              {memberScore.toFixed(1)} member
            </Badge>
          )}
          {action ? <div className="absolute top-3 right-3 z-10">{action}</div> : null}
        </ArtworkFrame>
      </div>
      <div className="min-w-0 pl-10 sm:pl-12">
        {href ? (
          <LinkComponent
            className="mt-1 inline-flex min-h-11 items-center text-sm font-bold text-ink outline-none hover:text-orange focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            href={href}
          >
            {title}
          </LinkComponent>
        ) : (
          <h3 className="mt-3 text-sm font-bold text-ink">{title}</h3>
        )}
        {completionProof ? <p className="mt-1 text-xs text-muted">{completionProof}</p> : null}
        {meta ? <p className="mt-1 text-xs text-muted">{meta}</p> : null}
      </div>
    </article>
  )
}

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
            {curator}&apos;s list
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

export function ContentRating({ value }: { value: number }) {
  return <RatingDisplay value={value} />
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
      <ArtworkFrame alt={`${title} poster`} src={artworkSrc}>
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
          <div className="absolute top-3 right-3 z-10 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none">
            {bookmark}
          </div>
        ) : null}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-[linear-gradient(180deg,transparent_0%,rgba(9,9,11,0.72)_55%,rgba(9,9,11,0.94)_100%)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 motion-reduce:transition-none"
        />
        <div className="absolute inset-x-0 bottom-0 translate-y-2 p-4 opacity-0 transition-[opacity,transform] group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100 motion-reduce:transition-none">
          {titleHref ? (
            <LinkComponent
              className="font-bold text-ink outline-none transition-colors hover:text-orange focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none"
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
                <span aria-hidden="true" className="text-orange">★</span>
                <span className="sr-only">Rated {rating.toFixed(1)} out of 10.</span>
                <span aria-hidden="true">{rating.toFixed(1)}</span>
              </span>
            )}
          </p>
        </div>
      </ArtworkFrame>
    </article>
  )
}
