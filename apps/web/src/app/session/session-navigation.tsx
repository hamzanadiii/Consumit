'use client'

import { GlobalNavigation, type GlobalNavigationProps } from '@consumit/ui'

import { usePreviewSession } from './preview-session'

const publicNavigationItems = [
  { href: '/', label: 'Home' },
  { href: '/movies', label: 'Movies' },
  { href: '/series', label: 'Series' },
] as const

const memberNavigationItems = [
  ...publicNavigationItems,
  { href: '/friends', label: 'Friends' },
] as const

type SessionNavigationProps = Omit<GlobalNavigationProps, 'signedIn'>

export function SessionNavigation({ items, ...props }: SessionNavigationProps) {
  const { signedIn } = usePreviewSession()
  const defaultItems = signedIn ? memberNavigationItems : publicNavigationItems

  return (
    <GlobalNavigation
      {...props}
      items={items ?? defaultItems}
      signedIn={signedIn}
    />
  )
}
