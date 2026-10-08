'use client'

import type { ComponentProps, ReactNode } from 'react'

import { cn } from '../lib/cn'

export type SectionHeadingProps = Omit<ComponentProps<'div'>, 'children'> & {
  action?: ReactNode | undefined
  description?: ReactNode | undefined
  icon?: ReactNode | undefined
  title: string
  variant?: 'editorial' | 'compact' | undefined
}

export function SectionHeading({
  action,
  className,
  description,
  icon,
  id,
  title,
  variant = 'editorial',
  ...props
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-start justify-between gap-x-5 gap-y-2 border-b border-border pb-3',
        className,
      )}
      data-consumit-section-heading
      {...props}
    >
      <div className="min-w-0 flex-1">
        <h2 id={id} className={variant === 'compact' ? 'pt-2 text-xs font-medium uppercase tracking-[0.12em] text-copy' : 'font-display text-2xl leading-tight tracking-[-0.02em] text-ink'}>
          {title}
          {icon ? <span aria-hidden="true" className="ml-2 inline-flex translate-y-[-1px] items-center align-middle">{icon}</span> : null}
        </h2>
        {description ? (
          <div className="mt-1.5 max-w-[62ch] text-xs leading-5 text-muted">
            {description}
          </div>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}
