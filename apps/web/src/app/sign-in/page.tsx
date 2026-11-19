import type { Metadata } from 'next'
import type { CatalogTitleSummary } from '@consumit/contracts'

import { SignInScreen } from '../auth/auth-screens'

import { getCatalogBatch, refsKey } from '@/lib/catalog-api'
import { editorialRefs } from '@/lib/catalog-registry'
import { internalNextPath } from '@/lib/internal-next-path'

export const metadata: Metadata = {
  title: 'Sign in · Consumit',
  description: 'Return to your private Consumit library and watch history.',
  robots: { follow: false, index: false },
}

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ auth?: string | string[]; next?: string | string[]; reset?: string | string[] }> }) {
  const { auth, next, reset } = await searchParams
  const googleMessage = auth === 'google-unavailable'
    ? 'Google sign-in is not configured for this environment yet.'
    : auth === 'google-cancelled'
      ? 'Google sign-in was cancelled.'
      : auth === 'google-account-exists'
        ? 'That email already has a Consumit account. Sign in to it first, then try Google again.'
        : auth === 'google-failed'
          ? 'Google sign-in could not be completed. Please try again.'
          : null
  let titles: CatalogTitleSummary[] = []
  try {
    titles = (await getCatalogBatch(refsKey(editorialRefs.slice(0, 4)))).items
  } catch {}
  return <SignInScreen googleMessage={googleMessage} passwordReset={reset === 'success'} nextPath={internalNextPath(next)} titles={titles} />
}
