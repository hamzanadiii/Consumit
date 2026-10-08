import { notFound, redirect } from 'next/navigation'

import { getServerSession } from '@/lib/identity-server'

import { GuestProfileScreen } from './guest-profile-screen'

export default async function LibraryRedirect({ searchParams }: { searchParams?: Promise<{ section?: string | string[] }> } = {}) {
  const requested = (await searchParams)?.section
  if (requested !== undefined && (typeof requested !== 'string' || !['watchlist', 'likes', 'films', 'history', 'lists', 'profile'].includes(requested))) notFound()
  const section = requested ?? 'history'
  const destination = requested === undefined ? '/library' : `/library?section=${section}`
  const session = await getServerSession()
  if (session.status !== 'authenticated') {
    if (section === 'profile') return <GuestProfileScreen nextPath={destination} />
    redirect(`/sign-in?next=${encodeURIComponent(destination)}`)
  }
  const root = `/profile/${encodeURIComponent(session.member.username)}`
  redirect(section === 'profile' ? root : `${root}/${section}`)
}
