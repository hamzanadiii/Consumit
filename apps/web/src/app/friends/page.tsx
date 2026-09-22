import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { getServerSession } from '@/lib/identity-server'

import { FriendsScreen } from './friends-screen'
import { SessionUnavailableScreen } from '../session/protected-page'

export const metadata: Metadata = {
  description: 'Your Consumit social space.',
  robots: { follow: false, index: false },
  title: 'Friends | Consumit',
}

export default async function FriendsPage() {
  const session = await getServerSession()
  if (session.status === 'anonymous') redirect('/sign-in?next=%2Ffriends')
  if (session.status === 'unavailable') redirect('/sign-in?next=%2Ffriends')

  return <FriendsScreen />
}
