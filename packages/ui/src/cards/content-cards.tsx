import type { ComponentProps, ReactNode } from 'react'
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
  alt?: string | undefined
  artworkSrc?: string | undefined
  badge?: ReactNode | undefined
  friends?: readonly AvatarGroupItem[] | undefined
  href?: string | undefined
  meta?: ReactNode | undefined
  signal?: ReactNode | undefined
  state?: ContentCardState | undefined
  title: string
}

export function ContentCard({
  alt,
  artworkSrc,
  badge,
  className,
  friends,
  href,
  meta,
  signal,
  state = 'default',
  title,
  ...props
}: ContentCardProps) {
  return (
    <article
      className={cn('group min-w-0', className)}
      data-consumit-content-card
      data-state={state}
      {...props}
    >
      <ArtworkFrame alt={alt ?? `${title} poster`} src={artworkSrc}>
        {badge ? <div className="absolute top-3 left-3">{badge}</div> : null}
        {state === 'watched' ? (
          <Badge className="absolute top-3 right-3" tone="lime">
            <Check aria-hidden="true" className="mr-1 size-3" /> Watched
          </Badge>
        ) : null}
        {state === 'saved' ? (
          <span
            className="absolute top-3 right-3 grid size-8 place-items-center rounded-full bg-canvas/85 text-orange"
          >
            <Bookmark aria-hidden="true" className="size-4 fill-current" />
            <span className="sr-only">Saved</span>
          </span>
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
          <a
            className="inline-flex min-h-11 items-center font-bold text-ink outline-none transition-colors hover:text-orange focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none"
            href={href}
          >
            {title}
          </a>
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
  alt?: string | undefined
  artworkSrc?: string | undefined
  completionProof: string
  href?: string | undefined
  memberScore: number
  rank: number
  title: string
}

export function TrendingCard({
  alt,
  artworkSrc,
  className,
  completionProof,
  href,
  memberScore,
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
      <span className="sr-only">Rank {rank}</span>
      <div
        className="relative min-w-0 pl-10 sm:pl-12"
        data-consumit-trending-poster
      >
        <span
          aria-hidden="true"
          className="absolute top-1/2 left-2 -translate-y-1/2 font-display text-[6.25rem] leading-[0.76] text-surface-raised"
          data-consumit-trending-rank
        >
          {rank}
        </span>
        <ArtworkFrame
          alt={alt ?? `${title} poster`}
          className="relative z-10"
          src={artworkSrc}
        >
          <Badge className="absolute top-3 left-3" tone="neutral">
            {memberScore.toFixed(1)} member
          </Badge>
        </ArtworkFrame>
      </div>
      <div className="min-w-0 pl-10 sm:pl-12">
        {href ? (
          <a
            className="mt-1 inline-flex min-h-11 items-center text-sm font-bold text-ink outline-none hover:text-orange focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            href={href}
          >
            {title}
          </a>
        ) : (
          <h3 className="mt-3 text-sm font-bold text-ink">{title}</h3>
        )}
        <p className="mt-1 text-xs text-muted">{completionProof}</p>
      </div>
    </article>
  )
}

export type CuratedListCardProps = Omit<ComponentProps<'article'>, 'children'> & {
  artworkSources: readonly (string | undefined)[]
  curator: string
  curatorAvatarSrc?: string | undefined
  href?: string | undefined
  saves: string
  title: string
}

export function CuratedListCard({
  artworkSources,
  className,
  curator,
  curatorAvatarSrc,
  href,
  saves,
  title,
  ...props
}: CuratedListCardProps) {
  return (
    <article
      className={cn(
        'group overflow-hidden rounded-card border border-border bg-surface p-4',
        className,
      )}
      data-consumit-curated-list-card
      {...props}
    >
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
          <p className="mt-2 text-xs text-muted">{saves} saves</p>
        </div>
        <Avatar name={curator} size="sm" src={curatorAvatarSrc} />
      </div>
    </article>
  )
}

export function ContentRating({ value }: { value: number }) {
  return <RatingDisplay value={value} />
}
