'use client'

import { useLayoutEffect, useRef } from 'react'
import { buttonVariants, EmptyState } from '@consumit/ui'
import Link from 'next/link'

import { FilScreenShell } from './home/filscreen-shell'

export default function NotFound() {
  const main = useRef<HTMLElement>(null)
  useLayoutEffect(() => { main.current?.focus({ preventScroll: true }) }, [])

  return (
    <FilScreenShell pageHeading={undefined}>
      <main id="consumit-main-content" ref={main} tabIndex={-1} className="mx-auto min-h-[70vh] w-full max-w-[90rem]">
        <EmptyState
          action={<div className="flex flex-wrap justify-center gap-3"><Link className={buttonVariants()} href="/search">Search titles</Link><Link className={buttonVariants({ variant: 'secondary' })} href="/">Back to Home</Link></div>}
          description="This page may have moved or the address may be mistyped. Search titles or return to Home."
          headingLevel={1}
          title="We couldn’t find that page"
        />
      </main>
    </FilScreenShell>
  )
}
