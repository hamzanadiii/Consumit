import type { ComponentProps, ReactNode } from 'react'
import { Check, Minus, Plus } from 'lucide-react'

import { Button } from '../button/button'
import { Avatar } from '../identity/identity'
import { cn } from '../lib/cn'
import { ArtworkFrame } from '../media/media'
import { ProgressRail } from '../signals/signals'

export type OnboardingHeaderProps = Omit<ComponentProps<'header'>, 'children'> & {
  brandSrc?: string | undefined
  current: number
  homeHref?: string | undefined
  skipHref?: string | undefined
  total: number
}

export function OnboardingHeader({
  brandSrc = '/assets/consumit-mark.svg',
  className,
  current,
  homeHref = '/',
  skipHref,
  total,
  ...props
}: OnboardingHeaderProps) {
  const safeTotal = Math.max(Math.round(total), 1)
  const safeCurrent = Math.min(Math.max(Math.round(current), 1), safeTotal)

  return (
    <header
      className={cn('flex min-h-20 items-center gap-3 border-b border-border bg-nav px-4 sm:gap-5 sm:px-8', className)}
      data-consumit-onboarding-header
      {...props}
    >
      <a aria-label="Consumit home" className="flex min-h-11 items-center gap-3 rounded-control text-ink outline-none focus-visible:ring-2 focus-visible:ring-orange" href={homeHref}>
        <img alt="" className="size-9" src={brandSrc} />
        <span className="hidden text-sm font-bold tracking-[0.18em] sm:inline">CONSUMIT</span>
      </a>
      <div className="ml-auto w-28 sm:w-56">
        <p className="text-[0.6875rem] uppercase tracking-[0.1em] text-muted">Onboarding · {safeCurrent} of {safeTotal}</p>
        <ProgressRail className="mt-2" label={`Onboarding step ${safeCurrent} of ${safeTotal}`} value={(safeCurrent / safeTotal) * 100} />
      </div>
      {skipHref ? (
        <a className="inline-flex min-h-11 shrink-0 items-center rounded-control px-1 text-xs text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-orange sm:px-2" href={skipHref}>
          <span className="sm:hidden">Skip</span>
          <span className="hidden sm:inline">Skip for now</span>
        </a>
      ) : null}
    </header>
  )
}

export type ImportOptionProps = Omit<ComponentProps<'article'>, 'children' | 'title'> & {
  action?: ReactNode | undefined
  benefits?: readonly string[] | undefined
  description: string
  icon?: 'minus' | 'plus' | undefined
  selected?: boolean | undefined
  title: string
}

export function ImportOption({
  action,
  benefits = [],
  className,
  description,
  icon = 'plus',
  selected = false,
  title,
  ...props
}: ImportOptionProps) {
  return (
    <article
      className={cn('rounded-card border bg-surface p-5 sm:p-6', selected ? 'border-orange' : 'border-border', className)}
      data-consumit-import-option
      data-selected={selected || undefined}
      {...props}
    >
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <span aria-hidden="true" className={cn('grid size-12 shrink-0 place-items-center rounded-control', selected ? 'bg-orange text-canvas' : 'border border-control-outline bg-surface-raised text-lilac')}>
          {icon === 'plus' ? <Plus className="size-6" /> : <Minus className="size-6" />}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold text-ink">{title}</h3>
          <p className="mt-2 text-xs leading-5 text-muted">{description}</p>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {benefits.length > 0 ? (
        <ul className="mt-5 grid gap-2 border-t border-border pt-5 sm:grid-cols-2">
          {benefits.map((benefit) => (
            <li className="flex items-center gap-2 text-xs text-copy" key={benefit}>
              <span aria-hidden="true" className="size-2 rounded-full bg-lime" />
              {benefit}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  )
}

export type SelectableTitleProps = Omit<ComponentProps<'input'>, 'children' | 'type'> & {
  artworkSrc?: string | undefined
  meta: ReactNode
  title: string
}

export function SelectableTitle({
  artworkSrc,
  checked,
  className,
  meta,
  title,
  ...props
}: SelectableTitleProps) {
  return (
    <label className={cn('group relative block min-w-0 cursor-pointer', className)} data-consumit-selectable-title>
      <input className="peer sr-only" checked={checked} type="checkbox" {...props} />
      <span className="block rounded-card border border-transparent p-1 transition-colors peer-checked:border-orange peer-focus-visible:ring-2 peer-focus-visible:ring-orange peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-canvas motion-reduce:transition-none">
        <ArtworkFrame alt={`${title} poster`} className="rounded-control" src={artworkSrc}>
          {checked ? (
            <span className="absolute top-3 right-3 grid size-7 place-items-center rounded-full bg-orange text-canvas">
              <Check aria-hidden="true" className="size-4" />
              <span className="sr-only">Selected</span>
            </span>
          ) : null}
        </ArtworkFrame>
        <span className="mt-3 block text-sm font-bold text-ink">{title}</span>
        <span className="mt-1 block text-xs text-muted">{meta}</span>
      </span>
    </label>
  )
}

export type MemberSuggestionProps = Omit<ComponentProps<'article'>, 'children'> & {
  action?: ReactNode | undefined
  avatarSrc?: string | undefined
  detail?: string | undefined
  films?: string | undefined
  following?: boolean | undefined
  handle: string
  name: string
  onFollowingChange?: ((following: boolean) => void) | undefined
  overlap: number
}

export function MemberSuggestion({
  action,
  avatarSrc,
  className,
  detail,
  films,
  following = false,
  handle,
  name,
  onFollowingChange,
  overlap,
  ...props
}: MemberSuggestionProps) {
  const safeOverlap = Math.min(Math.max(Math.round(overlap), 0), 100)

  return (
    <article className={cn('flex min-w-0 flex-col gap-4 rounded-card border border-border bg-surface p-4 sm:flex-row sm:items-center', className)} data-consumit-member-suggestion {...props}>
      <Avatar name={name} size="lg" src={avatarSrc} />
      <div className="min-w-0 flex-1">
        <h3 className="text-base font-bold text-ink">{name}</h3>
        <p className="mt-1 text-xs text-muted">{handle}{films ? ` · ${films}` : ''}</p>
        <p className="mt-3 text-xs font-bold uppercase tracking-[0.08em] text-lilac">{safeOverlap}% overlap</p>
        {detail ? <p className="mt-1 text-xs leading-5 text-muted">{detail}</p> : null}
      </div>
      <div className="shrink-0">
        {action ?? (
          <Button
            aria-pressed={following}
            onClick={() => onFollowingChange?.(!following)}
            variant={following ? 'secondary' : 'primary'}
          >
            {following ? 'Following' : 'Follow'}
          </Button>
        )}
      </div>
    </article>
  )
}
