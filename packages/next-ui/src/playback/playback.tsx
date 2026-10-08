import type { ComponentProps, ElementType, ReactNode } from 'react'
import { ArrowLeft } from 'lucide-react'

import { cn } from '../lib/cn'

export type WatchHeaderProps = Omit<ComponentProps<'header'>, 'children' | 'title'> & {
  backHref: string
  brandHref?: string | undefined
  brandSrc?: string | undefined
  exitHref?: string | undefined
  linkComponent?: ElementType | undefined
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
  linkComponent: LinkComponent = 'a',
  meta,
  status,
  title,
  ...props
}: WatchHeaderProps) {
  return (
    <header className={cn('flex min-h-20 items-center gap-2 border-b border-border bg-nav px-4 sm:gap-4 sm:px-8', className)} data-consumit-watch-header {...props}>
      <LinkComponent aria-label="Consumit home" className="grid size-11 shrink-0 place-items-center rounded-control outline-none focus-visible:ring-2 focus-visible:ring-orange" href={brandHref}>
        <img alt="" className="size-8" src={brandSrc} />
      </LinkComponent>
      <span aria-hidden="true" className="hidden h-8 w-px bg-border sm:block" />
      <LinkComponent aria-label="Back to title" className="grid size-11 shrink-0 place-items-center rounded-control text-copy outline-none hover:bg-surface hover:text-ink focus-visible:ring-2 focus-visible:ring-orange" href={backHref}>
        <ArrowLeft aria-hidden="true" className="size-5" />
      </LinkComponent>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-sm font-bold text-ink sm:text-base">{title}</h1>
        {meta ? <div className="mt-1 truncate text-xs text-muted">{meta}</div> : null}
      </div>
      {status ? <div className="ml-auto hidden text-xs text-muted sm:block">{status}</div> : null}
      {exitHref ? <LinkComponent aria-label="Exit watch" className="ml-auto flex min-h-11 shrink-0 items-center rounded-control border border-control-outline px-3 text-sm font-bold text-copy outline-none hover:bg-surface-raised hover:text-ink focus-visible:ring-2 focus-visible:ring-orange sm:ml-4 sm:px-4" href={exitHref}><span className="sm:hidden">Exit</span><span className="hidden sm:inline">Exit watch</span></LinkComponent> : null}
    </header>
  )
}
