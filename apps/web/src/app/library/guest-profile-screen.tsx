'use client'

import Link from 'next/link'

import { Avatar, buttonVariants } from '@consumit/ui'

import { dicebearAvatarUrl } from '@/lib/avatar'

import { FilScreenShell } from '../shared'

/** What a signed-out visitor sees instead of a bare sign-in redirect when
 *  opening their avatar: the shared guest character plus the honest pitch —
 *  sign in for the full experience. */
export function GuestProfileScreen({ nextPath }: { nextPath: string }) {
  const signInHref = `/sign-in?next=${encodeURIComponent(nextPath)}`
  return (
    <FilScreenShell pageHeading={undefined}>
      <main className="mx-auto w-full max-w-2xl px-1 py-14 text-center sm:px-3 sm:py-20 lg:px-4" data-consumit-guest-profile>
        <div className="flex justify-center">
          <Avatar imageAlt="Guest portrait" name="Guest" size="xl" src={dicebearAvatarUrl('consumit-guest')} treatment="noir" />
        </div>
        <p className="mt-6 text-xs font-bold tracking-[0.18em] text-[var(--fs-muted)] uppercase">Guest profile</p>
        <h1 className="mt-3 font-display text-[clamp(2rem,5vw,3.25rem)] leading-[1.02] font-normal tracking-[-0.025em] text-[var(--fs-ink)]">Browsing as a guest.</h1>
        <p className="mx-auto mt-4 max-w-[52ch] text-sm leading-6 text-[var(--fs-secondary)]">Your watchlist, history, lists, and progress live in your account. Sign in to unlock the full experience — everything you love, remembered on every device.</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link className={buttonVariants({ className: 'min-h-[44px]', variant: 'accent' })} href={signInHref}>Sign in</Link>
          <Link className={buttonVariants({ className: 'min-h-[44px]', variant: 'secondary' })} href="/sign-up">Create account</Link>
        </div>
        <p className="mx-auto mt-6 max-w-[52ch] text-xs leading-5 text-[var(--fs-muted)]">No account yet? Create one in two minutes — your guest browsing stays exactly where it is.</p>
      </main>
    </FilScreenShell>
  )
}
