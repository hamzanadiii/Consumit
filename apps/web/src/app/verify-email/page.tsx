import type { Metadata } from 'next'

import { VerifyEmailScreen } from '../auth/auth-screens'

export const metadata: Metadata = { robots: { follow: false, index: false }, title: 'Verify email · Consumit' }

export default function VerifyEmailPage() {
  return <VerifyEmailScreen />
}
