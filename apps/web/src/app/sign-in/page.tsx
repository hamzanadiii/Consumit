import type { Metadata } from 'next'

import { SignInScreen } from '../auth/auth-screens'
import { CatalogUnavailableScreen } from '../catalog/catalog-ui'

import { getCatalogBatch, refsKey } from '@/lib/catalog-api'
import { editorialRefs } from '@/lib/catalog-registry'

export const metadata: Metadata = {
  title: 'Sign in · Consumit',
  description: 'Return to your Consumit library and circle.',
  robots: { follow: false, index: false },
}

export default async function SignInPage() {
  let response
  try {
    response = await getCatalogBatch(refsKey(editorialRefs.slice(0, 4)))
  } catch (error) {
    return <CatalogUnavailableScreen error={error} />
  }
  return <SignInScreen titles={response.items} />
}
