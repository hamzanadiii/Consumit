import { redirect } from 'next/navigation'
import { internalNextPath } from '@/lib/internal-next-path'

export default async function HistoryOnboardingPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams
  if (next === undefined) redirect('/onboarding')
  redirect(`/onboarding?${new URLSearchParams({ next: internalNextPath(next) })}`)
}
