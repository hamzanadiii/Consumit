import { Tabs } from '@consumit/ui'

import { PublicCollection } from './public-collection'

export type ProfileNetworkView = 'followers' | 'following'

/**
 * The Network tab groups a published profile's Followers and Following
 * collections behind one destination. The view query keeps each list
 * shareable while the shared Tabs component owns the active underline.
 */
export function ProfileNetworkScreen({ counts, initialPage, owner = false, username, view }: {
  counts?: { followers: number; following: number } | undefined
  initialPage: Parameters<typeof PublicCollection>[0]['initialPage']
  owner?: boolean
  username: string
  view: ProfileNetworkView
}) {
  const root = `/profile/${encodeURIComponent(username)}/network`
  return (
    <div>
      <Tabs
        activeValue={view}
        aria-label="Network views"
        className="[&_ul]:gap-5 [&_a]:min-h-12 [&_a]:text-[0.875rem] [&_a]:font-medium"
        items={[
          { href: `${root}?view=followers`, label: 'Followers', value: 'followers', ...(counts ? { count: counts.followers } : {}) },
          { href: `${root}?view=following`, label: 'Following', value: 'following', ...(counts ? { count: counts.following } : {}) },
        ]}
      />
      <div className="mt-6">
        <PublicCollection collection={view} initialPage={initialPage} key={`${username}:${view}`} owner={owner} username={username} />
      </div>
    </div>
  )
}
