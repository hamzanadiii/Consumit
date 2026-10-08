import { redirect } from 'next/navigation'
import { getServerSession } from '@/lib/identity-server'

export default async function ListsRedirect() {
  const session = await getServerSession()
  if (session.status !== 'authenticated') redirect('/sign-in?next=%2Flists')
  redirect(`/profile/${encodeURIComponent(session.member.username)}/lists`)
}
