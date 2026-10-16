import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/identity-server'
import { SessionProvider } from '../session/session'
import { NotificationInbox } from './notification-inbox'

export const metadata: Metadata = { title: 'Notifications · Consumit', robots: { follow: false, index: false } }
export default async function NotificationsPage() {
  const session = await getServerSession()
  if (session.status !== 'authenticated') redirect('/sign-in?next=%2Fnotifications')
  return <SessionProvider initialMember={session.member} initialStatus="authenticated"><NotificationInbox /></SessionProvider>
}
