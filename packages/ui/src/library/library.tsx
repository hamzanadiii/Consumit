import type { ComponentProps, ReactNode } from 'react'
import { Check, Search } from 'lucide-react'

import { Avatar, type AvatarGroupItem } from '../identity/identity'
import { cn } from '../lib/cn'
import { ArtworkFrame } from '../media/media'
import { Badge } from '../signals/signals'

export type LibraryToolbarProps = Omit<ComponentProps<'form'>, 'children'> & {
  controls?: ReactNode | undefined
  defaultQuery?: string | undefined
  filters?: ReactNode | undefined
  searchLabel?: string | undefined
  searchName?: string | undefined
}

export function LibraryToolbar({
  className,
  controls,
  defaultQuery,
  filters,
  searchLabel = 'Search inside your library',
  searchName = 'q',
  ...props
}: LibraryToolbarProps) {
  return (
    <form
      className={cn('flex flex-col gap-3 sm:flex-row sm:items-center', className)}
      data-consumit-library-toolbar
      role="search"
      {...props}
    >
      <label className="relative min-w-0 flex-1">
        <span className="sr-only">{searchLabel}</span>
        <Search aria-hidden="true" className="absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted" />
        <input
          className="h-11 w-full rounded-control border border-control-outline bg-field pr-4 pl-11 text-sm text-ink outline-none placeholder:text-muted focus-visible:border-orange focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
          defaultValue={defaultQuery}
          name={searchName}
          placeholder={searchLabel}
          type="search"
        />
      </label>
      {filters ? <div className="flex flex-wrap items-center gap-2">{filters}</div> : null}
      {controls ? <div className="flex flex-wrap items-center gap-2 sm:ml-auto">{controls}</div> : null}
    </form>
  )
}

export type SavedTitleCardProps = Omit<ComponentProps<'article'>, 'children'> & {
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
    <article className={cn('group min-w-0', className)} data-consumit-saved-title-card {...props}>
      <ArtworkFrame alt={`${title} poster`} src={artworkSrc}>
        {badge ? <div className="absolute top-3 left-3">{badge}</div> : null}
        {saved ? (
          <span className="absolute top-3 right-3 grid size-8 place-items-center rounded-full bg-canvas/85 text-orange">
            <Check aria-hidden="true" className="size-4" />
            <span className="sr-only">Saved</span>
          </span>
        ) : null}
        {safeProgress !== undefined ? (
          <span className="absolute inset-x-0 bottom-0 h-1 bg-surface-raised">
            <span className="block h-full bg-orange" style={{ width: `${safeProgress}%` }} />
            <span className="sr-only">{safeProgress}% watched</span>
          </span>
        ) : null}
      </ArtworkFrame>
      <div className="mt-3 min-w-0">
        {href ? (
          <a className="font-bold text-ink outline-none transition-colors hover:text-orange focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none" href={href}>{title}</a>
        ) : (
          <h3 className="text-sm font-bold text-ink">{title}</h3>
        )}
        <div className="mt-1 text-xs text-muted">{meta}</div>
        {signal ? <div className="mt-2 text-xs text-copy">{signal}</div> : null}
        {footer ? <div className="mt-3">{footer}</div> : null}
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

export type Curator = AvatarGroupItem & {
  detail?: string | undefined
  role?: string | undefined
}

export type CuratorPanelProps = Omit<ComponentProps<'aside'>, 'children'> & {
  curators: readonly Curator[]
  description?: string | undefined
  tags?: readonly string[] | undefined
  title?: string | undefined
}

export function CuratorPanel({
  className,
  curators,
  description,
  tags = [],
  title = 'Curators',
  ...props
}: CuratorPanelProps) {
  return (
    <aside className={cn('rounded-card border border-border bg-surface p-5', className)} data-consumit-curator-panel {...props}>
      <h3 className="text-sm font-bold text-ink">{title}</h3>
      {description ? <p className="mt-3 text-xs leading-5 text-muted">{description}</p> : null}
      {curators.length > 0 ? (
        <div className="mt-5 space-y-4">
          {curators.map((curator, index) => (
            <div className="flex min-w-0 items-center gap-3" key={`${curator.name}-${index}`}>
              <Avatar name={curator.name} size="sm" src={curator.src} />
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-ink">{curator.name}</p>
                {curator.role || curator.detail ? <p className="mt-0.5 text-xs text-muted">{[curator.role, curator.detail].filter(Boolean).join(' · ')}</p> : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {tags.length > 0 ? (
        <ul className="mt-5 flex flex-wrap gap-2 border-t border-border pt-4">
          {tags.map((tag) => <li className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-muted" key={tag}>{tag}</li>)}
        </ul>
      ) : null}
    </aside>
  )
}
