import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

import type { CatalogRef, CatalogTitleSummary, MemberProfileArchiveKind, MemberProfileArchivePage, MemberProfileData, MemberRating } from '@consumit/contracts'

import { ProfileArchiveScreen } from '../../profile-archive-screen'
import { ProfileHistoryScreen } from '../../profile-history-screen'
import { ProfileWatchlistScreen } from '../../profile-watchlist-screen'
import { ProfileListsScreen } from '../../profile-lists-screen'
import { loadListsCollection } from '../../../lists/load-lists-collection'
import type { ProfileSectionId } from '../../profile-section-navigation'
import { parseRatingRange, type RatingRangeValue } from '../../../shared/rating-filter-value'

import { getCatalogBatchForRefs, MAX_PAGE_CATALOG_ENRICHMENT } from '@/lib/catalog-api'
import { getServerSession } from '@/lib/identity-server'
import { getMemberLibraryPage, getMemberList, getMemberRatingPage, getMemberRatingsForTitles, getMemberWatchHistory, getPublicProfile, getPublicProfileArchivePage, MemberApiError } from '@/lib/member-server'

type ProfileArchivePageProps = {
  params: Promise<{ section: string; username: string }>
  searchParams: Promise<{ rating?: string | string[]; tab?: string | string[]; tag?: string | string[] }>
}

const sections = new Set<ProfileSectionId>(['activity', 'diary', 'films', 'history', 'likes', 'lists', 'reviews', 'tags', 'watchlist'])

export const metadata: Metadata = {
  title: 'Member archive · Consumit',
  description: 'Browse your films, diary, reviews, and lists.',
  robots: { follow: false, index: false },
}

function refsInPage(page: MemberProfileArchivePage): CatalogRef[] {
  switch (page.collection) {
    case 'activity': return page.items.map((event) => ({ id: event.item.id, kind: event.item.kind }))
    case 'diary': case 'films': case 'likes': case 'reviews': return page.items.map(({ id, kind }) => ({ id, kind }))
    default: return []
  }
}

