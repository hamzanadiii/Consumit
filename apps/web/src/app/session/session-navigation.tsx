'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useState } from 'react'

import { GlobalNavigation, type GlobalNavigationProps } from '@consumit/ui'

import { memberAvatarSrc } from '@/lib/avatar'
import { invalidateMemberLibraryCache, logoutMember } from '@/lib/identity-browser'

import { useSession } from './session'

const publicNavigationItems = [
  { href: '/', label: 'Home' },
  { href: '/movies', label: 'Movies' },
  { href: '/series', label: 'Series' },
] as const

const memberNavigationItems = [
  ...publicNavigationItems,
  { href: '/friends', label: 'Friends' },
] as const

type SessionNavigationProps = Omit<GlobalNavigationProps, 'isProfileOnline' | 'signedIn'>

export function SessionNavigation({ items, ...props }: SessionNavigationProps) {
  const router = useRouter()
  const { clearMember, member } = useSession()
  const [signOutError, setSignOutError] = useState<string | null>(null)
  const signedIn = member !== null
  const defaultItems = signedIn ? memberNavigationItems : publicNavigationItems
  const profileHref = member ? `/profile/${member.username}` : props.profileHref
  const profileName = member?.displayName ?? member?.username ?? props.profileName

  async function signOut() {
    setSignOutError(null)
    try {
      await logoutMember()
      invalidateMemberLibraryCache()
      clearMember()
      router.push('/sign-in')
      router.refresh()
    } catch {
      setSignOutError('Sign out could not finish. Check your connection and try again.')
    }
  }

  return (
    <>
    <GlobalNavigation
      {...props}
      {...(member ? { avatarSrc: memberAvatarSrc(member.avatarUrl, member.id) } : {})}
      isProfileOnline={false}
      {...(profileHref ? { profileHref } : {})}
      {...(profileName ? { profileName } : {})}
      items={items ?? defaultItems}
      linkComponent={Link}
      memberHandle={member?.username}
      onSignOut={signedIn ? () => void signOut() : undefined}
      signedIn={signedIn}
      {...(member?.avatarStyle ? { treatment: member.avatarStyle } : {})}
    />
    {signOutError ? <p className="border-b border-border bg-surface px-5 py-3 text-sm text-copy sm:px-8" role="alert">{signOutError}</p> : null}
    </>
  )
}
