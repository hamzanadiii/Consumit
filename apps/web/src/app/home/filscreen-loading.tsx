'use client'

import { LoaderCircle } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { Button } from '@consumit/ui'

export const FILSCREEN_PROLONGED_LOADING_MS = 8_000

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
  const router = useRouter()
  const [prolonged, setProlonged] = useState(false)

  useEffect(() => {
    const timeout = window.setTimeout(() => setProlonged(true), FILSCREEN_PROLONGED_LOADING_MS)
    return () => window.clearTimeout(timeout)
  }, [])

  return (
    <main id="consumit-main-content" tabIndex={-1}>
      <div
        className="grid min-h-[50vh] place-items-center px-4 py-16"
        data-filscreen-loading
      >
        <div className="flex max-w-sm flex-col items-center text-center">
          <span aria-hidden="true" className="grid size-14 place-items-center rounded-full border border-[var(--fs-line)] bg-[var(--fs-field)]">
            <LoaderCircle className="size-6 animate-spin text-[var(--fs-accent)] motion-reduce:animate-none" />
          </span>
          <div aria-label={prolonged ? 'Still loading' : title} className="mt-5" role="status">
            <p className="font-display text-2xl tracking-[-0.02em] text-[var(--fs-ink)]">{prolonged ? 'Still loading' : title}</p>
            <p className="mt-2 text-sm leading-6 text-[var(--fs-secondary)]">
              {prolonged ? 'This page is taking longer than usual. You can retry here or choose another section from the navigation.' : description}
            </p>
          </div>
          {prolonged ? <Button className="mt-5 min-h-[44px]" onClick={() => router.refresh()} size="md" variant="secondary">Try again</Button> : null}
        </div>
      </div>
    </main>
  )
}
