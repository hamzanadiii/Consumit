import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { ReducedThemeScope } from '../shared/reduced-theme-scope'

export function SupportShell({ children }: { children: ReactNode }) {
  return (
    <ReducedThemeScope>
      <div className="min-h-screen bg-[var(--fs-page)] text-[var(--fs-ink)]">
        <div className="mx-auto flex min-h-screen w-full max-w-[92rem] flex-col px-4 sm:px-8 lg:px-[50px]">
          <header className="flex min-h-[4.25rem] items-center justify-between gap-4 border-b border-[var(--fs-line)]">
            <Link aria-label="Consumit home" className="inline-flex min-h-11 items-center gap-3 rounded-control outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" href="/">
              <Image alt="" className="size-8" height={32} src="/assets/consumit-mark.svg" width={32} />
              <span className="text-xs font-bold tracking-[0.2em]">CONSUMIT</span>
            </Link>
            <nav aria-label="Support navigation" className="flex items-center gap-2 text-xs font-bold text-[var(--fs-secondary)] sm:gap-5">
              <Link className="inline-flex min-h-11 items-center rounded-control px-2 outline-none hover:text-[var(--fs-ink)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" href="/help">Help center</Link>
              <Link className="inline-flex min-h-11 items-center rounded-control px-2 outline-none hover:text-[var(--fs-ink)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" href="/sign-in">Sign in</Link>
            </nav>
          </header>
          <div className="flex-1 py-9 sm:py-14">{children}</div>
          <footer className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-t border-[var(--fs-line)] py-3 text-[0.6875rem] text-[var(--fs-muted)]">
            <span>Help for your Consumit account and viewing experience.</span>
            <Link className="inline-flex min-h-11 items-center rounded-control px-2 hover:text-[var(--fs-ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" href="/about">About Consumit</Link>
          </footer>
        </div>
      </div>
    </ReducedThemeScope>
  )
}
