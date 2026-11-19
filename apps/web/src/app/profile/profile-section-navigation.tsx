'use client'

import type { TabItem } from '@consumit/ui'
import type { ProfileSectionVisibility } from '@consumit/contracts'
import { ScrollableTabs } from '../shared/scrollable-tabs'

export type ProfileSectionId = 'overview' | 'activity' | 'films' | 'diary' | 'history' | 'reviews' | 'watchlist' | 'lists' | 'likes' | 'tags' | 'ratings' | 'followers' | 'following' | 'network'

/** Profile tabs follow each archive's independent public visibility setting. */
export function ProfileSectionNavigation({ active = 'overview', counts, name, owner = false, username, visibility }: {
  active?: ProfileSectionId
  counts: Partial<Record<ProfileSectionId, number>>
  name: string
  owner?: boolean
  visibility?: ProfileSectionVisibility
  username: string
}) {
  const root = `/profile/${encodeURIComponent(username)}`

  const items: TabItem[] = [
    { href: root, label: 'Overview', value: 'overview' },
    ...(owner || visibility?.activity === true ? [{ href: `${root}/activity`, label: 'Activity', value: 'activity', ...(counts.activity === undefined ? {} : { count: counts.activity }) }] : []),
    ...(owner || visibility?.watched === true ? [{ href: `${root}/films`, label: 'Watched', value: 'films', ...(counts.films === undefined ? {} : { count: counts.films }) }] : []),
    ...(owner || visibility?.diary === true ? [{ href: `${root}/diary`, label: 'Diary', value: 'diary', ...(counts.diary === undefined ? {} : { count: counts.diary }) }] : []),
    ...(owner || visibility?.ratings === true ? [{ href: `${root}/ratings`, label: 'Ratings', value: 'ratings', ...(counts.ratings === undefined ? {} : { count: counts.ratings }) }] : []),
    ...(owner || visibility?.history === true ? [{ href: `${root}/history`, label: 'History', value: 'history', ...(counts.history === undefined ? {} : { count: counts.history }) }] : []),
    ...(owner || visibility?.reviews === true ? [{ href: `${root}/reviews`, label: 'Reviews', value: 'reviews', ...(counts.reviews === undefined ? {} : { count: counts.reviews }) }] : []),
    ...(owner || visibility?.watchlist === true ? [{ href: `${root}/watchlist`, label: 'Watchlist', value: 'watchlist' }] : []),
    ...(owner || visibility?.lists === true ? [{ href: `${root}/lists`, label: 'Lists', value: 'lists', ...(counts.lists === undefined ? {} : { count: counts.lists }) }] : []),
    ...(owner ? [{ href: `${root}/likes`, label: 'Likes', value: 'likes', ...(counts.likes === undefined ? {} : { count: counts.likes }) },
      { href: `${root}/tags`, label: 'Tags', value: 'tags', ...(counts.tags === undefined ? {} : { count: counts.tags }) }] : [
      ...(visibility?.likes ? [{ href: `${root}/likes`, label: 'Likes', value: 'likes' }] : []),
      ...(visibility?.tags && visibility.reviews ? [{ href: `${root}/tags`, label: 'Tags', value: 'tags' }] : []),
    ]),
    ...(owner || visibility?.network === true ? [{ href: `${root}/network`, label: 'Network', value: 'network' }] : []),
  ]

  return (
    <div className="min-w-0" data-profile-section-navigation>
      <ScrollableTabs
        activeValue={active}
        ariaLabel={`${name} profile sections`}
        className="[&_ul]:gap-5 [&_a]:min-h-12 [&_a]:text-[0.875rem] [&_a]:font-medium"
        items={items}
        profileCue
      />
    </div>
  )
}
