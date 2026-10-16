'use client'

import { Button, buttonVariants } from '@consumit/ui'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { setMemberFollow } from '@/lib/identity-browser'
import { useSession } from '../session/session'

export function FollowButton({ memberId, username, isFollowing, privateMember = false }: { memberId: string; username?: string; isFollowing: boolean; privateMember?: boolean }) {
  const session = useSession()
  const router = useRouter()
  const lock = useRef(false)
  const [following, setFollowing] = useState(isFollowing)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  if (session.member?.id === memberId) return null
  const destination = `/profile/${encodeURIComponent(username ?? '')}`
  if (!session.member) return <Link className={`${buttonVariants({ variant: 'primary', size: 'sm' })} min-h-11`} href={`/sign-in?next=${encodeURIComponent(destination)}`}>Sign in to follow</Link>
  async function toggle() {
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError(false)
    try { await setMemberFollow(memberId, !following); setFollowing(!following); router.refresh() }
    catch { setError(true) }
    finally { lock.current = false; setBusy(false) }
  }
  if (privateMember && !following) return <span className="text-xs text-[var(--fs-muted)]" role="status">Unfollowed</span>
  return <div className="flex flex-col items-start gap-2"><Button className="min-h-11" aria-pressed={following} disabled={busy} onClick={() => void toggle()} size="sm" variant={following ? 'secondary' : 'primary'}>{busy ? 'Saving…' : privateMember ? 'Unfollow' : following ? 'Following' : 'Follow'}</Button>{error ? <p className="max-w-64 text-xs text-[var(--fs-danger)]" role="alert">Follow could not be saved. Try again.</p> : null}</div>
}
