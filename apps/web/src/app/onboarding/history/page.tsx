import type { Metadata } from 'next'

import { HistoryOnboardingScreen } from '../onboarding-screens'
import { CatalogUnavailableScreen } from '../../catalog/catalog-ui'

import { getCatalogBatch, refsKey } from '@/lib/catalog-api'
import { editorialRefs } from '@/lib/catalog-registry'

export const metadata: Metadata = {
  description: 'Bring your existing watch history into your Consumit library.',
  title: 'Bring Your History | Consumit',
}

export default async function OnboardingHistoryPage() {
  let response
  try {
    response = await getCatalogBatch(refsKey(editorialRefs.slice(0, 4)))
  } catch (error) {
    return <CatalogUnavailableScreen error={error} />
  }
  return <HistoryOnboardingScreen titles={response.items} />
}
