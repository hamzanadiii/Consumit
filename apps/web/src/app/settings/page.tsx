import type { Metadata } from 'next'

import { SettingsScreen } from './settings-screen'

export const metadata: Metadata = {
  title: 'Settings · Consumit',
  description: 'Manage your Consumit account, privacy, playback, and notifications.',
}

export default function SettingsPage() {
  return <SettingsScreen />
}
