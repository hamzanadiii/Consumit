'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

import { Button } from '@consumit/ui'

import { getFollowState, IdentityApiError, setFollowed } from '@/lib/identity-browser'

import { useSession } from '../session/session'

/**
 * Circle follow control for member profiles. "Follow" takes the confident
 * ivory primary treatment; once active, "Following" steps back to the
 * outlined secondary treatment. Counts live in the server-rendered masthead
 * and refresh with the page after a toggle.
 */
export function FollowButton({ username }: { username: string }) {
  const { member } = useSession()
  const router = useRouter()
  const [following, setFollowing] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!member || member.username === username) return
    let cancelled = false
    void getFollowState(username).then(
      (state) => {
        if (!cancelled) setFollowing(state.following)
      },
      () => {
        if (!cancelled) setFollowing(false)
      },
    )
    return () => {
      cancelled = true
    }
  }, [member, username])

  if (!member || member.username === username || following === null) return null

  async function toggle() {
    if (busy) return
    const next = !following
    setFollowing(next)
    setBusy(true)
    setError(null)
    try {
      await setFollowed(username, next)
      router.refresh()
    } catch (cause) {
      setFollowing(!next)
      if (!(cause instanceof IdentityApiError) || cause.status !== 404) {
        setError(next ? 'You could not be added to their circle. Please retry.' : 'You could not leave their circle. Please retry.')
      } else {
        setError('That member could not be found.')
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-2">
      <Button
        aria-label={following ? `Unfollow ${username}` : `Follow ${username}`}
        aria-pressed={following}
        disabled={busy}
        onClick={() => void toggle()}
        variant={following ? 'secondary' : 'primary'}
      >
        {following ? 'Following' : 'Follow'}
      </Button>
      {error ? <span className="text-xs text-orange" role="alert">{error}</span> : null}
    </span>
  )
}
