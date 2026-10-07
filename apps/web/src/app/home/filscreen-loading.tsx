'use client'

import { LoaderCircle } from 'lucide-react'

export type FilScreenLoadingProps = {
  description?: string | undefined
  title?: string | undefined
}

/**
 * Fullscreen FilScreen loading world. One fallback serves every route, so
 * copy stays route-neutral; the shell, kind tabs, search, and footer stay
 * put while the center column holds a quiet centered loader — no skeleton
 * blocks, no layout guessing.
 */
export function FilScreenLoading({
  description = 'Fetching fresh titles for this page.',
  title = 'Loading',
}: FilScreenLoadingProps) {
  return (
    <div
      aria-label={title}
      className="grid min-h-[50vh] place-items-center px-4 py-16"
      data-filscreen-loading
      role="status"
    >
      <div className="flex max-w-sm flex-col items-center text-center">
        <span aria-hidden="true" className="grid size-14 place-items-center rounded-full border border-[var(--fs-line)] bg-[var(--fs-field)]">
          <LoaderCircle className="size-6 animate-spin text-[var(--fs-accent)] motion-reduce:animate-none" />
        </span>
        <p className="mt-5 font-display text-2xl tracking-[-0.02em] text-[var(--fs-ink)]">{title}</p>
        <p className="mt-2 text-sm leading-6 text-[var(--fs-secondary)]">{description}</p>
      </div>
    </div>
  )
}
