import type { Metadata } from 'next'
import { ViewingOnboardingScreen } from './onboarding-screens'
import { internalNextPath } from '@/lib/internal-next-path'
export const metadata: Metadata = { title: 'Your viewing preferences · Consumit', robots: { index: false, follow: false } }
export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  return <ViewingOnboardingScreen next={internalNextPath((await searchParams).next)} />
}
