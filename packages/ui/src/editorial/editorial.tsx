'use client'

import type { ComponentProps, ReactNode } from 'react'

import { cn } from '../lib/cn'

export type SectionHeadingProps = Omit<ComponentProps<'div'>, 'children'> & {
  action?: ReactNode | undefined
  description?: ReactNode | undefined
  title: string
}

export function SectionHeading({
  action,
  className,
  description,
  title,
  ...props
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between',
        className,
      )}
      data-consumit-section-heading
      {...props}
    >
      <div className="min-w-0">
        <h2 className="font-display text-2xl tracking-[-0.02em] text-ink sm:text-3xl">
          {title}
        </h2>
        {description ? (
          <div className="mt-2 max-w-[62ch] text-sm leading-6 text-muted">
            {description}
          </div>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

const moodToneClasses = {
  lime: 'bg-lime',
  lilac: 'bg-lilac',
  orange: 'bg-orange',
  rose: 'bg-danger',
} as const

export type MoodOption = {
  label: string
  tone: keyof typeof moodToneClasses
  value: string
}

export type MoodSelectorProps = Omit<ComponentProps<'div'>, 'children'> & {
  label: string
  onValueChange?: ((value: string) => void) | undefined
  options: readonly MoodOption[]
  value?: string | undefined
}

export function MoodSelector({
  className,
  label,
  onValueChange,
  options,
  value,
  ...props
}: MoodSelectorProps) {
  return (
    <div
      aria-label={label}
      className={cn('flex flex-wrap gap-3', className)}
      data-consumit-mood-selector
      role="group"
      {...props}
    >
      {options.map((option) => {
        const isSelected = option.value === value

        return (
          <button
            aria-pressed={isSelected}
            className={cn(
              'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-control border px-4 text-xs font-bold outline-none transition-[background-color,border-color,color] focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none',
              isSelected
                ? 'border-ink bg-ink text-canvas hover:text-canvas'
                : 'border-control-outline bg-surface text-copy hover:border-ink/60 hover:text-ink',
            )}
            key={option.value}
            onClick={() => onValueChange?.(option.value)}
            type="button"
          >
            <span
              aria-hidden="true"
              className={cn('size-2 rounded-full', moodToneClasses[option.tone])}
            />
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
