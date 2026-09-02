import type { ComponentProps, ReactNode } from 'react'

import { Avatar, AvatarGroup, type AvatarGroupItem } from '../identity/identity'
import { cn } from '../lib/cn'
import { ArtworkFrame } from '../media/media'
import { RatingDisplay } from '../signals/signals'

export type ProfileStat = {
  label: string
  value: string | number
}

export type ProfileMastheadProps = Omit<ComponentProps<'header'>, 'children'> & {
  actions?: ReactNode | undefined
  avatarSrc?: string | undefined
  backgroundSrc?: string | undefined
  bio?: string | undefined
  handle: string
  joined?: string | undefined
  location?: string | undefined
  name: string
  stats?: readonly ProfileStat[] | undefined
  status?: 'away' | 'offline' | 'online' | undefined
}

export function ProfileMasthead({
  actions,
  avatarSrc,
  backgroundSrc,
  bio,
  className,
  handle,
  joined,
  location,
  name,
  stats = [],
  status,
  ...props
}: ProfileMastheadProps) {
  const context = [handle, location, joined].filter(Boolean).join(' · ')

  return (
    <header
      className={cn(
        'relative isolate overflow-hidden rounded-card border border-border bg-surface px-5 py-8 sm:px-8 lg:min-h-80 lg:px-10 lg:py-12',
        className,
      )}
      data-consumit-profile-masthead
      {...props}
    >
      {backgroundSrc ? (
        <img
          alt=""
          className="absolute inset-0 -z-20 size-full object-cover opacity-65"
          src={backgroundSrc}
        />
      ) : null}
      <span
        aria-hidden="true"
        className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(9,9,11,.96)_0%,rgba(9,9,11,.76)_55%,rgba(9,9,11,.28)_100%)]"
      />

      <div className="flex min-w-0 flex-col gap-6 lg:absolute lg:inset-x-10 lg:bottom-10 lg:flex-row lg:items-end">
        <Avatar
          decorative={false}
          name={name}
          size="xl"
          src={avatarSrc}
          status={status}
        />
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-4xl leading-none tracking-[-0.025em] text-ink sm:text-5xl">
            {name}
          </h2>
          <p className="mt-2 text-xs text-muted">{context}</p>
          {bio ? <p className="mt-4 max-w-[58ch] text-sm leading-6 text-copy">{bio}</p> : null}
          {stats.length > 0 ? (
            <dl className="mt-5 flex flex-wrap gap-x-6 gap-y-2">
              {stats.map((stat) => (
                <div className="flex items-baseline gap-1.5" key={stat.label}>
                  <dt className="order-2 text-xs text-muted">{stat.label}</dt>
                  <dd className="order-1 text-sm font-bold tabular-nums text-ink">
                    {stat.value}
                  </dd>
                </div>
              ))}
            </dl>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
      </div>
    </header>
  )
}

export type CompatibilityPanelProps = Omit<ComponentProps<'aside'>, 'children'> & {
  detail?: string | undefined
  items?: readonly AvatarGroupItem[] | undefined
  memberName: string
  mutuals?: string | undefined
  reason: string
  score: number
}

export function CompatibilityPanel({
  className,
  detail,
  items = [],
  memberName,
  mutuals,
  reason,
  score,
  ...props
}: CompatibilityPanelProps) {
  const safeScore = Math.min(Math.max(Math.round(score), 0), 100)

  return (
    <aside
      aria-label={`Taste compatibility with ${memberName}`}
      className={cn('rounded-card border border-border bg-surface p-5', className)}
      data-consumit-compatibility-panel
      {...props}
    >
      <p className="text-xs font-bold uppercase tracking-[0.12em] text-orange">
        You + {memberName}
      </p>
      <p className="mt-4 flex flex-wrap items-baseline gap-2">
        <span className="font-display text-5xl leading-none tabular-nums text-ink">
          {safeScore}%
        </span>
        <span className="text-sm font-bold text-copy">taste overlap</span>
      </p>
      <p className="mt-4 max-w-[46ch] text-sm leading-6 text-muted">{reason}</p>
      {items.length > 0 || mutuals ? (
        <div className="mt-5 flex items-center gap-3 border-t border-border pt-4">
          {items.length > 0 ? (
            <AvatarGroup items={items} label={mutuals ?? 'Mutual connections'} />
          ) : null}
          {mutuals ? <p className="text-xs text-muted">{mutuals}</p> : null}
        </div>
      ) : null}
      {detail ? <p className="mt-3 text-xs text-copy">{detail}</p> : null}
    </aside>
  )
}

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
            className="font-bold text-ink outline-none transition-colors hover:text-orange focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none"
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

export type TasteWorld = {
  label: string
  tone?: 'lime' | 'lilac' | 'orange' | undefined
}

const worldToneClasses = {
  lime: 'bg-lime',
  lilac: 'bg-lilac',
  orange: 'bg-orange',
} as const

export type TasteSignatureProps = Omit<ComponentProps<'aside'>, 'children'> & {
  detail?: string | undefined
  statement: string
  worlds?: readonly TasteWorld[] | undefined
}

export function TasteSignature({
  className,
  detail,
  statement,
  worlds = [],
  ...props
}: TasteSignatureProps) {
  return (
    <aside
      className={cn('rounded-card border border-border bg-surface p-5', className)}
      data-consumit-taste-signature
      {...props}
    >
      <h3 className="text-sm font-bold text-ink">Taste signature</h3>
      <p className="mt-4 font-display text-2xl leading-[1.05] text-copy">{statement}</p>
      {worlds.length > 0 ? (
        <div className="mt-5">
          <p className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-muted">
            Most-loved worlds
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {worlds.map((world) => (
              <li
                className="inline-flex min-h-8 items-center gap-2 rounded-control border border-border bg-surface-raised px-3 text-xs text-copy"
                key={world.label}
              >
                <span
                  aria-hidden="true"
                  className={cn('size-2 rounded-full', worldToneClasses[world.tone ?? 'orange'])}
                />
                {world.label}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {detail ? <p className="mt-5 border-t border-border pt-4 text-xs leading-5 text-muted">{detail}</p> : null}
    </aside>
  )
}
