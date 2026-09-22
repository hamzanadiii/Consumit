import type { Metadata } from 'next'
import type { CatalogTitleSummary } from '@consumit/contracts'

import { SignInScreen } from '../auth/auth-screens'

import { getCatalogBatch, refsKey } from '@/lib/catalog-api'
import { editorialRefs } from '@/lib/catalog-registry'
import { internalNextPath } from '@/lib/internal-next-path'

export const metadata: Metadata = {
  title: 'Sign in · Consumit',
  description: 'Return to your Consumit library and circle.',
  robots: { follow: false, index: false },
}

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const { next } = await searchParams
  let titles: CatalogTitleSummary[] = []
  try {
    titles = (await getCatalogBatch(refsKey(editorialRefs.slice(0, 4)))).items
  } catch {}
  return <SignInScreen nextPath={internalNextPath(next)} titles={titles} />
}
