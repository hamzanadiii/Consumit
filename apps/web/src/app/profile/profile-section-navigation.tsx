'use client'

import { Tabs, type TabItem } from '@consumit/ui'

export type ProfileSectionId = 'overview' | 'activity' | 'films' | 'diary' | 'history' | 'reviews' | 'watchlist' | 'lists' | 'likes' | 'tags' | 'ratings' | 'followers' | 'following' | 'network'

/**
 * Profile tabs link to focused personal archives. Saved titles remain private
 * and appear only in the owner's Watchlist destination.
 */
export function ProfileSectionNavigation({ active = 'overview', counts, name, owner = false, username }: {
  active?: ProfileSectionId
  counts: Partial<Record<ProfileSectionId, number>>
  name: string
  owner?: boolean
  username: string
}) {
  const root = `/profile/${encodeURIComponent(username)}`

  const items: TabItem[] = [
    { href: root, label: 'Overview', value: 'overview' },
    ...(owner ? [{ href: `${root}/activity`, label: 'Activity', value: 'activity' },
    { href: `${root}/films`, label: 'Watched', value: 'films', ...(counts.films === undefined ? {} : { count: counts.films }) },
    { href: `${root}/diary`, label: 'Diary', value: 'diary', ...(counts.diary === undefined ? {} : { count: counts.diary }) }] : []),
    { href: `${root}/ratings`, label: 'Ratings', value: 'ratings', ...(counts.ratings === undefined ? {} : { count: counts.ratings }) },
    ...(owner ? [{ href: `${root}/history`, label: 'History', value: 'history' }] : []),
    { href: `${root}/reviews`, label: 'Reviews', value: 'reviews', ...(counts.reviews === undefined ? {} : { count: counts.reviews }) },
    ...(owner ? [{ href: `${root}/watchlist`, label: 'Watchlist', value: 'watchlist' }] : []),
    { href: `${root}/lists`, label: 'Lists', value: 'lists', ...(counts.lists === undefined ? {} : { count: counts.lists }) },
    ...(owner ? [{ href: `${root}/likes`, label: 'Likes', value: 'likes', ...(counts.likes === undefined ? {} : { count: counts.likes }) },
    { href: `${root}/tags`, label: 'Tags', value: 'tags', ...(counts.tags === undefined ? {} : { count: counts.tags }) }] : []),
    { href: `${root}/network`, label: 'Network', value: 'network' },
  ]

  return (
    <Tabs
      activeValue={active}
      aria-label={`${name} profile sections`}
      className="[&_ul]:gap-5 [&_a]:min-h-12 [&_a]:text-[0.875rem] [&_a]:font-medium"
      items={items}
    />
  )
}
