import type { Metadata } from 'next'
import type { CatalogTitleSummary } from '@consumit/contracts'
import { redirect } from 'next/navigation'

import { LibraryScreen } from './library-screen'
import { SessionUnavailableScreen } from '../session/protected-page'

import { getCatalogBatch, refsKey } from '@/lib/catalog-api'
import { getServerSession } from '@/lib/identity-server'
import { getMemberLibrary } from '@/lib/member-server'

export const metadata: Metadata = {
  title: 'My Library · Consumit',
  description: 'Your saved titles, lists, and watch history.',
  robots: { follow: false, index: false },
}

export default async function LibraryPage() {
  const session = await getServerSession()
  if (session.status === 'anonymous') redirect('/sign-in?next=%2Flibrary')
  if (session.status === 'unavailable') redirect('/sign-in?next=%2Flibrary')
  const library = await getMemberLibrary()
  const refs = [...library.saved, ...library.watched, ...library.diary]
  let titles: CatalogTitleSummary[] = []
  let catalogUnavailable = false
  try {
    titles = refs.length ? (await getCatalogBatch(refsKey(refs))).items : []
  } catch { catalogUnavailable = true }
  return <LibraryScreen catalogUnavailable={catalogUnavailable} library={library} titles={titles} />
}
