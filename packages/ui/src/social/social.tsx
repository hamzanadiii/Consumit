'use client'

import type { ComponentProps, ReactNode } from 'react'

import { Button } from '../button/button'
import { Avatar, MemberByline, type PresenceState } from '../identity/identity'
import { cn } from '../lib/cn'
import { ArtworkFrame, type ArtworkRatio } from '../media/media'
import { Badge, RatingDisplay } from '../signals/signals'

export type ActivityItemProps = Omit<ComponentProps<'article'>, 'children'> & {
  action?: ReactNode | undefined
  artworkAlt?: string | undefined
  artworkRatio?: ArtworkRatio | undefined
  artworkSrc?: string | undefined
  context: ReactNode
  detail?: ReactNode | undefined
  memberAvatarSrc?: string | undefined
  memberHref?: string | undefined
  memberName: string
  quote?: ReactNode | undefined
  rating?: number | undefined
  title: string
  titleHref?: string | undefined
}

export function ActivityItem({
  action,
  artworkAlt,
  artworkRatio = 'portrait',
  artworkSrc,
  className,
  context,
  detail,
  memberAvatarSrc,
  memberHref,
  memberName,
  quote,
  rating,
  title,
  titleHref,
  ...props
}: ActivityItemProps) {
  return (
    <article
      className={cn(
        'rounded-card border border-border bg-surface p-4 sm:p-5',
        className,
      )}
      data-consumit-activity-item
      {...props}
    >
      <MemberByline
        avatarSrc={memberAvatarSrc}
        href={memberHref}
        meta={context}
        name={memberName}
      />
      <div
        className={cn(
          'mt-5 grid gap-5',
          artworkRatio === 'portrait'
            ? 'sm:grid-cols-[7.5rem_1fr]'
            : 'sm:grid-cols-[minmax(10rem,0.8fr)_1fr]',
        )}
      >
        <ArtworkFrame
          alt={artworkAlt ?? `${title} artwork`}
          ratio={artworkRatio}
          src={artworkSrc}
        />
        <div className="flex min-w-0 flex-col justify-center">
          {rating === undefined ? null : <RatingDisplay value={rating} />}
          {titleHref ? (
            <a
              className="mt-2 font-display text-2xl leading-tight text-ink outline-none transition-colors hover:text-orange focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none"
              href={titleHref}
            >
              {title}
            </a>
          ) : (
            <h3 className="mt-2 font-display text-2xl leading-tight text-ink">
              {title}
            </h3>
          )}
          {detail ? <div className="mt-2 text-xs text-muted">{detail}</div> : null}
          {quote ? (
            <blockquote className="mt-4 font-display text-xl leading-snug text-copy">
              “{quote}”
            </blockquote>
          ) : null}
          {action ? <div className="mt-5">{action}</div> : null}
        </div>
      </div>
    </article>
  )
}

export type TrustedReactionProps = Omit<ComponentProps<'article'>, 'children'> & {
  avatarSrc?: string | undefined
  engagement?: ReactNode | undefined
  memberHref?: string | undefined
  memberName: string
  meta?: ReactNode | undefined
  quote: ReactNode
  rating: number
}

export function TrustedReaction({
  avatarSrc,
  className,
  engagement,
  memberHref,
  memberName,
  meta,
  quote,
  rating,
  ...props
}: TrustedReactionProps) {
  return (
    <article
      className={cn(
        'rounded-card border border-border bg-surface p-5 sm:p-6',
        className,
      )}
      data-consumit-trusted-reaction
      {...props}
    >
      <div className="flex items-start justify-between gap-4">
        <MemberByline
          avatarSrc={avatarSrc}
          href={memberHref}
          meta={meta}
          name={memberName}
        />
        <RatingDisplay value={rating} />
      </div>
      <blockquote className="mt-5 font-display text-xl leading-snug text-copy sm:text-2xl">
        “{quote}”
      </blockquote>
      {engagement ? (
        <div className="mt-6 text-xs text-muted">{engagement}</div>
      ) : null}
    </article>
  )
}

export type FriendRowProps = Omit<ComponentProps<'div'>, 'children'> & {
  actionLabel?: string | undefined
  avatarSrc?: string | undefined
  detail?: ReactNode | undefined
  following?: boolean | undefined
  href?: string | undefined
  name: string
  onAction?: (() => void) | undefined
  overlap: number
  status?: PresenceState | undefined
}

export function FriendRow({
  actionLabel,
  avatarSrc,
  className,
  detail,
  following = false,
  href,
  name,
  onAction,
  overlap,
  status,
  ...props
}: FriendRowProps) {
  const safeOverlap = Math.min(Math.max(Math.round(overlap), 0), 100)
  const resolvedActionLabel = actionLabel ?? (following ? 'Following' : 'Follow')

  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-3 border-b border-border py-4 last:border-b-0',
        className,
      )}
      data-consumit-friend-row
      {...props}
    >
      <Avatar name={name} size="md" src={avatarSrc} status={status} />
      <div className="min-w-0 flex-1">
        {href ? (
          <a
            className="text-sm font-bold text-ink outline-none hover:text-orange focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
            href={href}
          >
            {name}
          </a>
        ) : (
          <p className="text-sm font-bold text-ink">{name}</p>
        )}
        {status ? <span className="sr-only">{status}</span> : null}
        <p className="mt-1 text-xs text-lilac">{safeOverlap}% taste overlap</p>
        {detail ? <div className="mt-1 text-[0.6875rem] text-muted">{detail}</div> : null}
      </div>
      <Button
        aria-pressed={following}
        onClick={onAction}
        size="sm"
        variant={following ? 'ghost' : 'secondary'}
      >
        {resolvedActionLabel}
      </Button>
    </div>
  )
}

export type CommentCardProps = Omit<ComponentProps<'article'>, 'children'> & {
  avatarSrc?: string | undefined
  comment: ReactNode
  engagement?: ReactNode | undefined
  memberHref?: string | undefined
  memberName: string
  meta?: ReactNode | undefined
  roleLabel?: string | undefined
  spoilerHidden?: boolean | undefined
}

export function CommentCard({
  avatarSrc,
  className,
  comment,
  engagement,
  memberHref,
  memberName,
  meta,
  roleLabel,
  spoilerHidden = false,
  ...props
}: CommentCardProps) {
  const content = (
    <blockquote className="font-display text-xl leading-snug text-copy">
      “{comment}”
    </blockquote>
  )

  return (
    <article
      className={cn(
        'rounded-card border border-border bg-surface p-5 sm:p-6',
        className,
      )}
      data-consumit-comment-card
      {...props}
    >
      <div className="flex items-start gap-3">
        <MemberByline
          avatarSrc={avatarSrc}
          className="min-w-0 flex-1"
          href={memberHref}
          meta={meta}
          name={memberName}
        />
        {roleLabel ? <Badge tone="lilac">{roleLabel}</Badge> : null}
      </div>
      {spoilerHidden ? (
        <details className="group mt-5">
          <summary className="cursor-pointer list-none rounded-control border border-control-outline px-4 py-3 text-xs font-bold uppercase tracking-[0.08em] text-copy outline-none hover:border-ink/60 hover:text-ink focus-visible:ring-2 focus-visible:ring-orange">
            Reveal spoiler
          </summary>
          <div className="mt-4">{content}</div>
        </details>
      ) : (
        <div className="mt-5">{content}</div>
      )}
      {engagement ? (
        <div className="mt-6 text-xs text-muted">{engagement}</div>
      ) : null}
    </article>
  )
}
