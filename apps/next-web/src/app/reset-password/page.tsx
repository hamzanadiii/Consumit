import type { Metadata } from 'next'

import { ResetPasswordScreen } from '../auth/auth-screens'

export const metadata: Metadata = { robots: { follow: false, index: false }, title: 'Choose a new password · Consumit' }

export default function ResetPasswordPage() {
  return <ResetPasswordScreen />
}
