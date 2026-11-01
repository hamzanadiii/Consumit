import type { Metadata } from 'next'
import { internalNextPath } from '@/lib/internal-next-path'

import { ResetPasswordScreen } from '../auth/auth-screens'

export const metadata: Metadata = { robots: { follow: false, index: false }, title: 'Choose a new password · Consumit' }

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  return <ResetPasswordScreen nextPath={internalNextPath((await searchParams).next)} />
}
