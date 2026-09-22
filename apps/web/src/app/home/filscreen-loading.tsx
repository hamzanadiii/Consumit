'use client'

import { LoaderCircle } from 'lucide-react'

export type FilScreenLoadingProps = {
  description?: string | undefined
  title?: string | undefined
}

/**
 * Fullscreen FilScreen loading world.
 * Render inside {@link FilScreenShell} so the sidebar, kind tabs, search,
 * and footer stay put while the center column shows skeletons in reading
 * order: hero, Continue watching, Trending rails.
 */
export function FilScreenLoading({
  description = 'Gathering your hero, continue watching, and trending titles. Nothing is lost — this takes a moment.',
  title = 'Loading Consumit home',
}: FilScreenLoadingProps) {
  return (
    <div
      aria-label={title}
      className="mt-4 pb-8"
      data-filscreen-loading
      role="status"
    >
      <div className="flex items-center gap-3">
        <LoaderCircle
          aria-hidden="true"
          className="size-5 animate-spin text-[var(--fs-accent)] motion-reduce:animate-none"
        />
        <p className="text-sm font-bold text-[var(--fs-ink)]">{title}</p>
      </div>
      <p className="mt-1 text-sm leading-6 text-[var(--fs-secondary)]">{description}</p>

      {/* Hero — same bounded square-edged frame as the live hero. */}
      <div aria-hidden="true" className="relative mt-4 overflow-hidden rounded-card border border-[var(--fs-line)] bg-[var(--fs-field)]">
        <div className="flex min-h-[22rem] flex-col justify-center gap-3 p-6 sm:p-10 lg:p-12">
          <div className="h-10 w-2/3 max-w-md animate-pulse rounded-xl bg-[var(--fs-accent-soft)] motion-reduce:animate-none sm:h-14" />
          <div className="h-4 w-1/3 max-w-xs animate-pulse rounded-lg bg-[var(--fs-accent-soft)] motion-reduce:animate-none" />
          <div className="h-4 w-1/2 max-w-sm animate-pulse rounded-lg bg-[var(--fs-hover)] motion-reduce:animate-none" />
          <div className="mt-2 flex flex-wrap gap-3">
            <div className="h-11 w-28 animate-pulse rounded-control bg-[var(--fs-accent-soft)] motion-reduce:animate-none" />
            <div className="h-11 w-28 animate-pulse rounded-control bg-[var(--fs-hover)] motion-reduce:animate-none" />
          </div>
        </div>
      </div>

      {/* Continue watching — landscape stills, same geometry as the live rail. */}
      <div aria-hidden="true" className="mt-8">
        <div className="h-7 w-48 animate-pulse rounded-lg bg-[var(--fs-hover)] motion-reduce:animate-none" />
        <div className="mt-4 flex gap-4 overflow-hidden">
          {[0, 1, 2].map((index) => (
            <div
              className="aspect-video w-[85%] max-w-[26rem] shrink-0 animate-pulse rounded-xl bg-[var(--fs-accent-soft)] motion-reduce:animate-none sm:w-[22rem] lg:w-[25rem]"
              key={index}
            />
          ))}
        </div>
      </div>

      {/* Trending rails — portrait cards, same snap row as TitleRail. */}
      {[0, 1].map((rail) => (
        <div aria-hidden="true" className="mt-8" key={rail}>
          <div className="h-7 w-40 animate-pulse rounded-lg bg-[var(--fs-hover)] motion-reduce:animate-none" />
          <div className="mt-4 flex gap-3 overflow-hidden sm:gap-4">
            {[0, 1, 2, 3, 4].map((index) => (
              <div className="w-32 shrink-0 sm:w-36" key={index}>
                <div className="aspect-[2/3] w-full animate-pulse rounded-[16px] bg-[var(--fs-accent-soft)] motion-reduce:animate-none" />
                <div className="mt-2 h-3 w-3/4 animate-pulse rounded-micro bg-[var(--fs-hover)] motion-reduce:animate-none" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
