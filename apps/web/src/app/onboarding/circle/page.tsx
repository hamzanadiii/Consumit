import type { Metadata } from 'next'

import { CircleOnboardingScreen } from '../onboarding-screens'
import { CatalogUnavailableScreen } from '../../catalog/catalog-ui'

import { getCatalogBatch, refsKey } from '@/lib/catalog-api'

export const metadata: Metadata = {
  description: 'Follow trusted members to seed your Consumit Circle.',
  robots: { follow: false, index: false },
  title: 'Build Your Circle | Consumit',
}

export default async function OnboardingCirclePage() {
  let response
  try {
    response = await getCatalogBatch(refsKey([{ id: 693134, kind: 'movie' }]))
  } catch (error) {
    return <CatalogUnavailableScreen error={error} />
  }
  const previewTitle = response.items[0]
  if (!previewTitle) throw new Error('Onboarding preview title is unavailable.')
  return <CircleOnboardingScreen previewTitle={previewTitle} />
}