export default async function ProfileArchivePage({ params, searchParams }: ProfileArchivePageProps) {
  const [{ section, username }, search] = await Promise.all([params, searchParams])
  if (!sections.has(section as ProfileSectionId)) notFound()
  const activeSection = section as ProfileSectionId
  const normalizedUsername = username.trim().replace(/^@+/, '').toLowerCase()
  const selectedTag = typeof search.tag === 'string' && search.tag.trim() ? search.tag.slice(0, 100) : undefined
  const selectedRating: number | 'none' | RatingRangeValue | undefined = search.rating === undefined ? undefined
    : search.rating === 'none' ? 'none'
      : typeof search.rating === 'string' && /^(?:[1-9]|10)$/.test(search.rating) ? Number(search.rating)
      : typeof search.rating === 'string' && parseRatingRange(search.rating) ? search.rating as RatingRangeValue
      : notFound()
  const session = await getServerSession()
  let profile: MemberProfileData
  try { profile = await getPublicProfile(normalizedUsername) }
  catch (error) {
    if (error instanceof MemberApiError && error.status === 404) notFound()
    throw error
  }
  if (profile.canonicalUsername !== normalizedUsername) redirect(`/profile/${profile.canonicalUsername}/${section}${selectedRating !== undefined ? `?rating=${selectedRating}` : ''}`)
  const owner = session.status === 'authenticated' && session.member.username === profile.canonicalUsername
  if (selectedRating !== undefined && (!owner || activeSection !== 'films')) notFound()
  if (section === 'lists' && owner) {
    const collection = await loadListsCollection(profile.canonicalUsername)
    return <ProfileListsScreen data={profile} key={JSON.stringify(collection)} {...collection} />
  }
  if (section === 'watchlist') {
    if (!owner) notFound()
    const saved = await getMemberLibraryPage('saved')
    if (saved.collection !== 'saved') throw new Error('WATCHLIST_COLLECTION_MISMATCH')
    let titles: CatalogTitleSummary[] = []
    let initialRatings: MemberRating[] = []
    let catalogUnavailable = false
    let ratingsUnavailable = false
    try { titles = (await getCatalogBatchForRefs(saved.items.slice(0, MAX_PAGE_CATALOG_ENRICHMENT)))?.items ?? [] }
    catch { catalogUnavailable = true }
    try { initialRatings = await getMemberRatingsForTitles(saved.items.slice(0, 50)) }
    catch { ratingsUnavailable = true }
    return <ProfileWatchlistScreen catalogDetailsLimited={saved.items.length > MAX_PAGE_CATALOG_ENRICHMENT} catalogUnavailable={catalogUnavailable} data={profile} initialRatings={initialRatings} items={saved.items} nextCursor={saved.nextCursor} ratingsUnavailable={ratingsUnavailable} titles={titles} />
  }
  if (section === 'history') {
    if (!owner) notFound()
    let history: Awaited<ReturnType<typeof getMemberWatchHistory>> = { items: [], nextCursor: null }
    let historyUnavailable = false
    try { history = await getMemberWatchHistory() }
    catch { historyUnavailable = true }
    let titles: CatalogTitleSummary[] = []
    try { titles = (await getCatalogBatchForRefs(history.items.slice(0, MAX_PAGE_CATALOG_ENRICHMENT)))?.items ?? [] }
    catch { /* Stored watch history remains available without catalog artwork. */ }
    return <ProfileHistoryScreen data={profile} history={history} historyUnavailable={historyUnavailable} titles={titles} />
  }
  const firstKind: MemberProfileArchiveKind = activeSection as MemberProfileArchiveKind
  let initialPage: MemberProfileArchivePage
  let ratingTotalCount: number | undefined
  try {
    if (typeof selectedRating === 'number') {
      const ratings = await getMemberRatingPage(selectedRating)
      ratingTotalCount = ratings.totalCount
      initialPage = { collection: 'films', items: ratings.items.map(({ id, kind, origin, sourceKey }) => ({ id, kind, origin, sourceKey })), nextCursor: ratings.nextCursor }
    } else {
      initialPage = await getPublicProfileArchivePage(normalizedUsername, selectedRating === 'none' ? 'films' : firstKind)
    }
  } catch (error) {
    if (error instanceof MemberApiError && error.status === 404) notFound()
    throw error
  }

  const refs = refsInPage(initialPage)
  const listPosters: Record<string, readonly (string | undefined)[]> = {}
  if (initialPage.collection === 'lists') {
    const listCovers = await Promise.all(initialPage.items.slice(0, 16).map(async (list) => {
      try { return [list.slug, (await getMemberList(list.slug)).items.slice(0, 5).map(({ id, kind }) => ({ id, kind }))] as const }
      catch { return [list.slug, []] as const }
    }))
    for (const [, coverRefs] of listCovers) refs.push(...coverRefs)
    let listTitles: CatalogTitleSummary[] = []
    try { listTitles = (await getCatalogBatchForRefs(refs.slice(0, MAX_PAGE_CATALOG_ENRICHMENT)))?.items ?? [] }
    catch { listTitles = [] }
    const titleMap = new Map(listTitles.map((title) => [`${title.kind}:${title.id}`, title]))
    for (const [slug, coverRefs] of listCovers) listPosters[slug] = coverRefs.map((ref) => titleMap.get(`${ref.kind}:${ref.id}`)?.posterUrl ?? undefined)
    return <ProfileArchiveScreen data={profile} initialPage={initialPage} listPosters={listPosters} owner={owner} section={activeSection as Exclude<ProfileSectionId, 'overview' | 'watchlist' | 'history'>} {...(selectedTag ? { selectedTag } : {})} titles={listTitles} />
  }

  let titles: CatalogTitleSummary[] = []
  if (refs.length) {
    try { titles = (await getCatalogBatchForRefs(refs.slice(0, MAX_PAGE_CATALOG_ENRICHMENT)))?.items ?? [] }
    catch { titles = [] }
  }
  let initialRatings: MemberRating[] = []
  let ratingsUnavailable = false
  if ((activeSection === 'films' || activeSection === 'diary') && owner && typeof selectedRating !== 'number') {
    try { initialRatings = await getMemberRatingsForTitles(refs.slice(0, 50)) }
    catch { ratingsUnavailable = true }
  }
  return <ProfileArchiveScreen data={profile} key={`${activeSection}:${profile.canonicalUsername}`} initialPage={initialPage} initialRatings={initialRatings} owner={owner} ratingsUnavailable={ratingsUnavailable} {...(ratingTotalCount !== undefined ? { ratingTotalCount } : {})} {...(selectedRating !== undefined ? { selectedRating } : {})} section={activeSection as Exclude<ProfileSectionId, 'overview' | 'watchlist' | 'history'>} {...(selectedTag ? { selectedTag } : {})} titles={titles} />
}
