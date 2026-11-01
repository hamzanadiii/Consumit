import type { Metadata } from 'next'

import { GoogleSignUpScreen } from '../../auth/auth-screens'
import { internalNextPath } from '@/lib/internal-next-path'

export const metadata: Metadata = {
  title: 'Finish Google sign-up · Consumit',
  description: 'Choose your Consumit username to finish creating your account.',
  robots: { follow: false, index: false },
}

export default async function GoogleSignUpPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const { next } = await searchParams
  return <GoogleSignUpScreen nextPath={internalNextPath(next)} />
}
