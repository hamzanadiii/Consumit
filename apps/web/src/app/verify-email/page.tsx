import type { Metadata } from 'next'
import { internalNextPath } from '@/lib/internal-next-path'

import { VerifyEmailScreen } from '../auth/auth-screens'

export const metadata: Metadata = { robots: { follow: false, index: false }, title: 'Verify email · Consumit' }

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  return <VerifyEmailScreen nextPath={internalNextPath((await searchParams).next)} />
}
