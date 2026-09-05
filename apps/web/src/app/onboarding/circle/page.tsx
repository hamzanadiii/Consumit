import type { Metadata } from 'next'

import { CircleOnboardingScreen } from '../onboarding-screens'

export const metadata: Metadata = {
  description: 'Follow trusted members to seed your Consumit Circle.',
  title: 'Build Your Circle | Consumit',
}

export default function OnboardingCirclePage() {
  return <CircleOnboardingScreen />
}
