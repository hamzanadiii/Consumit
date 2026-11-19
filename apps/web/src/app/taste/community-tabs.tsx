import Link from 'next/link'

export type CommunityDestination = 'discover' | 'following' | 'people'

export function CommunityTabs({ active, signedIn, query }: {
  active: CommunityDestination
  signedIn: boolean
  query?: string
}) {
  const tabs = [
    { href: '/community?mode=discover', label: 'Discover collections', key: 'discover' as const },
    {
      href: signedIn ? '/community?mode=following' : '/sign-in?next=%2Fcommunity%3Fmode%3Dfollowing',
      label: 'Following',
      key: 'following' as const,
    },
    {
      href: `/search?${new URLSearchParams({ type: 'people', ...(query ? { q: query } : {}) })}`,
      label: 'Find people',
      key: 'people' as const,
    },
  ]

  return (
    <nav aria-label="Community" className="taste-tabs taste-community-tabs">
      {tabs.map((tab) => (
        <Link aria-current={active === tab.key ? 'page' : undefined} href={tab.href} key={tab.key}>
          {tab.label}
        </Link>
      ))}
    </nav>
  )
}
