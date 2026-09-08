'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'

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
  const signedIn = member !== null
  const defaultItems = signedIn ? memberNavigationItems : publicNavigationItems
  const profileHref = member ? `/profile/${member.username}` : props.profileHref
  const profileName = member?.displayName ?? member?.username ?? props.profileName

  async function signOut() {
    try {
      await logoutMember()
    } finally {
      invalidateMemberLibraryCache()
      clearMember()
      router.push('/sign-in')
      router.refresh()
    }
  }

  return (
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
  )
}
