import type { ComponentProps, ReactNode } from 'react'
import { AlertTriangle, Clapperboard, LoaderCircle } from 'lucide-react'

import { cn } from '../lib/cn'

export type FooterLink = {
  href: string
  label: string
}

export type FooterProps = Omit<ComponentProps<'footer'>, 'children'> & {
  brandHref?: string | undefined
  copyright?: string | undefined
  links?: readonly FooterLink[] | undefined
}

export function Footer({
  brandHref = '/',
  className,
  copyright,
  links = [],
  ...props
}: FooterProps) {
  return (
    <footer className={cn('border-t border-border bg-nav px-5 py-8 sm:px-8', className)} data-consumit-footer {...props}>
      <div className="mx-auto flex w-full max-w-[90rem] flex-col gap-6 sm:flex-row sm:items-center">
        <a className="inline-flex min-h-11 items-center gap-3 self-start rounded-control text-ink outline-none focus-visible:ring-2 focus-visible:ring-orange" href={brandHref}>
          <span aria-hidden="true" className="h-px w-7 bg-orange" />
          <span className="font-display text-xl">Consumit</span>
        </a>
        {links.length > 0 ? (
          <nav aria-label="Footer" className="sm:ml-auto">
            <ul className="flex flex-wrap gap-x-5 gap-y-2">
              {links.map((link) => (
                <li key={link.href}>
                  <a className="inline-flex min-h-11 items-center text-xs text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-orange" href={link.href}>{link.label}</a>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
        {copyright ? <p className="text-xs text-muted">{copyright}</p> : null}
      </div>
    </footer>
  )
}

type StateBaseProps<T extends 'div' | 'section'> = Omit<ComponentProps<T>, 'children' | 'title'> & {
  action?: ReactNode | undefined
  description: string
  title: string
}

export type EmptyStateProps = StateBaseProps<'section'> & {
  icon?: ReactNode | undefined
}

export function EmptyState({
  action,
  className,
  description,
  icon,
  title,
  ...props
}: EmptyStateProps) {
  return (
    <section className={cn('grid min-h-64 place-items-center rounded-card border border-border bg-surface px-5 py-10 text-center', className)} data-consumit-empty-state {...props}>
      <div className="max-w-md">
        <span aria-hidden="true" className="mx-auto grid size-12 place-items-center rounded-full border border-control-outline text-orange">
          {icon ?? <Clapperboard className="size-5" />}
        </span>
        <h2 className="mt-5 font-display text-3xl leading-tight text-ink">{title}</h2>
        <p className="mt-3 text-sm leading-6 text-muted">{description}</p>
        {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
      </div>
    </section>
  )
}

export type LoadingStateProps = Omit<ComponentProps<'div'>, 'children' | 'title'> & {
  rows?: number | undefined
  title?: string | undefined
}

export function LoadingState({
  className,
  rows = 3,
  title = 'Loading your taste space',
  ...props
}: LoadingStateProps) {
  return (
    <div className={cn('rounded-card border border-border bg-surface p-5', className)} data-consumit-loading-state role="status" {...props}>
      <div className="flex items-center gap-3 text-sm font-bold text-ink">
        <LoaderCircle aria-hidden="true" className="size-5 animate-spin text-orange motion-reduce:animate-none" />
        {title}
      </div>
      <div aria-hidden="true" className="mt-6 space-y-3">
        {Array.from({ length: Math.max(1, Math.min(Math.round(rows), 6)) }, (_, index) => (
          <div className="flex items-center gap-4" key={index}>
            <span className="size-12 shrink-0 animate-pulse rounded-control bg-surface-raised motion-reduce:animate-none" />
            <span className="h-3 animate-pulse rounded-micro bg-surface-raised motion-reduce:animate-none" style={{ width: `${72 - index * 9}%` }} />
          </div>
        ))}
      </div>
    </div>
  )
}

export type ErrorStateProps = StateBaseProps<'section'> & {
  detail?: string | undefined
}

export function ErrorState({
  action,
  className,
  description,
  detail,
  title,
  ...props
}: ErrorStateProps) {
  return (
    <section className={cn('rounded-card border border-border bg-surface p-6', className)} data-consumit-error-state role="alert" {...props}>
      <AlertTriangle aria-hidden="true" className="size-6 text-orange" />
      <h2 className="mt-5 font-display text-3xl leading-tight text-ink">{title}</h2>
      <p className="mt-3 max-w-[58ch] text-sm leading-6 text-copy">{description}</p>
      {detail ? <p className="mt-3 text-xs leading-5 text-muted">{detail}</p> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </section>
  )
}
