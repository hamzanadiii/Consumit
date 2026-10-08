import type { Metadata } from 'next'
import type { CatalogTitleSummary } from '@consumit/contracts'

import { HistoryOnboardingScreen } from '../onboarding-screens'
import { getCatalogBatch, refsKey } from '@/lib/catalog-api'
import { editorialRefs } from '@/lib/catalog-registry'

export const metadata: Metadata = {
  description: 'Set up your Consumit library and start a watch history.',
  robots: { follow: false, index: false },
  title: 'Start Your History | Consumit',
}

export default async function OnboardingHistoryPage() {
  let titles: CatalogTitleSummary[] = []
  try {
    titles = (await getCatalogBatch(refsKey(editorialRefs.slice(0, 4)))).items
  } catch {}
  return <HistoryOnboardingScreen titles={titles} />
}
