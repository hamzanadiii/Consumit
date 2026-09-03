import type { ComponentProps, ReactNode } from 'react'
import { AlertCircle, ArrowLeft, Check, RefreshCw } from 'lucide-react'

import { cn } from '../lib/cn'

export type WatchHeaderProps = Omit<ComponentProps<'header'>, 'children' | 'title'> & {
  backHref: string
  brandHref?: string | undefined
  brandSrc?: string | undefined
  exitHref?: string | undefined
  meta?: ReactNode | undefined
  status?: ReactNode | undefined
  title: string
}

export function WatchHeader({
  backHref,
  brandHref = '/',
  brandSrc = '/assets/consumit-mark.svg',
  className,
  exitHref,
  meta,
  status,
  title,
  ...props
}: WatchHeaderProps) {
  return (
    <header className={cn('flex min-h-20 items-center gap-2 border-b border-border bg-nav px-4 sm:gap-4 sm:px-8', className)} data-consumit-watch-header {...props}>
      <a aria-label="Consumit home" className="grid size-11 shrink-0 place-items-center rounded-control outline-none focus-visible:ring-2 focus-visible:ring-orange" href={brandHref}>
        <img alt="" className="size-8" src={brandSrc} />
      </a>
      <span aria-hidden="true" className="hidden h-8 w-px bg-border sm:block" />
      <a aria-label="Back to title" className="grid size-11 shrink-0 place-items-center rounded-control text-copy outline-none hover:bg-surface hover:text-ink focus-visible:ring-2 focus-visible:ring-orange" href={backHref}>
        <ArrowLeft aria-hidden="true" className="size-5" />
      </a>
      <div className="min-w-0">
        <h1 className="truncate text-sm font-bold text-ink sm:text-base">{title}</h1>
        {meta ? <div className="mt-1 truncate text-xs text-muted">{meta}</div> : null}
      </div>
      {status ? <div className="ml-auto hidden text-xs text-muted sm:block">{status}</div> : null}
      {exitHref ? <a className="ml-auto flex min-h-11 shrink-0 items-center rounded-control border border-control-outline px-4 text-sm font-bold text-copy outline-none hover:bg-surface-raised hover:text-ink focus-visible:ring-2 focus-visible:ring-orange sm:ml-4" href={exitHref}>Exit watch</a> : null}
    </header>
  )
}

export type PlaybackSource = {
  detail?: string | undefined
  label: string
  status?: 'checking' | 'healthy' | 'unavailable' | undefined
  value: string
}

export type SourceSelectorProps = Omit<ComponentProps<'fieldset'>, 'children' | 'onChange'> & {
  description?: string | undefined
  legend?: string | undefined
  name: string
  onValueChange?: ((value: string) => void) | undefined
  sources: readonly PlaybackSource[]
  value?: string | undefined
}

const sourceStatusClasses: Record<NonNullable<PlaybackSource['status']>, string> = {
  checking: 'bg-copy',
  healthy: 'bg-lime',
  unavailable: 'bg-muted',
}

export function SourceSelector({
  className,
  description,
  legend = 'Playback source',
  name,
  onValueChange,
  sources,
  value,
  ...props
}: SourceSelectorProps) {
  return (
    <fieldset className={cn('rounded-card border border-border bg-surface p-5', className)} data-consumit-source-selector {...props}>
      <legend className="px-1 text-base font-bold text-ink">{legend}</legend>
      {description ? <p className="mb-5 text-xs leading-5 text-muted">{description}</p> : null}
      <div className="space-y-2">
        {sources.map((source) => {
          const selected = value === source.value
          return (
            <label className={cn('relative flex min-h-16 cursor-pointer items-center gap-3 rounded-control border px-4 outline-none transition-colors hover:bg-surface-raised has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-orange has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-canvas motion-reduce:transition-none', selected ? 'border-orange bg-surface-raised' : 'border-control-outline')} key={source.value}>
              <input
                checked={selected}
                className="peer sr-only"
                name={name}
                onChange={(event) => onValueChange?.(event.currentTarget.value)}
                type="radio"
                value={source.value}
              />
              <span aria-hidden="true" className={cn('size-2.5 rounded-full', sourceStatusClasses[source.status ?? 'healthy'])} />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold text-ink">{source.label}</span>
                {source.detail ? <span className="mt-1 block text-xs text-muted">{source.detail}</span> : null}
              </span>
              {selected ? <Check aria-hidden="true" className="size-5 text-orange" /> : null}
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

export type PlaybackReportProps = Omit<ComponentProps<'aside'>, 'children' | 'title'> & {
  description: string
  href: string
  label?: string | undefined
  title?: string | undefined
}

export function PlaybackReport({
  className,
  description,
  href,
  label = 'Report an issue',
  title = 'Playback problem?',
  ...props
}: PlaybackReportProps) {
  return (
    <aside className={cn('rounded-card border border-border bg-surface p-5', className)} data-consumit-playback-report {...props}>
      <h2 className="text-sm font-bold text-ink">{title}</h2>
      <p className="mt-3 text-xs leading-5 text-muted">{description}</p>
      <a className="mt-4 inline-flex min-h-11 items-center gap-2 text-xs font-bold uppercase tracking-[0.08em] text-orange outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-orange" href={href}>
        <RefreshCw aria-hidden="true" className="size-4" /> {label}
      </a>
    </aside>
  )
}

export type PlaybackTrustNoteProps = Omit<ComponentProps<'aside'>, 'children' | 'title'> & {
  children: ReactNode
  title?: string | undefined
}

export function PlaybackTrustNote({
  children,
  className,
  title = 'Stay safe',
  ...props
}: PlaybackTrustNoteProps) {
  return (
    <aside className={cn('rounded-card border border-border bg-surface p-5', className)} data-consumit-playback-trust-note {...props}>
      <div className="flex items-center gap-3">
        <AlertCircle aria-hidden="true" className="size-5 text-orange" />
        <h2 className="text-sm font-bold text-ink">{title}</h2>
      </div>
      <div className="mt-3 text-xs leading-5 text-muted">{children}</div>
    </aside>
  )
}
