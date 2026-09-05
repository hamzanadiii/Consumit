import type { Metadata } from 'next'

import { FavoritesOnboardingScreen } from '../onboarding-screens'

export const metadata: Metadata = {
  description: 'Choose five favorites to seed your Consumit taste.',
  title: 'Choose Your Favorites | Consumit',
}

export default function OnboardingFavoritesPage() {
  return <FavoritesOnboardingScreen />
}
