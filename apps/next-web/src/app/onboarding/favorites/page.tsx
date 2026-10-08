import type { Metadata } from 'next'
import type { CatalogTitleSummary } from '@consumit/contracts'

import { FavoritesOnboardingScreen } from '../onboarding-screens'
import { CatalogUnavailableScreen } from '../../catalog/catalog-ui'

import { getCatalogBatchForRefs } from '@/lib/catalog-api'
import { editorialRefs } from '@/lib/catalog-registry'

export const metadata: Metadata = {
  description: 'Choose four Favorites for your Consumit profile.',
  robots: { follow: false, index: false },
  title: 'Choose Your Favorites | Consumit',
}

export default async function OnboardingFavoritesPage() {
  let initialTitles: CatalogTitleSummary[] = []
  try {
    initialTitles = (await getCatalogBatchForRefs(editorialRefs))?.items ?? []
  } catch (error) {
    return <CatalogUnavailableScreen error={error} />
  }
  return <FavoritesOnboardingScreen initialTitles={initialTitles} />
}
