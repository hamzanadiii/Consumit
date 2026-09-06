import type { Metadata } from 'next'

import { FriendsScreen } from './friends-screen'

export const metadata: Metadata = {
  title: 'Circle Activity · Consumit',
  description: 'Asynchronous activity from people whose taste you trust.',
}

export default function FriendsPage() {
  return <FriendsScreen />
}
