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
  if (session.status === 'unavailable') return <SessionUnavailableScreen activeHref="/settings" />
  return <ScreenShell activeHref="/settings"><main className="mx-auto min-h-screen w-full max-w-5xl px-5 py-14 sm:px-8 lg:py-20"><header><p className="text-xs font-bold uppercase tracking-[0.14em] text-orange">Data import</p><h1 className="mt-4 font-display text-5xl text-ink">Bring your Letterboxd history.</h1><p className="mt-5 max-w-2xl text-sm leading-7 text-muted">Nothing reaches your profile until you review uncertain title matches and confirm.</p></header><div className="mt-10"><LetterboxdImportFlow /></div></main></ScreenShell>
}
