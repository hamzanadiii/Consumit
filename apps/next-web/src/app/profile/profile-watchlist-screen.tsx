import type { CatalogTitleSummary, MemberProfileData, MemberRating, MemberTitleRecord } from '@consumit/contracts'

import { WatchlistCollection } from './watchlist-collection'
import { ProfileArchiveShell } from './profile-archive-shell'

export function ProfileWatchlistScreen({ catalogDetailsLimited, catalogUnavailable, data, initialRatings, items, nextCursor, ratingsUnavailable, titles }: {
  catalogDetailsLimited: boolean
  catalogUnavailable: boolean
  data: MemberProfileData
  initialRatings: readonly MemberRating[]
  items: readonly MemberTitleRecord[]
  nextCursor: string | null
  ratingsUnavailable: boolean
  titles: readonly CatalogTitleSummary[]
}) {
  return (
    <ProfileArchiveShell data={data} heading="Watchlist" owner section="watchlist">
      <WatchlistCollection catalogDetailsLimited={catalogDetailsLimited} catalogUnavailable={catalogUnavailable} initialItems={items} initialNextCursor={nextCursor} initialRatings={initialRatings} ratingsUnavailable={ratingsUnavailable} titles={titles} />
    </ProfileArchiveShell>
  )
}
