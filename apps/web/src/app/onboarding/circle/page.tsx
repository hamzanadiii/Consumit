import { redirect } from 'next/navigation'
import { internalNextPath } from '@/lib/internal-next-path'

export default async function OnboardingCirclePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams
  redirect(next === undefined ? '/' : internalNextPath(next))
}
