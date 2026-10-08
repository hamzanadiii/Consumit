import type { Metadata } from 'next'

import { ForgotPasswordScreen } from '../auth/auth-screens'

export const metadata: Metadata = { robots: { follow: false, index: false }, title: 'Reset password · Consumit' }

export default function ForgotPasswordPage() {
  return <ForgotPasswordScreen />
}
