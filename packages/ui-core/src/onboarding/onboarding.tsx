import type { ComponentProps, ReactNode } from 'react'
import { Check } from 'lucide-react'

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
        <p className="text-[0.6875rem] uppercase tracking-[0.1em] text-muted">
          <span className="sm:hidden">Step {safeCurrent} of {safeTotal}</span>
          <span className="hidden sm:inline">Onboarding · {safeCurrent} of {safeTotal}</span>
        </p>
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
    <label
      className={cn(
        'group relative block min-w-0 cursor-pointer rounded-card outline-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-orange has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-canvas',
        className,
      )}
      data-consumit-selectable-title
    >
      <input className="peer sr-only" checked={checked} type="checkbox" {...props} />
      <span className="block">
        <span
          className={cn(
            'relative block rounded-card border-2 p-0.5 transition-colors motion-reduce:transition-none',
            checked ? 'border-orange' : 'border-transparent',
          )}
          data-consumit-selectable-artwork
        >
          <ArtworkFrame alt={`${title} poster`} className="rounded-[5px] border-0" src={artworkSrc}>
            {checked ? (
              <span className="absolute top-3 right-3 grid size-7 place-items-center rounded-full bg-orange text-canvas">
                <Check aria-hidden="true" className="size-4" />
                <span className="sr-only">Selected</span>
              </span>
            ) : null}
          </ArtworkFrame>
        </span>
        <span className="mt-3 block text-sm font-bold text-ink">{title}</span>
        <span className="mt-1 block text-xs text-muted">{meta}</span>
      </span>
    </label>
  )
}
