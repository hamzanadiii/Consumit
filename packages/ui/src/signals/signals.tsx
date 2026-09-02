import type { ComponentProps } from 'react'

import { cn } from '../lib/cn'

const toneClasses = {
  danger: 'bg-danger/20 text-ink',
  lime: 'bg-lime/15 text-lime',
  lilac: 'bg-lilac/15 text-lilac',
  neutral: 'bg-nav/85 text-copy',
  orange: 'bg-nav/85 text-orange',
} as const

export type SignalTone = keyof typeof toneClasses

export type BadgeProps = ComponentProps<'span'> & {
  tone?: SignalTone
}

export function Badge({
  className,
  tone = 'neutral',
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex min-h-6 items-center rounded-micro px-2 text-[0.625rem] font-bold uppercase tracking-[0.08em]',
        toneClasses[tone],
        className,
      )}
      data-consumit-badge
      {...props}
    />
  )
}

const dotClasses = {
  danger: 'bg-danger',
  lime: 'bg-lime',
  lilac: 'bg-lilac',
  neutral: 'bg-muted',
  orange: 'bg-orange',
} as const

export type StatusDotProps = Omit<ComponentProps<'span'>, 'children'> & {
  label: string
  showLabel?: boolean
  tone?: SignalTone
}

export function StatusDot({
  className,
  label,
  showLabel = true,
  tone = 'lime',
  ...props
}: StatusDotProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 text-xs text-copy',
        className,
      )}
      data-consumit-status-dot
      {...props}
    >
      <span
        aria-hidden="true"
        className={cn('size-2 shrink-0 rounded-full', dotClasses[tone])}
      />
      <span className={showLabel ? undefined : 'sr-only'}>{label}</span>
    </span>
  )
}

const railToneClasses = {
  danger: 'bg-danger',
  lime: 'bg-lime',
  lilac: 'bg-lilac',
  neutral: 'bg-copy',
  orange: 'bg-orange',
} as const

export type ProgressRailProps = Omit<ComponentProps<'div'>, 'children'> & {
  label: string
  max?: number
  tone?: SignalTone
  value: number
}

export function ProgressRail({
  className,
  label,
  max = 100,
  tone = 'orange',
  value,
  ...props
}: ProgressRailProps) {
  const safeMax = max > 0 ? max : 100
  const safeValue = Math.min(Math.max(value, 0), safeMax)
  const percentage = (safeValue / safeMax) * 100

  return (
    <div
      aria-label={label}
      aria-valuemax={safeMax}
      aria-valuemin={0}
      aria-valuenow={safeValue}
      className={cn('h-1 overflow-hidden bg-surface-raised', className)}
      data-consumit-progress-rail
      role="progressbar"
      {...props}
    >
      <span
        className={cn('block h-full', railToneClasses[tone])}
        style={{ width: `${percentage}%` }}
      />
    </div>
  )
}

export type TasteMatchProps = Omit<ComponentProps<'div'>, 'children'> & {
  detail?: string
  label?: string
  reason?: string
  score: number
}

export function TasteMatch({
  className,
  detail,
  label = 'Taste match',
  reason,
  score,
  ...props
}: TasteMatchProps) {
  const safeScore = Math.min(Math.max(Math.round(score), 0), 100)

  return (
    <div
      aria-label={`${safeScore}% ${label.toLowerCase()}`}
      className={cn('flex items-stretch gap-4', className)}
      data-consumit-taste-match
      role="group"
      {...props}
    >
      <span className="relative w-1 shrink-0 overflow-hidden bg-surface-raised">
        <span
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 bg-orange"
          style={{ height: `${safeScore}%` }}
        />
      </span>
      <span className="min-w-0 py-0.5">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <strong className="font-display text-3xl font-normal text-ink">
            {safeScore}%
          </strong>
          <span className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-orange">
            {label}
          </span>
        </span>
        {reason ? (
          <span className="mt-1 block text-xs leading-5 text-copy">{reason}</span>
        ) : null}
        {detail ? (
          <span className="mt-1 block text-[0.6875rem] leading-4 text-muted">
            {detail}
          </span>
        ) : null}
      </span>
    </div>
  )
}

export type RatingDisplayProps = Omit<ComponentProps<'span'>, 'children'> & {
  max?: number
  showValue?: boolean
  value: number
}

export function RatingDisplay({
  className,
  max = 5,
  showValue = false,
  value,
  ...props
}: RatingDisplayProps) {
  const safeMax = Math.max(Math.round(max), 1)
  const safeValue = Math.min(Math.max(value, 0), safeMax)
  const stars = '★'.repeat(safeMax)
  const percentage = (safeValue / safeMax) * 100

  return (
    <span
      aria-label={`${safeValue} out of ${safeMax}`}
      className={cn('inline-flex items-center gap-2', className)}
      data-consumit-rating
      role="img"
      {...props}
    >
      <span
        aria-hidden="true"
        className="relative inline-block font-interface text-xs tracking-[0.08em] text-faint"
      >
        {stars}
        <span
          className="absolute inset-0 overflow-hidden whitespace-nowrap text-orange"
          style={{ width: `${percentage}%` }}
        >
          {stars}
        </span>
      </span>
      {showValue ? (
        <span aria-hidden="true" className="text-xs text-copy">
          {safeValue.toFixed(1)}
        </span>
      ) : null}
    </span>
  )
}
