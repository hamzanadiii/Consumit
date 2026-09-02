'use client'

import type { ComponentProps, ReactNode } from 'react'

import { AvatarGroup, type AvatarGroupItem } from '../identity/identity'
import { cn } from '../lib/cn'
import { ArtworkFrame } from '../media/media'

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

export type SocialProofProps = Omit<ComponentProps<'div'>, 'children'> & {
  detail?: ReactNode | undefined
  items: readonly AvatarGroupItem[]
  label: string
  text: ReactNode
}

export function SocialProof({
  className,
  detail,
  items,
  label,
  text,
  ...props
}: SocialProofProps) {
  return (
    <div
      className={cn('flex min-w-0 items-center gap-3', className)}
      data-consumit-social-proof
      {...props}
    >
      <AvatarGroup items={items} label={label} max={3} />
      <div className="min-w-0">
        <div className="text-xs font-bold text-copy">{text}</div>
        {detail ? <div className="mt-0.5 text-[0.6875rem] text-muted">{detail}</div> : null}
      </div>
    </div>
  )
}

export type EditorialFeatureProps = Omit<ComponentProps<'article'>, 'children'> & {
  action?: ReactNode | undefined
  alt: string
  context: string
  metadata?: ReactNode | undefined
  secondaryAction?: ReactNode | undefined
  socialProof?: ReactNode | undefined
  src?: string | undefined
  synopsis: ReactNode
  title: string
}

export function EditorialFeature({
  action,
  alt,
  className,
  context,
  metadata,
  secondaryAction,
  socialProof,
  src,
  synopsis,
  title,
  ...props
}: EditorialFeatureProps) {
  return (
    <article
      className={cn(
        'grid overflow-hidden rounded-card border border-border bg-surface lg:grid-cols-[1.08fr_0.92fr]',
        className,
      )}
      data-consumit-editorial-feature
      {...props}
    >
      <ArtworkFrame
        alt={alt}
        className="aspect-auto h-full min-h-64 rounded-none border-0 lg:min-h-80"
        ratio="wide"
        src={src}
      />
      <div className="flex min-w-0 flex-col justify-center p-6 sm:p-8 lg:p-10">
        <p className="text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-orange">
          {context}
        </p>
        <h3 className="mt-4 font-display text-3xl leading-[1.05] tracking-[-0.025em] text-ink sm:text-4xl">
          {title}
        </h3>
        {metadata ? <div className="mt-3 text-xs text-muted">{metadata}</div> : null}
        <div className="mt-5 max-w-[54ch] text-sm leading-6 text-copy">{synopsis}</div>
        {action || secondaryAction ? (
          <div className="mt-6 flex flex-wrap items-center gap-3">
            {action}
            {secondaryAction}
          </div>
        ) : null}
        {socialProof ? <div className="mt-6">{socialProof}</div> : null}
      </div>
    </article>
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
