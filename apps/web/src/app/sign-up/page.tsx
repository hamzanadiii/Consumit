import type { Metadata } from 'next'

import { SignUpScreen } from '../auth/auth-screens'

export const metadata: Metadata = {
  title: 'Create account · Consumit',
  description: 'Create a private-by-default Consumit taste space.',
}

export default function SignUpPage() {
  return <SignUpScreen />
}
