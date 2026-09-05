import type { Metadata } from 'next'

import { HistoryOnboardingScreen } from '../onboarding-screens'

export const metadata: Metadata = {
  description: 'Bring your existing watch history into your Consumit library.',
  title: 'Bring Your History | Consumit',
}

export default function OnboardingHistoryPage() {
  return <HistoryOnboardingScreen />
}
