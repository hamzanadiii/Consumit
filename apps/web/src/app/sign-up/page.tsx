import type { Metadata } from 'next'
import type { CatalogTitleSummary } from '@consumit/contracts'

import { SignUpScreen } from '../auth/auth-screens'

import { getCatalogBatch, refsKey } from '@/lib/catalog-api'
import { editorialRefs } from '@/lib/catalog-registry'
import { internalNextPath } from '@/lib/internal-next-path'

export const metadata: Metadata = {
  title: 'Create account · Consumit',
  description: 'Create a private-by-default Consumit taste space.',
  robots: { follow: false, index: false },
}

export default async function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  let titles: CatalogTitleSummary[] = []
  try {
    titles = (await getCatalogBatch(refsKey(editorialRefs.slice(0, 4)))).items
  } catch {}
  return <SignUpScreen titles={titles} nextPath={internalNextPath((await searchParams).next)} />
}
