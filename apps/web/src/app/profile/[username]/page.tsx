import type { Metadata } from 'next'

import { OwnerProfileScreen, PublicProfileScreen } from '../public-profile-screen'

type PublicProfilePageProps = {
  params: Promise<{ username: string }>
}

export const metadata: Metadata = {
  title: 'Profile · Consumit',
  description: 'A living record of taste, history, reviews, and lists.',
}

export default async function PublicProfilePage({ params }: PublicProfilePageProps) {
  const { username } = await params
  const normalizedUsername = username.trim().replace(/^@+/, '').toLowerCase()

  return normalizedUsername === 'hamza'
    ? <OwnerProfileScreen username={username} />
    : <PublicProfileScreen username={username} />
}
