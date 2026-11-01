import type { Metadata } from 'next'
import { internalNextPath } from '@/lib/internal-next-path'

import { ForgotPasswordScreen } from '../auth/auth-screens'

export const metadata: Metadata = { robots: { follow: false, index: false }, title: 'Reset password · Consumit' }

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  return <ForgotPasswordScreen nextPath={internalNextPath((await searchParams).next)} />
}
