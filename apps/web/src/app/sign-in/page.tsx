import type { Metadata } from 'next'

import { SignInScreen } from '../auth/auth-screens'

export const metadata: Metadata = {
  title: 'Sign in · Consumit',
  description: 'Return to your Consumit library and circle.',
}

export default function SignInPage() {
  return <SignInScreen />
}
