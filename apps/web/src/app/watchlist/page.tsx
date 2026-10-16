import { redirect } from 'next/navigation'

import { getServerSession } from '@/lib/identity-server'

export default async function WatchlistRedirect() {
  const session = await getServerSession()
  if (session.status !== 'authenticated') redirect('/sign-in?next=%2Fwatchlist')
  redirect(`/profile/${encodeURIComponent(session.member.username)}/watchlist`)
}
