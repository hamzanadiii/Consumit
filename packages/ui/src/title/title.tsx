import type { ComponentProps, ReactNode } from 'react'

import { cn } from '../lib/cn'
import { ArtworkFrame } from '../media/media'
import { ProgressRail, RatingDisplay } from '../signals/signals'

export type TitleMastheadProps = Omit<ComponentProps<'header'>, 'children'> & {
  actions?: ReactNode | undefined
  backgroundSrc?: string | undefined
  context?: string | undefined
  metadata: ReactNode
  socialProof?: ReactNode | undefined
  synopsis: string
  tasteReason?: string | undefined
  tasteScore?: number | undefined
  title: string
}

export function TitleMasthead({
  actions,
  backgroundSrc,
  className,
  context,
  metadata,
  socialProof,
  synopsis,
  tasteReason,
  tasteScore,
  title,
  ...props
}: TitleMastheadProps) {
  const safeScore = tasteScore === undefined ? undefined : Math.min(Math.max(Math.round(tasteScore), 0), 100)

  return (
    <header
      className={cn(
        'relative isolate overflow-hidden rounded-card border border-border bg-surface px-5 py-10 sm:px-8 lg:min-h-[31rem] lg:px-10 lg:py-14',
        className,
      )}
      data-consumit-title-masthead
      {...props}
    >
      {backgroundSrc ? (
        <img alt="" className="absolute inset-0 -z-20 size-full object-cover" src={backgroundSrc} />
      ) : null}
      <span aria-hidden="true" className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(9,9,11,.98)_0%,rgba(9,9,11,.84)_48%,rgba(9,9,11,.16)_100%)]" />
      <div className="max-w-2xl">
        {context ? (
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-copy">{context}</p>
        ) : null}
        <h2 className="mt-5 text-balance font-display text-[clamp(2.75rem,7vw,5.5rem)] leading-[0.9] tracking-[-0.025em] text-ink">
          {title}
        </h2>
        <div className="mt-5 text-sm text-copy">{metadata}</div>
        <p className="mt-5 max-w-[60ch] text-sm leading-6 text-copy">{synopsis}</p>
        {actions ? <div className="mt-6 flex flex-wrap gap-2">{actions}</div> : null}
        {safeScore !== undefined ? (
          <div className="mt-7 flex max-w-xl items-start gap-4 border-t border-border pt-5">
            <div className="shrink-0 border-l border-orange pl-3">
              <span className="block font-display text-3xl leading-none tabular-nums text-ink">{safeScore}%</span>
              <span className="mt-1 block text-[0.625rem] font-bold uppercase tracking-[0.12em] text-orange">Taste match</span>
            </div>
            {tasteReason ? <p className="text-xs leading-5 text-muted">{tasteReason}</p> : null}
          </div>
        ) : null}
      </div>
      {socialProof ? <div className="mt-8 max-w-md lg:absolute lg:right-8 lg:bottom-8 lg:mt-0">{socialProof}</div> : null}
    </header>
  )
}

export type MemberPulseProps = Omit<ComponentProps<'aside'>, 'children'> & {
  count: string
  distribution?: readonly number[] | undefined
  value: number
}

export function MemberPulse({
  className,
  count,
  distribution = [12, 28, 52, 76, 100, 66, 48, 32],
  value,
  ...props
}: MemberPulseProps) {
  const safeValue = Math.min(Math.max(value, 0), 5)

  return (
    <aside
      aria-label={`Member rating ${safeValue.toFixed(1)} out of 5 from ${count}`}
      className={cn('rounded-card border border-border bg-surface p-5', className)}
      data-consumit-member-pulse
      {...props}
    >
      <h3 className="text-sm font-bold text-ink">Member pulse</h3>
      <div className="mt-3 flex items-end gap-4">
        <span className="font-display text-5xl leading-none tabular-nums text-ink">{safeValue.toFixed(1)}</span>
        <div className="pb-1">
          <RatingDisplay value={safeValue} />
          <p className="mt-1 text-[0.6875rem] text-muted">{count}</p>
        </div>
      </div>
      <div aria-hidden="true" className="mt-6 flex h-20 items-end gap-2">
        {distribution.map((height, index) => (
          <span
            className={cn('min-w-2 flex-1 bg-orange', index !== Math.floor(distribution.length / 2) && 'opacity-45')}
            key={`${height}-${index}`}
            style={{ height: `${Math.min(Math.max(height, 8), 100)}%` }}
          />
        ))}
      </div>
    </aside>
  )
}

