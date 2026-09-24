import type { Metadata } from 'next'
import { redirect } from 'next/navigation'

import { AdminScreen } from './admin-screen'

import { getServerSession } from '@/lib/identity-server'

export const metadata: Metadata = {
  title: 'Admin · Consumit',
  description: 'Consumit control room — probe providers, tune the fleet, and manage access.',
  robots: { follow: false, index: false },
}

export default async function AdminPage() {
  const session = await getServerSession()
  if (session.status === 'anonymous') redirect('/sign-in?next=%2Fadmin')
  if (session.status === 'unavailable') redirect('/sign-in?next=%2Fadmin')
  if (session.member?.role !== 'admin') redirect('/')
  return <AdminScreen />
}
