import type { Metadata } from 'next'

import { SignUpScreen } from '../auth/auth-screens'
import { CatalogUnavailableScreen } from '../catalog/catalog-ui'

import { getCatalogBatch, refsKey } from '@/lib/catalog-api'
import { editorialRefs } from '@/lib/catalog-registry'

export const metadata: Metadata = {
  title: 'Create account · Consumit',
  description: 'Create a private-by-default Consumit taste space.',
  robots: { follow: false, index: false },
}

export default async function SignUpPage() {
  let response
  try {
    response = await getCatalogBatch(refsKey(editorialRefs.slice(0, 4)))
  } catch (error) {
    return <CatalogUnavailableScreen error={error} />
  }
  return <SignUpScreen titles={response.items} />
}