export type CastCardProps = Omit<ComponentProps<'article'>, 'children'> & {
  character?: string | undefined
  href?: string | undefined
  imageSrc?: string | undefined
  name: string
  role?: string | undefined
}

export function CastCard({
  character,
  className,
  href,
  imageSrc,
  name,
  role,
  ...props
}: CastCardProps) {
  return (
    <article className={cn('group min-w-0', className)} data-consumit-cast-card {...props}>
      <div className="grid aspect-[4/5] place-items-center overflow-hidden rounded-card border border-border bg-surface">
        {imageSrc ? (
          <img alt={`${name} portrait`} className="size-full object-cover" loading="lazy" src={imageSrc} />
        ) : (
          <div aria-hidden="true" className="relative size-full overflow-hidden">
            <span className="absolute top-[13%] left-1/2 size-[42%] -translate-x-1/2 rounded-full bg-[linear-gradient(135deg,#e29a72_0_48%,#382c43_49%_100%)]" />
            <span className="absolute inset-x-[20%] bottom-0 h-[45%] rounded-t-full bg-surface-raised" />
          </div>
        )}
      </div>
      {href ? (
        <a className="mt-3 block truncate text-sm font-bold text-ink outline-none hover:text-orange focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 focus-visible:ring-offset-canvas" href={href}>
          {name}
        </a>
      ) : (
        <h3 className="mt-3 truncate text-sm font-bold text-ink">{name}</h3>
      )}
      {character || role ? <p className="mt-1 truncate text-xs text-muted">{character ?? role}</p> : null}
    </article>
  )
}

export type SeasonOption = {
  label: string
  value: string
}

export type SeasonSelectorProps = Omit<ComponentProps<'select'>, 'children' | 'onChange'> & {
  label?: string | undefined
  onValueChange?: ((value: string) => void) | undefined
  options: readonly SeasonOption[]
}

export function SeasonSelector({
  className,
  label = 'Season',
  onValueChange,
  options,
  ...props
}: SeasonSelectorProps) {
  return (
    <label className="inline-flex items-center gap-3 text-sm font-bold text-ink">
      <span>{label}</span>
      <select
        className={cn(
          'h-11 rounded-control border border-control-outline bg-surface px-3 text-sm text-ink outline-none focus-visible:border-orange focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
          className,
        )}
        data-consumit-season-selector
        onChange={(event) => onValueChange?.(event.currentTarget.value)}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  )
}

export type EpisodeRowProps = Omit<ComponentProps<'article'>, 'children'> & {
  action?: ReactNode | undefined
  artworkSrc?: string | undefined
  description?: string | undefined
  episode: string
  meta: string
  progress?: number | undefined
  status?: string | undefined
  title: string
}

export function EpisodeRow({
  action,
  artworkSrc,
  className,
  description,
  episode,
  meta,
  progress,
  status,
  title,
  ...props
}: EpisodeRowProps) {
  return (
    <article
      className={cn('grid min-w-0 gap-4 rounded-card border border-border bg-surface p-3 sm:grid-cols-[9rem_1fr_auto] sm:items-center', className)}
      data-consumit-episode-row
      {...props}
    >
      <ArtworkFrame alt={`${title} episode still`} ratio="landscape" src={artworkSrc} />
      <div className="min-w-0">
        <p className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-orange">{status ?? episode}</p>
        <h3 className="mt-1 font-display text-2xl leading-tight text-ink">{title}</h3>
        <p className="mt-1 text-xs text-muted">{meta}</p>
        {description ? <p className="mt-2 text-xs leading-5 text-copy">{description}</p> : null}
        {progress !== undefined ? <ProgressRail className="mt-3 max-w-64" label={`${title} watched`} value={progress} /> : null}
      </div>
      {action ? <div className="sm:ml-3">{action}</div> : null}
    </article>
  )
}
