import { Tabs } from '@consumit/ui'

import { PublicCollection } from './public-collection'

export type ProfileNetworkView = 'followers' | 'following'

/**
 * The Network tab groups a published profile's Followers and Following
 * collections behind one destination. The view query keeps each list
 * shareable while the shared Tabs component owns the active underline.
 */
export function ProfileNetworkScreen({ initialPage, owner = false, username, view }: {
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
          { href: `${root}?view=followers`, label: 'Followers', value: 'followers' },
          { href: `${root}?view=following`, label: 'Following', value: 'following' },
        ]}
      />
      <div className="mt-6">
        <PublicCollection collection={view} initialPage={initialPage} owner={owner} username={username} />
      </div>
    </div>
  )
}
