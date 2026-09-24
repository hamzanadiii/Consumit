import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { SettingsScreen } from './settings-screen'

import { getServerProfile, getServerSession } from '@/lib/identity-server'

export const metadata: Metadata = {
  title: 'Settings · Consumit',
  description: 'Manage your Consumit account, privacy, playback, and notifications.',
  robots: { follow: false, index: false },
}

export default async function SettingsPage() {
  const session = await getServerSession()
  if (session.status === 'anonymous') redirect('/sign-in?next=%2Fsettings')
  if (session.status === 'unavailable') redirect('/sign-in?next=%2Fsettings')
  const profile = await getServerProfile()
  if (profile.status !== 'available') redirect('/sign-in?next=%2Fsettings')
  return <SettingsScreen initialProfile={profile.profile} />
}
