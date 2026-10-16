import type { Metadata } from 'next'
import { ReadyOnboardingScreen } from '../onboarding-screens'
import { internalNextPath } from '@/lib/internal-next-path'
export const metadata: Metadata = { title: 'Ready to watch · Consumit', robots: { index: false, follow: false } }
export default async function ReadyPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) { return <ReadyOnboardingScreen next={internalNextPath((await searchParams).next)} /> }
