import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { LetterboxdImportFlow } from '../../../imports/letterboxd-import-flow'
import { ScreenShell } from '../../../screens/screen-shell'
import { SessionUnavailableScreen } from '../../../session/protected-page'

import { getServerSession } from '@/lib/identity-server'

export const metadata: Metadata = { title: 'Letterboxd Import · Consumit', robots: { follow: false, index: false } }

export default async function LetterboxdImportPage() {
  const session = await getServerSession()
  if (session.status === 'anonymous') redirect('/sign-in?next=%2Fsettings%2Fimports%2Fletterboxd')
  if (session.status === 'unavailable') redirect('/sign-in?next=%2Fsettings%2Fimports%2Fletterboxd')
  return (
    <ScreenShell activeHref="/settings">
      <main className="mx-auto min-h-screen w-full max-w-5xl px-5 py-14 sm:px-8 lg:py-20">
        <section className="relative overflow-hidden rounded-card border border-border bg-[linear-gradient(160deg,#1a1418_0%,#2a1520_40%,#141419_100%)] px-6 py-10 sm:p-10 lg:p-14">
          <div className="relative">
            <header>
              <p className="text-xs font-bold uppercase tracking-[0.14em] text-orange">Data import</p>
              <h1 className="mt-4 max-w-[20ch] text-balance font-display text-4xl leading-[0.98] tracking-[-0.025em] text-ink sm:text-5xl lg:text-[3.25rem]">Bring your Letterboxd history.</h1>
              <p className="mt-5 max-w-[52ch] text-sm leading-7 text-muted">Your watches, ratings, and reviews become part of your Consumit library. Nothing changes until you review uncertain matches and confirm.</p>
            </header>
            <div className="mt-10">
              <LetterboxdImportFlow />
            </div>
          </div>
        </section>
      </main>
    </ScreenShell>
  )
}
