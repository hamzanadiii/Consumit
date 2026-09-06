import type { Metadata } from 'next'

import { FavoritesOnboardingScreen } from '../onboarding-screens'
import { CatalogUnavailableScreen } from '../../catalog/catalog-ui'

import { getCatalogBatch, publicCatalogApiUrl, refsKey } from '@/lib/catalog-api'
import { editorialRefs } from '@/lib/catalog-registry'

export const metadata: Metadata = {
  description: 'Choose five favorites to seed your Consumit taste.',
  robots: { follow: false, index: false },
  title: 'Choose Your Favorites | Consumit',
}

export default async function OnboardingFavoritesPage() {
  let response
  try {
    response = await getCatalogBatch(refsKey(editorialRefs))
  } catch (error) {
    return <CatalogUnavailableScreen error={error} />
  }
  return <FavoritesOnboardingScreen apiBase={publicCatalogApiUrl()} initialTitles={response.items} />
}
