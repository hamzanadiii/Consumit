import { readFile } from 'node:fs/promises'
import { buildApp } from '../../apps/api/src/app'
import { loadEnv } from '../../apps/api/src/config/env'
import { createFakeIdentity } from '../../apps/api/src/identity/fake-identity'
import { createFakeCatalog } from '../../apps/api/src/catalog/fake-catalog'
import { CatalogError } from '../../apps/api/src/catalog/errors'
import { unavailableMemberData } from '../../apps/api/src/member-data/unavailable-member-data'
import type { PublicMembers } from '../../apps/api/src/member-data/public-members'
import type { MemberData } from '../../apps/api/src/member-data/member-data'
import type { ExperienceRepository } from '../../apps/api/src/experience/repository'
import type { Playback } from '../../apps/api/src/playback/playback'
import type { AnimeCatalog } from '../../apps/api/src/catalog/anilist/adapter'
import { createTestAnimeCapability } from '../../apps/api/src/anime/test-capability'
import { catalogSeasonSchema, defaultExperiencePreferences, defaultProfileSectionVisibility, experiencePreferencesSchema, hasPlaybackPreferences, playbackProgressSchema, tasteListLayoutSchema, type MemberListCollaborator, type MemberRating, type MemberReview, type TitleReview, type TasteListWrite, type TasteEdition, type ExperiencePreferences, type CatalogRef, type MemberProfileArchivePage, type PlaybackProgress, type ResolvePlaybackRequest, type PlaybackSession, type TasteReviewWrite, type TasteTarget, type WatchHistoryEntry } from '../../packages/contracts/src/index'
import { movieDetail, seriesDetail } from '../../apps/web/src/test/catalog-fixtures'
import { ApiError } from '../../apps/api/src/http/errors'
import type { TasteRepository } from '../../apps/api/src/taste/repository'

process.env.NODE_ENV = 'test'
const origin = 'http://127.0.0.1:28114'
let identityClockOffset = 0
const identity = createFakeIdentity({ clock: () => new Date(Date.now() + identityClockOffset) })
await identity.register({ username: 'experience_fixture', email: 'experience@example.test', password: 'experience-fixture-password' })
const delivery = identity.notifier.deliveries[0]!
if (!('code' in delivery)) throw new Error('Missing fixture code')
const session = await identity.verifyEmail({ email: 'experience@example.test', code: delivery.code })
let adminSession: typeof session | null = null
const values = new Map<string, ExperiencePreferences>(), favorites = new Map<string, readonly CatalogRef[]>(), progressRecords = new Map<string, PlaybackProgress>()
let watchHistoryFixture = false
let watchlistFixture = false
let watchedArchiveFixture = false
let diaryArchiveFixture = false
let ratingDistributionFixture = false
let publicDiaryArchivePages = false
type EditionFixtureState = { data: TasteEdition; published: TasteEdition | null; revision: number; publishedAt: string | null }
let editionFixture: EditionFixtureState | null = null
let editionSaveFailures = 0
let editionPublishFailures = 0
let editionUnpublishFailures = 0
const progressKey = (owner: string, ref: Pick<PlaybackProgress, 'kind' | 'id' | 'season' | 'episode'>) => `${owner}:${ref.kind}:${ref.id}:${ref.season ?? 0}:${ref.episode ?? 0}`
let saveFailure = false
let playbackRecoveryFailureCount = 0
let playbackStartupFailureCount = 0
let reviewFixture = false
let titleReviewFixture = false
const authoredTitleReviews = new Map<string, MemberReview>()
const authoredReviewKey = (ref: Pick<MemberReview, 'kind' | 'id'>) => `${ref.kind}:${ref.id}`
const tasteDrafts = new Map<string, { data: Record<string, unknown>; revision: number }>()
let publishReviewFailures = 0
let discussionFixture = false
let communitySpoilerFixture = false
let communityFailureCount = 0
let profileArchiveFailureCount = 0
let communityRecoveryFixture = false
let communityPaginationFixture = false
let communityFollowingPaginationFixture = false
let communityPageFailureCount = 0
let communityCursorExpired = false
let communityFirstPageRequests = 0
let moderationFailure = false
const subscriptions = new Map<string, { subscribed: boolean; muted: boolean }>()
let moderationReports: Array<{
  id: string
  reason: string
  target: TasteTarget
  commentId: string | null
  createdAt: string
  status: string
  content: string
  href: string | null
}> = []
let collection: TasteListWrite | null = null
let collectionCopy: TasteListWrite | null = null
let collectionRole: 'owner' | 'visitor' | 'editor' = 'owner'
let collectionSaved = false
let savedArchivePages = false
let ownedArchivePages = false
let archiveOlderAvailable = false
let olderBookmarkRemoved = false
let savedCollectionName = ''
let collectionEditors: MemberListCollaborator[] = []
const collectionCopyKeys = new Set<string>()
let collectionDraft: { data: Record<string, unknown>; revision: number } = { data: {}, revision: 0 }
const collectionCreationKeys = new Set<string>()
const collectionId = 'experience-collection', collectionSlug = 'quiet-evenings'
function initialCollection(): TasteListWrite {
  return { revision: 1, name: 'Quiet evenings, strange worlds', description: 'Two stories for an unhurried evening.', visibility: 'private', publishUpdate: false, items: [{ kind: 'movie', id: movieDetail.id, note: 'Stay with the quiet moments.' }, { kind: 'series', id: seriesDetail.id, note: null }], layout: tasteListLayoutSchema.parse({ preset: 'watch-order', chapters: [{ id: 'after-dark', name: 'After dark', introduction: 'A different way to see the familiar.' }], assignments: { [`series:${seriesDetail.id}`]: 'after-dark' } }) }
}
const fixtureReview = { kind: 'movie' as const, id: movieDetail.id, reviewId: 'experience-review', body: 'The quiet scenes carry the story. Every pause makes the journey feel more personal.\n\nThe final image brings those small moments together, leaving room to think after the credits.', reviewedOn: '2026-10-27', origin: 'native' as const, sourceKey: null, tags: [] }
const requests: ResolvePlaybackRequest[] = []
const experience: ExperienceRepository = {
  async read(owner) { return { preferences: values.get(owner) ?? defaultExperiencePreferences(), saved: values.has(owner) } },
  async patch(owner, patch) {
    if (saveFailure) throw new ApiError('AUTH_STATE_UNAVAILABLE', 'Fixture save unavailable.')
    const preferences = experiencePreferencesSchema.parse({ ...(values.get(owner) ?? defaultExperiencePreferences()), ...patch, ...(hasPlaybackPreferences(patch) ? { playbackConfigured: true } : {}) })
    values.set(owner, preferences); return { preferences, saved: true }
  },
}
const memberData: MemberData = {
  ...unavailableMemberData,
  async setFavorites(owner, refs) { favorites.set(owner, refs) },
  async watchHistory(owner, cursor, limit) {
    if (!watchHistoryFixture || owner !== session.member.id) return { items: [], nextCursor: null }
    const items: WatchHistoryEntry[] = [{ completedAt: '2026-10-25T12:00:00.000Z', entryId: 'experience-history-movie', id: movieDetail.id, kind: 'movie' }]
    return { items: items.slice(cursor ? limit : 0, cursor ? limit * 2 : limit), nextCursor: null }
  },
  async progress(owner, ref) {
    if (ref.kind !== 'movie' && ref.season === undefined && ref.episode === undefined) {
      return [...progressRecords.entries()]
        .filter(([key, record]) => key.startsWith(`${owner}:${ref.kind}:${ref.id}:`) && record.positionSeconds > 0)
        .toSorted(([, left], [, right]) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt) || (right.season ?? 0) - (left.season ?? 0) || (right.episode ?? 0) - (left.episode ?? 0))
        .map(([, record]) => record)[0] ?? null
    }
    return progressRecords.get(progressKey(owner, ref)) ?? null
  },
  async ratingsByValue(owner, value, cursor, limit) {
    const rating: MemberRating | null = ratingDistributionFixture && owner === session.member.id && value === 8
      ? { id: movieDetail.id, kind: 'movie', origin: 'native', sourceKey: null, value: 8 }
      : null
    return { items: rating && !cursor ? [rating].slice(0, limit) : [], nextCursor: null, totalCount: rating ? 1 : 0 }
  },
  async setProgress(owner, input) {
    const record = playbackProgressSchema.parse({ ...input, updatedAt: '2026-10-28T12:00:00.000Z' })
    progressRecords.set(progressKey(owner, input), record)
    return record
  },
  async librarySnapshot(owner) {
    if (profileArchiveFailureCount > 0) {
      profileArchiveFailureCount -= 1
      throw new ApiError('AUTH_STATE_UNAVAILABLE', 'Profile archive fixture unavailable. Try again.')
    }
    const saved = watchlistFixture && owner === session.member.id ? [
      { id: movieDetail.id, kind: 'movie' as const, origin: 'native' as const, sourceKey: null },
      { id: seriesDetail.id, kind: 'series' as const, origin: 'native' as const, sourceKey: null },
    ] : []
    return {
      diary: { items: [], nextCursor: null },
      lists: { items: ownedArchivePages && collection ? [{ id: collectionId, slug: collectionSlug, name: collection.name, description: collection.description, visibility: collection.visibility, itemCount: collection.items.length, origin: 'native' }] : [], nextCursor: ownedArchivePages ? JSON.stringify({ collection: 'lists', createdAt: '2026-10-27T12:00:00.000Z', id: 'owned-page-one' }) : null },
      savedLists: { items: collectionSaved ? [{ available: Boolean(collection && collection.visibility !== 'private'), itemCount: collection && collection.visibility !== 'private' ? collection.items.length : null, listId: collectionId, listName: collection && collection.visibility !== 'private' ? collection.name : savedCollectionName, listSlug: collectionSlug, ownerUsername: 'collection_curator', ownerDisplayName: null, savedAt: '2026-10-27T12:00:00.000Z' }] : [], nextCursor: savedArchivePages && !olderBookmarkRemoved ? JSON.stringify({ collection: 'savedLists', createdAt: '2026-10-27T12:00:00.000Z', id: 'saved-page-one' }) : null },
      saved: { items: saved, nextCursor: null },
      favorites: (favorites.get(owner) ?? []).map((ref, index) => ({ ...ref, position: index + 1, origin: 'native', sourceKey: null })),
    }
  },
  async libraryPage(_owner, which) {
    if (which === 'saved') return { collection: 'saved', items: watchlistFixture && _owner === session.member.id ? [
      { id: movieDetail.id, kind: 'movie', origin: 'native', sourceKey: null },
      { id: seriesDetail.id, kind: 'series', origin: 'native', sourceKey: null },
    ] : [], nextCursor: null }
    if (which !== 'savedLists' || !savedArchivePages) throw new Error('No library page fixture')
    return { collection: 'savedLists', items: olderBookmarkRemoved ? [] : [{ available: archiveOlderAvailable, itemCount: archiveOlderAvailable ? 1 : null, listId: 'older-saved-collection', listName: 'Animation after midnight', listSlug: 'animation-after-midnight', ownerUsername: 'animation_curator', ownerDisplayName: null, savedAt: '2026-10-25T12:00:00.000Z' }], nextCursor: null }
  },
  async profile(username, viewer) {
    const member = await identity.repository.findByUsername(username)
    if (!member || viewer !== member.record.id) return null
    const record = member.record
    const profile = { ...record.profile, createdAt: record.createdAt.toISOString(), usernameChangedAt: record.profile.usernameChangedAt?.toISOString() ?? null, nextUsernameChangeAt: null }
    const reviews = [
      ...(reviewFixture && viewer === session.member.id ? [fixtureReview] : []),
      ...(viewer === session.member.id ? [...authoredTitleReviews.values()] : []),
    ]
    return { canonicalUsername: username, profile, favorites: (favorites.get(viewer) ?? []).map((ref, index) => ({ ...ref, position: index + 1, origin: 'native', sourceKey: null })), diary: diaryArchiveFixture && viewer === session.member.id ? [
      { id: movieDetail.id, kind: 'movie' as const, origin: 'native' as const, sourceKey: null, entryId: 'experience-diary-first', rewatch: false, tags: ['after-hours'], watchedOn: '2026-10-01' },
      { id: movieDetail.id, kind: 'movie' as const, origin: 'native' as const, sourceKey: null, entryId: 'experience-diary-rewatch', rewatch: true, tags: ['returning'], watchedOn: '2026-09-30' },
    ] : [], lists: [], reviews, ratingDistribution: Array.from({ length: 10 }, (_, index) => ({ value: index + 1, count: ratingDistributionFixture && index === 7 ? 1 : 0 })), social: { followers: 0, following: 0 }, statistics: { activity: reviews.length, diaryEntries: diaryArchiveFixture && viewer === session.member.id ? 2 : 0, history: watchHistoryFixture && viewer === session.member.id ? 1 : 0, lists: 0, reviews: reviews.length, watchlist: watchlistFixture && viewer === session.member.id ? 2 : 0, watched: watchedArchiveFixture && viewer === session.member.id ? 1 : 0 } }
  },
  async titleReviews(ref, page) {
    const title = ref.kind === 'movie' && ref.id === movieDetail.id
      ? { label: 'Movie', key: 'movie' }
      : ref.kind === 'series' && ref.id === seriesDetail.id
        ? { label: 'Series', key: 'series' }
        : ref.kind === 'anime' && ref.id === experienceAnimeTitle.anilistId
          ? { label: 'Anime', key: 'anime' }
          : null
    if (!titleReviewFixture || !title) return { items: [], page, totalPages: 0, totalResults: 0 }
    const items: TitleReview[] = Array.from({ length: 11 }, (_, index) => ({
      author: ref.kind === 'movie' && index === 0
        ? { avatarStyle: session.member.avatarStyle, avatarUrl: session.member.avatarUrl, displayName: session.member.displayName, username: session.member.username }
        : { avatarStyle: 'dusk' as const, avatarUrl: null, displayName: `${title.label} Critic ${index + 1}`, username: `${title.key}_critic_${index + 1}` },
      body: ref.kind === 'movie' && index === 0 ? 'The quiet scenes carry the story.'
        : ref.kind === 'movie' && index === 1 ? 'A patient viewer watches the small gestures and the silence between them. '.repeat(5)
          : `${title.label} public review ${index + 1}.`,
      rating: index % 3 === 1 ? null : 8,
      reviewId: ref.kind === 'movie' && index === 0 ? 'experience-review' : `${title.key}-experience-review-${index + 1}`,
      reviewedOn: `2026-10-${String(28 - index).padStart(2, '0')}`,
    }))
    const authoredReview = authoredTitleReviews.get(authoredReviewKey(ref))
    if (authoredReview) {
      items.unshift({
        author: { avatarStyle: session.member.avatarStyle, avatarUrl: session.member.avatarUrl, displayName: session.member.displayName, username: session.member.username },
        body: authoredReview.body,
        rating: null,
        reviewId: authoredReview.reviewId,
        reviewedOn: authoredReview.reviewedOn,
      })
    }
    const owner = await identity.repository.findByUsername(session.member.username)
    const visibleItems = owner?.record.profile.sectionVisibility.reviews === false
      ? items.filter(item => item.reviewId !== 'experience-review' && item.reviewId !== authoredReview?.reviewId)
      : items
    return {
      items: visibleItems.slice((page - 1) * 10, page * 10),
      page,
      totalPages: Math.ceil(visibleItems.length / 10),
      totalResults: visibleItems.length,
    }
  },
  async titleState(owner, ref) {
    const authoredReview = authoredTitleReviews.get(authoredReviewKey(ref)) ?? null
    return {
      like: null,
      rating: null,
      review: owner === session.member.id ? authoredReview : null,
      saved: false,
      watched: false,
    }
  },
  async profileArchive(username, collection, viewer, cursor) {
    if (profileArchiveFailureCount > 0) {
      profileArchiveFailureCount -= 1
      throw new ApiError('AUTH_STATE_UNAVAILABLE', 'Profile archive fixture unavailable. Try again.')
    }
    const profileOwner = await identity.repository.findByUsername(username)
    if (!profileOwner) return null
    const visibility = profileOwner.record.profile.sectionVisibility ?? defaultProfileSectionVisibility()
    const visibleSection = {
      activity: 'activity', diary: 'diary', films: 'watched', history: 'history', likes: 'likes',
      lists: 'lists', reviews: 'reviews', tags: 'tags', watchlist: 'watchlist',
    }[collection]
    if (viewer !== profileOwner.record.id && (!visibility[visibleSection] || (collection === 'tags' && !visibility.reviews))) return null
    const reviews = collection === 'reviews' && username === session.member.username
      ? [...(reviewFixture ? [fixtureReview] : []), ...authoredTitleReviews.values()]
      : []
    const watched = watchedArchiveFixture && username === session.member.username && collection === 'films'
      ? [{ id: movieDetail.id, kind: 'movie' as const, origin: 'native' as const, sourceKey: null }]
      : []
    if (publicDiaryArchivePages && username === session.member.username && collection === 'diary' && viewer !== profileOwner.record.id) {
      const first = { id: movieDetail.id, kind: 'movie' as const, origin: 'native' as const, sourceKey: null, entryId: 'experience-public-diary-first', rewatch: false, tags: ['after-hours'], watchedOn: '2026-10-01' }
      const second = { id: movieDetail.id, kind: 'movie' as const, origin: 'native' as const, sourceKey: null, entryId: 'experience-public-diary-second', rewatch: true, tags: ['returning'], watchedOn: '2026-09-30' }
      if (cursor?.id === first.entryId) return { collection, items: [second], nextCursor: null }
      const nextCursor = JSON.stringify({ collection, createdAt: '2026-10-01T12:00:00.000Z', id: first.entryId, kind: 'diary', watchedOn: '2026-10-01T00:00:00.000Z' })
      return { collection, items: [first], nextCursor }
    }
    const diary = diaryArchiveFixture && username === session.member.username && collection === 'diary'
      ? [
          { id: movieDetail.id, kind: 'movie' as const, origin: 'native' as const, sourceKey: null, entryId: 'experience-diary-first', rewatch: false, tags: ['after-hours'], watchedOn: '2026-10-01' },
          { id: movieDetail.id, kind: 'movie' as const, origin: 'native' as const, sourceKey: null, entryId: 'experience-diary-rewatch', rewatch: true, tags: ['returning'], watchedOn: '2026-09-30' },
        ]
      : []
    return { collection, items: collection === 'reviews' ? reviews : collection === 'films' ? watched : collection === 'diary' ? diary : [], nextCursor: null } as MemberProfileArchivePage
  },
  async list(slug, viewer) {
    if (slug === 'animation-after-midnight' && archiveOlderAvailable && savedArchivePages && !olderBookmarkRemoved && collection) {
      return { list: { id: 'older-saved-collection', slug, name: 'Animation after midnight', description: 'Stories for late evenings.', visibility: 'public', itemCount: 1, origin: 'native' }, items: collection.items.slice(0, 1).map(item => ({ ...item, note: item.note ?? null, position: 1, origin: 'native', sourceKey: null })), owner: { username: 'animation_curator', displayName: null }, collaborators: [], viewerIsOwner: false, viewerCanEdit: false, viewerIsCollaborator: false, viewerHasSaved: Boolean(viewer) }
    }
    const isCopy = slug === `${collectionSlug}-copy`
    const value = isCopy ? collectionCopy : slug === collectionSlug ? collection : null
    const owner = isCopy || collectionRole === 'owner'
    const canEdit = Boolean(viewer === session.member.id && (owner || collectionRole === 'editor'))
    const profileOwner = await identity.repository.findByUsername(session.member.username)
    const publicListsVisible = profileOwner?.record.profile.sectionVisibility.lists ?? true
    if (!value || (!canEdit && value.visibility === 'public' && !publicListsVisible) || (value.visibility === 'private' && !canEdit)) return null
    return { list: { id: isCopy ? `${collectionId}-copy` : collectionId, slug, name: value.name, description: value.description, visibility: value.visibility, itemCount: value.items.length, origin: 'native' }, items: value.items.map((item, index) => ({ ...item, note: item.note ?? null, position: index + 1, origin: 'native', sourceKey: null })), owner: { username: owner ? session.member.username : 'collection_curator', displayName: null }, collaborators: canEdit ? collectionEditors : [], viewerIsOwner: Boolean(viewer && owner), viewerCanEdit: canEdit, viewerIsCollaborator: canEdit && !owner, viewerHasSaved: !owner && collectionSaved }
  },
  async addListCollaborator(_owner, id, input) {
    if (!collection || id !== collectionId || collectionRole !== 'owner' || input.username !== 'cine_editor') return false
    if (!collectionEditors.some(person => person.username === input.username)) collectionEditors.push({ memberId: 'fixture-editor', username: input.username, displayName: 'Cinema Editor' })
    return true
  },
  async removeListCollaborator(_owner, id, username) {
    if (!collection || id !== collectionId || collectionRole !== 'owner') return false
    collectionEditors = collectionEditors.filter(person => person.username !== username)
    return true
  },
  async deleteList(_owner, id) {
    if (!collection || id !== collectionId || collectionRole !== 'owner') return false
    collection = null; collectionEditors = []; return true
  },
  async saveList(_owner, slug) { if (!collection || slug !== collectionSlug || collection.visibility === 'private') return false; collectionSaved = true; savedCollectionName = collection.name; return true },
  async removeSavedList(_owner, id) { if (id === 'older-saved-collection') { olderBookmarkRemoved = true; return true }; if (id !== collectionId) return false; collectionSaved = false; return true },
  async duplicateList(owner, slug, input) {
    if (!collection || slug !== collectionSlug || collection.visibility !== 'public') return null
    if (!collectionCopyKeys.has(input.idempotencyKey)) {
      collectionCopyKeys.add(input.idempotencyKey)
      collectionCopy = { ...structuredClone(collection), revision: 0, name: input.name ?? `${collection.name} (copy)`, visibility: input.visibility, publishUpdate: false }
    }
    return memberData.list(`${collectionSlug}-copy`, owner)
  },
  async createList(owner, input) {
    if (!collectionCreationKeys.has(input.idempotencyKey)) {
      collectionCreationKeys.add(input.idempotencyKey)
      collection = { revision: 1, name: input.name, description: input.description ?? null, visibility: input.visibility, items: [], layout: tasteListLayoutSchema.parse({}), publishUpdate: false }
    }
    const result = await memberData.list(collectionSlug, owner)
    if (!result) throw new ApiError('NOT_FOUND', 'Collection not found.')
    return result
  },
}
const publicMembers: PublicMembers = {
  async profile(username, _viewer) {
    const member = await identity.repository.findByUsername(username)
    if (!member?.record.profile) return null
    const record = member.record
    const profile = record.profile
    const visibility = profile.sectionVisibility ?? defaultProfileSectionVisibility()
    const reviewCount = visibility.reviews && username === session.member.username
      ? (reviewFixture ? 1 : 0) + authoredTitleReviews.size
      : 0
    const diaryCount = username === session.member.username && (diaryArchiveFixture || publicDiaryArchivePages) ? 2 : 0
    return {
      viewerIsOwner: false,
      canonicalUsername: profile.username,
      profile: {
        id: record.id,
        username: profile.username,
        displayName: profile.displayName,
        avatarStyle: profile.avatarStyle,
        avatarUrl: profile.avatarUrl,
        isFollowing: false,
        bio: profile.bio,
        bannerUrl: profile.bannerUrl,
      },
      sectionVisibility: { ...visibility, tags: visibility.tags && visibility.reviews },
      favorites: visibility.favorites ? (favorites.get(record.id) ?? []).map((ref, index) => ({ ...ref, position: index + 1 })) : [],
      ratingDistribution: Array.from({ length: 10 }, (_, index) => ({ count: 0, value: index + 1 })),
      statistics: {
        activity: visibility.activity ? reviewCount + diaryCount : 0,
        diary: visibility.diary ? diaryCount : 0,
        history: visibility.history && watchHistoryFixture && username === session.member.username ? 1 : 0,
        lists: visibility.lists && collection?.visibility === 'public' && username === session.member.username ? 1 : 0,
        ratings: 0,
        reviews: reviewCount,
        watchlist: visibility.watchlist && watchlistFixture && username === session.member.username ? 2 : 0,
        watched: visibility.watched && watchedArchiveFixture && username === session.member.username ? 1 : 0,
      },
      social: { followers: 0, following: 0 },
    }
  },
  async search(_query, _cursor, _limit, _viewer) { return { items: [], nextCursor: null } },
  async collection(username, collectionKind, _cursor, _limit, _viewer) {
    const member = await identity.repository.findByUsername(username)
    if (!member?.record.profile) return null
    const visibility = member.record.profile.sectionVisibility ?? defaultProfileSectionVisibility()
    const section = collectionKind === 'followers' || collectionKind === 'following' ? 'network' : collectionKind
    if (!visibility[section]) return null
    if (collectionKind === 'reviews') {
      const reviews = username === session.member.username
        ? [...(reviewFixture ? [fixtureReview] : []), ...authoredTitleReviews.values()]
        : []
      return { collection: collectionKind, items: reviews.map(({ body, id, kind, reviewId, reviewedOn }) => ({ body, id, kind, reviewId, reviewedOn })), nextCursor: null }
    }
    if (collectionKind === 'lists') {
      const items = username === session.member.username && collection?.visibility === 'public'
        ? [{ id: collectionId, slug: collectionSlug, name: collection.name, description: collection.description, itemCount: collection.items.length }]
        : []
      return { collection: collectionKind, items, nextCursor: null }
    }
    return { collection: collectionKind, items: [], nextCursor: null }
  },
  async follow(_actor, _target, _following) {},
}
function mediaSession(input: ResolvePlaybackRequest): PlaybackSession {
  const expiresAt = new Date(Date.now() + 3600_000).toISOString()
  return { id: '13b84bb4-2a78-47ba-abbd-274f58a67256', ref: input.ref, source: { id: 'fixture-media', providerId: 'fixture', type: 'native', delivery: 'direct', src: `${origin}/v1/playback/relay-manifest?grant=${'fixture_'.repeat(5)}`, expiresAt, subtitles: [{ id: 'fr', label: 'French', language: 'fr', url: 'https://experience-media.example/french.vtt', format: 'vtt' }], skipSegments: [], qualityHint: '720p' }, expiresAt, fallbackCount: 0, capabilities: { refresh: true, fallback: true, externalSubtitles: true } }
}
const playback: Playback = {
  async beginAttempt(_owner, input, _signal, sessionId) {
    requests.push(input)
    if (!sessionId && playbackStartupFailureCount > 0) {
      playbackStartupFailureCount -= 1
      return { status: 'exhausted', attemptId: '13b84bb4-2a78-47ba-abbd-274f58a67257', tried: 1, total: 1 }
    }
    if (sessionId && playbackRecoveryFailureCount > 0) {
      playbackRecoveryFailureCount -= 1
      return { status: 'exhausted', attemptId: '13b84bb4-2a78-47ba-abbd-274f58a67257', tried: 1, total: 1 }
    }
    return { status: 'ready', attemptId: '13b84bb4-2a78-47ba-abbd-274f58a67257', tried: 1, total: 1, session: mediaSession(input) }
  },
  async resolve(_owner, input) { requests.push(input); return mediaSession(input) },
  async recover() {
    if (playbackRecoveryFailureCount > 0) {
      playbackRecoveryFailureCount -= 1
      throw new ApiError('AUTH_STATE_UNAVAILABLE', 'Fixture recovery failed.')
    }
    return mediaSession(requests.at(-1)!)
  },
  async listProviders() { return [{ id: 'fixture', label: 'Fixture', regions: [], health: 'ok' as const, deliveryMode: 'direct' as const, available: true, subtitles: [] }] },
  async switchProvider() { return mediaSession(requests.at(-1)!) },
  async listAudio() { return [] }, async prepareAudio() { throw new Error('No fixture alternate audio') },
  async events() {}, async relayManifest() { throw new Error('No fixture relay') },
}
const experienceAnimeTitle = {
  anilistId: 8, kind: 'anime' as const, titles: { preferred: 'Evening stories', english: null, romaji: null, native: null },
  format: 'TV' as const, status: 'RELEASING' as const, season: null, seasonYear: 2026, episodes: 10, episodeDuration: 24,
  genres: ['Drama'], coverImage: { url: null, color: null }, bannerImage: null, averageScore: null, popularity: 0,
  description: 'A quiet, deterministic anime fixture for browser experience coverage.', nextAiringEpisode: null,
  malId: null, logoUrl: null, source: null, countryOfOrigin: 'JP', trailer: null,
  characters: [], staff: [], streamingEpisodes: [], externalLinks: [], recommendations: [],
}
let homeCatalogMode: 'normal' | 'tmdb-outage' | 'empty' | 'loading' = 'normal'
let homeCatalogGate: { promise: Promise<void>; release: () => void } | null = null
function releaseHomeCatalogGate() {
  const gate = homeCatalogGate
  homeCatalogGate = null
  gate?.release()
}
function holdHomeCatalog() {
  releaseHomeCatalogGate()
  let release!: () => void
  const promise = new Promise<void>(resolve => { release = resolve })
  homeCatalogGate = { promise, release }
}
async function waitForHomeCatalogGate() {
  const gate = homeCatalogGate
  if (homeCatalogMode === 'loading' && gate) await gate.promise
}
const anime = {
  search: async (query: string) => {
    const items = experienceAnimeTitle.titles.preferred.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()) ? [experienceAnimeTitle] : []
    return { items, page: 1, totalPages: items.length > 0 ? 1 : 0, totalResults: items.length }
  },
  title: async () => experienceAnimeTitle,
  trending: async () => homeCatalogMode === 'empty'
    ? ({ items: [], page: 1, totalPages: 0, totalResults: 0, discoveryBasis: 'trending' as const })
    : ({ items: [experienceAnimeTitle], page: 1, totalPages: 1, totalResults: 1, discoveryBasis: 'trending' as const }),
  browse: async () => homeCatalogMode === 'empty'
    ? ({ items: [], page: 1, totalPages: 0, totalResults: 0 })
    : ({ items: [experienceAnimeTitle], page: 1, totalPages: 1, totalResults: 1 }),
  episode: async (anilistId: number, number: number) => ({ anilistId, number, title: number === 1 ? 'First light' : `Chapter ${number}`, description: 'A new journey begins.', thumbnail: null, airDate: null, duration: 24 }),
} as unknown as AnimeCatalog
const titles = [movieDetail, seriesDetail].map(title => ({ ...title, title: title.kind === 'movie' ? 'Northbound — a remarkably long title for a quiet evening at home' : title.title, posterUrl: null, backdropUrl: null, recommendations: [] }))
const experienceSeasons = [1, 2].map(seasonNumber => catalogSeasonSchema.parse({
  episodes: Array.from({ length: seasonNumber === 1 ? 9 : 10 }, (_, index) => ({
    airDate: seasonNumber === 1 ? '2022-02-17' : '2025-01-17',
    episodeNumber: index + 1,
    id: seasonNumber * 1000 + index + 1,
    overview: 'A deterministic episode for the browser experience fixture.',
    runtimeMinutes: 50,
    seasonNumber,
    stillUrl: null,
    title: `Season ${seasonNumber}, Episode ${index + 1}`,
  })),
  name: `Season ${seasonNumber}`,
  overview: '',
  posterUrl: null,
  seasonNumber,
  seriesId: seriesDetail.id,
}))
const fixtureCatalog = createFakeCatalog({ titles, seasons: experienceSeasons })
const homeCatalog = {
  ...fixtureCatalog,
  async discover(query: Parameters<typeof fixtureCatalog.discover>[0]) {
    await waitForHomeCatalogGate()
    if (homeCatalogMode === 'tmdb-outage') throw new CatalogError('CATALOG_UNAVAILABLE', 'Fixture catalog unavailable.', { retryable: true, statusCode: 503 })
    const result = await fixtureCatalog.discover(query)
    return homeCatalogMode === 'empty' ? { ...result, items: [], totalPages: 0, totalResults: 0 } : result
  },
  async batch(refs: Parameters<typeof fixtureCatalog.batch>[0]) {
    await waitForHomeCatalogGate()
    if (homeCatalogMode === 'tmdb-outage') throw new CatalogError('CATALOG_UNAVAILABLE', 'Fixture catalog unavailable.', { retryable: true, statusCode: 503 })
    const result = await fixtureCatalog.batch(refs)
    return homeCatalogMode === 'empty' ? { ...result, items: [] } : result
  },
}
const reviewAuthor = { id: session.member.id, username: session.member.username, name: session.member.username, avatarUrl: null }
const discussionAuthor = { id: 'experience-comment-author', username: 'comment_author', name: 'Comment author', avatarUrl: null }
const experienceBlocks = new Set<string>()
const experienceBlockKey = (actorId: string, targetId: string) => `${actorId}:${targetId}`
function initialEditionFixture(): EditionFixtureState {
  const data: TasteEdition = {
    month: '2026-10', title: 'The art of slowing down', introduction: 'Three stories that made an ordinary month feel worth remembering.',
    cover: { kind: 'movie', id: movieDetail.id },
    picks: [
      { kind: 'movie', id: movieDetail.id, reason: 'For the quiet moments between the lines.' },
      { kind: 'series', id: seriesDetail.id, reason: 'For a world worth returning to.' },
      { kind: 'anime', id: experienceAnimeTitle.anilistId, reason: 'For the small details that linger.' },
    ], reviewId: fixtureReview.reviewId, listId: collectionId,
  }
  return { data, published: structuredClone(data), revision: 1, publishedAt: '2026-10-28T12:00:00.000Z' }
}
const taste = {
  assertPublishingAllowed: async () => {},
  edition: async (username: string, month: string, viewer?: string, draft = false) => {
    if (editionFixture && username === session.member.username && month === editionFixture.data.month) {
      if (draft && viewer !== session.member.id) throw new ApiError('NOT_FOUND', 'Edition not found.')
      const data = draft ? editionFixture.data : editionFixture.published
      if (!data) throw new ApiError('NOT_FOUND', 'Edition not found.')
      return { id: 'experience-edition-2026-10', data: structuredClone(data), revision: editionFixture.revision, publishedAt: editionFixture.publishedAt, author: reviewAuthor, listHref: `/lists/${collectionSlug}` }
    }
    if (!reviewFixture || username !== session.member.username || month !== '2026-10') throw new ApiError('NOT_FOUND', 'Edition not found.')
    return {
      id: 'experience-edition-2026-10',
      data: {
        month,
        title: 'The art of slowing down',
        introduction: 'Three stories that made an ordinary month feel worth remembering.',
        cover: { kind: 'movie', id: movieDetail.id },
        picks: [
          { kind: 'movie', id: movieDetail.id, reason: 'For the quiet moments between the lines.' },
          { kind: 'series', id: seriesDetail.id, reason: 'For a world worth returning to.' },
          { kind: 'anime', id: experienceAnimeTitle.anilistId, reason: 'For the small details that linger.' },
        ],
        reviewId: fixtureReview.reviewId,
        listId: collectionId,
      },
      revision: 1,
      publishedAt: '2026-10-28T12:00:00.000Z',
      author: reviewAuthor,
      listHref: `/lists/${collectionSlug}`,
    }
  },
  saveEdition: async (ownerId: string, data: TasteEdition, revision: number, publish: boolean) => {
    if (!editionFixture || ownerId !== session.member.id) throw new ApiError('NOT_FOUND', 'Edition not found.')
    if (publish && editionPublishFailures > 0) { editionPublishFailures -= 1; throw new ApiError('AUTH_STATE_UNAVAILABLE', 'Edition publish failed. Try again.') }
    if (!publish && editionSaveFailures > 0) { editionSaveFailures -= 1; throw new ApiError('AUTH_STATE_UNAVAILABLE', 'Edition save failed. Try again.') }
    if (revision !== editionFixture.revision) throw new ApiError('CONFLICT', 'This edition changed. Reload the latest draft before saving.')
    editionFixture.data = structuredClone(data)
    editionFixture.revision += 1
    if (publish) { editionFixture.published = structuredClone(data); editionFixture.publishedAt = '2026-10-28T13:00:00.000Z' }
    return { revision: editionFixture.revision, id: 'experience-edition-2026-10' }
  },
  unpublishEdition: async (ownerId: string, month: string) => {
    if (!editionFixture || ownerId !== session.member.id || month !== editionFixture.data.month) return
    if (editionUnpublishFailures > 0) { editionUnpublishFailures -= 1; throw new ApiError('AUTH_STATE_UNAVAILABLE', 'Edition unpublish failed. Try again.') }
    editionFixture.published = null
    editionFixture.publishedAt = null
    editionFixture.revision += 1
  },
  share: async (kind: string, id: string) => {
    if (kind !== 'list' || id !== collectionId || !collection || collection.visibility === 'private') throw new ApiError('NOT_FOUND', 'Publication not found.')
    return { title: collection.name, description: collection.description ?? '', author: collectionRole === 'owner' ? session.member.username : 'collection_curator', href: `/lists/${collectionSlug}`, refs: collection.items.map(({ kind, id }) => ({ kind, id })), spoiler: false }
  },
  subscription: async (memberId: string, target: TasteTarget) => subscriptions.get(`${memberId}:${target.kind}:${target.id}`) ?? { subscribed: false, muted: false },
  subscribe: async (memberId: string, target: TasteTarget, mode: 'updates' | 'mute' | 'off' | 'unmute') => {
    const key = `${memberId}:${target.kind}:${target.id}`
    const current = subscriptions.get(key) ?? { subscribed: false, muted: false }
    subscriptions.set(key, {
      subscribed: mode === 'updates' ? true : mode === 'off' ? false : current.subscribed,
      muted: mode === 'mute' ? true : mode === 'unmute' ? false : current.muted,
    })
  },
  community: async (_viewer: string | undefined, mode: string, _query: string, _kind: string, cursor?: string) => {
    if (communityFailureCount > 0) {
      communityFailureCount -= 1
      throw new ApiError('AUTH_STATE_UNAVAILABLE', 'Community fixture unavailable. Try again.')
    }
    if (communityFollowingPaginationFixture && mode === 'following') {
      if (!cursor) {
        const nextCursor = communityCursorExpired && communityFirstPageRequests === 0
          ? 'experience-following-expired-page-two'
          : 'experience-following-page-two'
        communityFirstPageRequests += 1
        return { items: [
          { id: 'community-following-first-review', kind: 'review' as const, href: `/reviews/${fixtureReview.reviewId}`, title: 'The pauses leave room to think', excerpt: 'Some stories make their quiet moments count.', spoiler: false, date: '2026-10-28T12:00:00.000Z', author: reviewAuthor, refs: [{ kind: fixtureReview.kind, id: fixtureReview.id }] },
          { id: 'community-following-second-list', kind: 'list' as const, href: `/lists/${collectionSlug}`, title: 'Letters in the dark', excerpt: 'A collection for the long way home.', spoiler: false, date: '2026-10-27T12:00:00.000Z', author: reviewAuthor, refs: [] },
        ], nextCursor }
      }
      if (cursor === 'experience-following-expired-page-two') throw new ApiError('BAD_REQUEST', 'This Following page has expired.')
      if (cursor === 'experience-following-page-two') {
        if (communityPageFailureCount > 0) {
          communityPageFailureCount -= 1
          throw new ApiError('AUTH_STATE_UNAVAILABLE', 'Community publications could not be loaded. Try again.', { retryable: true })
        }
        return { items: [{ id: 'community-following-third-edition', kind: 'edition' as const, href: `/profile/${session.member.username}/editions/2026-10`, title: 'A season of small beginnings', excerpt: 'A few stories worth carrying forward.', spoiler: false, date: '2026-10-26T12:00:00.000Z', author: reviewAuthor, refs: [] }], nextCursor: null }
      }
      throw new ApiError('BAD_REQUEST', 'This Following page has expired.')
    }
    if (communityPaginationFixture && mode === 'discover') {
      if (!cursor) {
        const nextCursor = communityCursorExpired && communityFirstPageRequests === 0
          ? 'experience-community-expired-page-two'
          : 'experience-community-page-two'
        communityFirstPageRequests += 1
        return { items: [
          { id: 'community-first-list', kind: 'list' as const, href: `/lists/${collectionSlug}`, title: 'Quiet evenings, strange worlds', excerpt: 'Stories for an unhurried night.', spoiler: false, date: '2026-10-28T12:00:00.000Z', author: reviewAuthor, refs: [] },
          { id: 'community-second-list', kind: 'list' as const, href: `/lists/${collectionSlug}`, title: 'Letters from the coast', excerpt: 'A season of faraway places.', spoiler: false, date: '2026-10-27T12:00:00.000Z', author: reviewAuthor, refs: [] },
        ], nextCursor }
      }
      if (cursor === 'experience-community-expired-page-two') throw new ApiError('BAD_REQUEST', 'This collection page has expired.')
      if (cursor === 'experience-community-page-two') {
        if (communityPageFailureCount > 0) {
          communityPageFailureCount -= 1
          throw new ApiError('AUTH_STATE_UNAVAILABLE', 'Community collections could not be loaded. Try again.', { retryable: true })
        }
        return { items: [{ id: 'community-third-list', kind: 'list' as const, href: `/lists/${collectionSlug}`, title: 'Small stories, long shadows', excerpt: 'The details that stay after the credits.', spoiler: false, date: '2026-10-26T12:00:00.000Z', author: reviewAuthor, refs: [] }], nextCursor: null }
      }
      throw new ApiError('BAD_REQUEST', 'This collection page has expired.')
    }
    if (communityRecoveryFixture && mode === 'discover') return { items: [{ id: 'recovered-community-list', kind: 'list', href: `/lists/${collectionSlug}`, title: 'Quiet evenings, strange worlds', excerpt: 'Stories for an unhurried night.', spoiler: false, date: '2026-10-28T12:00:00.000Z', author: reviewAuthor, refs: [] }], nextCursor: null }
    return { items: reviewFixture && mode === 'following' ? [{ id: fixtureReview.reviewId, kind: 'review', href: `/reviews/${fixtureReview.reviewId}`, title: 'A quiet journey', excerpt: fixtureReview.body, spoiler: communitySpoilerFixture, date: '2026-10-27T12:00:00.000Z', author: reviewAuthor, refs: [{ kind: fixtureReview.kind, id: fixtureReview.id }] }] : [], nextCursor: null }
  },
  review: async (id: string, viewer?: string) => {
    if (!reviewFixture || id !== fixtureReview.reviewId) throw new ApiError('NOT_FOUND', 'Review not found.')
    if (viewer && (experienceBlocks.has(experienceBlockKey(viewer, reviewAuthor.id)) || experienceBlocks.has(experienceBlockKey(reviewAuthor.id, viewer)))) throw new ApiError('NOT_FOUND', 'Review not found.')
    return { ...fixtureReview, spoiler: false, season: null, episode: null, rating: 8, revision: 1, createdAt: '2026-10-27T12:00:00.000Z', author: reviewAuthor, likes: 0, liked: false, owner: viewer === session.member.id }
  },
  block: async (actorId: string, targetId: string, enabled: boolean) => {
    const key = experienceBlockKey(actorId, targetId)
    if (enabled) experienceBlocks.add(key)
    else experienceBlocks.delete(key)
  },
  discussion: async (target: TasteTarget, viewer?: string) => ({
    items: discussionFixture && target.kind === 'review' && target.id === fixtureReview.reviewId && !(viewer && (experienceBlocks.has(experienceBlockKey(viewer, discussionAuthor.id)) || experienceBlocks.has(experienceBlockKey(discussionAuthor.id, viewer)))) ? [{
      id: 'experience-comment', parentId: null, body: 'The second reading makes this moment even better.', spoiler: false,
      createdAt: '2026-10-28T12:00:00.000Z', revision: 1, author: discussionAuthor, owner: false, deleted: false,
    }] : [],
    nextCursor: null, muted: false, canComment: Boolean(viewer),
  }),
  reports: async () => ({ items: moderationReports.filter(report => report.status === 'open' || report.status === 'restrict') }),
  moderate: async (_actorId: string, reportId: string, action: 'dismiss' | 'remove' | 'restrict' | 'restore', _note: string) => {
    if (moderationFailure) {
      moderationFailure = false
      throw new ApiError('AUTH_STATE_UNAVAILABLE', 'Moderation is temporarily unavailable.')
    }
    const report = moderationReports.find(item => item.id === reportId)
    if (!report) throw new ApiError('NOT_FOUND', 'Report not found.')
    report.status = action
  },
  listLayout: async (id: string) => { const value = id === `${collectionId}-copy` ? collectionCopy : collection; return { layout: value?.layout ?? tasteListLayoutSchema.parse({}), revision: value?.revision ?? 0, watched: [] } },
  draft: async (owner: string, key: string) => key.startsWith('review-')
    ? tasteDrafts.get(`${owner}:${key}`) ?? { data: {}, revision: 0 }
    : collectionDraft,
  saveDraft: async (owner: string, key: string, data: Record<string, unknown>, revision: number) => {
    if (key.startsWith('review-')) {
      const draftKey = `${owner}:${key}`
      const current = tasteDrafts.get(draftKey) ?? { data: {}, revision: 0 }
      if (revision !== current.revision) throw new ApiError('CONFLICT', 'The private draft changed. Reload to recover it.')
      const updated = { data, revision: revision + 1 }
      tasteDrafts.set(draftKey, updated)
      return updated
    }
    if (revision !== collectionDraft.revision) throw new ApiError('CONFLICT', 'The private draft changed. Reload to recover it.')
    collectionDraft = { data, revision: revision + 1 }; return collectionDraft
  },
  publishReview: async (owner: string, input: TasteReviewWrite) => {
    if (owner !== session.member.id) throw new ApiError('NOT_FOUND', 'Review not found.')
    if (publishReviewFailures > 0) {
      publishReviewFailures -= 1
      throw new ApiError('AUTH_STATE_UNAVAILABLE', 'Review publishing is temporarily unavailable. Your draft is safe.')
    }
    const reviewId = input.reviewId ?? `experience-authored-title-review-${input.kind}-${input.id}`
    authoredTitleReviews.set(authoredReviewKey(input), {
      body: input.body,
      id: input.id,
      kind: input.kind,
      origin: 'native',
      reviewId,
      reviewedOn: input.log?.watchedOn ?? null,
      sourceKey: null,
      tags: input.log?.tags ?? [],
    })
    return { reviewId }
  },
  saveList: async (_owner: string, _id: string, input: TasteListWrite) => {
    if (_id === collectionId && collectionRole === 'visitor') throw new ApiError('NOT_FOUND', 'This collection is no longer available to edit.')
    const current = _id === `${collectionId}-copy` ? collectionCopy : collection
    if (!current || input.revision !== current.revision) throw new ApiError('CONFLICT', 'This collection changed. Your edits are still here.')
    const updated = { ...input, revision: input.revision + 1 }
    if (_id === `${collectionId}-copy`) collectionCopy = updated
    else collection = updated
    return { revision: updated.revision }
  },
} as unknown as TasteRepository
const app = await buildApp({ env: loadEnv({ NODE_ENV: 'test', APP_ORIGIN: origin }), enableRateLimit: false, identity, memberData, publicMembers, experience, playback, taste, animeCapability: createTestAnimeCapability(anime as AnimeCatalog, {
  canonicalEpisodeArt: {
    episodeByAnilistId: async (anilistId, episode) => anilistId === 8 && episode === 1
      ? { title: 'First light', synopsis: 'A new journey begins.', stillUrl: null, airDate: null }
      : null,
  },
}), catalog: homeCatalog })
const visualSessions = new Map<string, typeof session>()
app.get('/__fixtures/session', async request => {
  const label = (request.query as { label?: string }).label
  if (!label) return { token: session.sessionToken, member: session.member }
  if (label === 'admin') {
    if (!adminSession) {
      await identity.register({ username: 'experience_admin', email: 'experience-admin@example.test', password: 'experience-fixture-password' })
      const adminDelivery = identity.notifier.deliveries.findLast(item => item.kind === 'verification')
      if (!adminDelivery || !('code' in adminDelivery)) throw new Error('Missing admin fixture code')
      adminSession = await identity.verifyEmail({ email: 'experience-admin@example.test', code: adminDelivery.code })
      await identity.repository.setRole(adminSession.member.id, 'ADMIN')
    }
    return { token: adminSession.sessionToken, member: await identity.getSession(adminSession.sessionToken) }
  }
  if (!/^(desktop|mobile)-(dark|light)$/.test(label) && !['settings-recovery', 'settings-delete', 'settings-password', 'settings-export'].includes(label)) throw new Error('Invalid fixture label')
  let scoped = visualSessions.get(label)
  if (!scoped) {
    const name = `visual_${label.replaceAll('-', '_')}`
    await identity.register({ username: name, email: `${name}@example.test`, password: 'experience-fixture-password' })
    const delivery = identity.notifier.deliveries.findLast(item => item.kind === 'verification')!
    if (!('code' in delivery)) throw new Error('Missing visual fixture code')
    scoped = await identity.verifyEmail({ email: `${name}@example.test`, code: delivery.code })
    visualSessions.set(label, scoped)
  }
  return { token: scoped.sessionToken, member: scoped.member }
})
app.get('/__fixtures/state', async () => ({ requests, preferences: [...values.entries()], favorites: [...favorites.entries()], progress: [...progressRecords.values()] }))
app.get('/__fixtures/code', async () => ({ code: identity.notifier.deliveries.findLast(item => item.kind === 'verification') }))
app.get('/__fixtures/recovery-code', async () => ({ code: identity.notifier.deliveries.findLast(item => item.kind === 'recovery') }))
app.post('/__fixtures/advance-identity-clock', async request => {
  const milliseconds = (request.body as { milliseconds?: number }).milliseconds
  if (!Number.isSafeInteger(milliseconds) || milliseconds === undefined || milliseconds < 0 || milliseconds > 660_000) throw new Error('Invalid fixture clock advance')
  identityClockOffset += milliseconds
  return { advanced: true }
})
app.post('/__fixtures/reset', { config: { rateLimit: false } }, async request => {
  identityClockOffset = 0
  await identity.updateProfile(session.sessionToken, { sectionVisibility: defaultProfileSectionVisibility() })
  homeCatalogMode = 'normal'
  releaseHomeCatalogGate()
  const body = request.body as { saveFailure?: boolean; preferences?: ExperiencePreferences; memberId?: string; recoveryFailureCount?: number; startupFailureCount?: number; startupProgressSeconds?: number; reviewFixture?: boolean; titleReviewFixture?: boolean; publishReviewFailures?: number; discussionFixture?: boolean; communitySpoilerFixture?: boolean; communityFailureCount?: number; profileArchiveFailureCount?: number; communityRecoveryFixture?: boolean; communityPaginationFixture?: boolean; communityFollowingPaginationFixture?: boolean; communityPageFailureCount?: number; communityCursorExpired?: boolean; moderationFixture?: boolean; moderationFailure?: boolean; collectionFixture?: boolean; collectionAtTitleLimit?: boolean; collectionAtChapterLimit?: boolean; collectionDraft?: boolean; staleCollectionDraft?: boolean; collectionRole?: 'owner' | 'visitor' | 'editor'; publicCollection?: boolean; savedArchivePages?: boolean; archiveOlderAvailable?: boolean; ownedArchivePages?: boolean; watchHistoryFixture?: boolean; watchlistFixture?: boolean; watchedArchiveFixture?: boolean; diaryArchiveFixture?: boolean; ratingDistributionFixture?: boolean; publicDiaryArchivePages?: boolean; editionFixture?: boolean; editionSaveFailures?: number; editionPublishFailures?: number; editionUnpublishFailures?: number }
  values.clear(); favorites.clear(); progressRecords.clear(); subscriptions.clear(); tasteDrafts.clear(); authoredTitleReviews.clear(); publishReviewFailures = body?.publishReviewFailures ?? 0; playbackRecoveryFailureCount = body?.recoveryFailureCount ?? 0; playbackStartupFailureCount = body?.startupFailureCount ?? 0; requests.length = 0; saveFailure = body?.saveFailure ?? false
  watchHistoryFixture = body?.watchHistoryFixture ?? false
  if (body?.startupProgressSeconds !== undefined) {
    const ref = { kind: 'movie' as const, id: movieDetail.id }
    const positionSeconds = body.startupProgressSeconds
    if (!Number.isSafeInteger(positionSeconds) || positionSeconds < 1 || positionSeconds > 30) throw new Error('Invalid startup progress fixture')
    progressRecords.set(progressKey(body.memberId ?? session.member.id, ref), playbackProgressSchema.parse({ ...ref, completed: false, durationSeconds: 30, positionSeconds, updatedAt: '2026-10-30T12:00:00.000Z' }))
  }
  watchlistFixture = body?.watchlistFixture ?? false
  watchedArchiveFixture = body?.watchedArchiveFixture ?? false
  diaryArchiveFixture = body?.diaryArchiveFixture ?? false
  ratingDistributionFixture = body?.ratingDistributionFixture ?? false
  publicDiaryArchivePages = body?.publicDiaryArchivePages ?? false
  editionFixture = body?.editionFixture ? initialEditionFixture() : null
  editionSaveFailures = body?.editionSaveFailures ?? 0
  editionPublishFailures = body?.editionPublishFailures ?? 0
  editionUnpublishFailures = body?.editionUnpublishFailures ?? 0
  reviewFixture = body?.reviewFixture ?? false
  experienceBlocks.clear()
  titleReviewFixture = body?.titleReviewFixture ?? false
  discussionFixture = body?.discussionFixture ?? false
  communitySpoilerFixture = body?.communitySpoilerFixture ?? false
  communityFailureCount = body?.communityFailureCount ?? 0
  profileArchiveFailureCount = body?.profileArchiveFailureCount ?? 0
  communityRecoveryFixture = body?.communityRecoveryFixture ?? false
  communityPaginationFixture = body?.communityPaginationFixture ?? false
  communityFollowingPaginationFixture = body?.communityFollowingPaginationFixture ?? false
  communityPageFailureCount = body?.communityPageFailureCount ?? 0
  communityCursorExpired = body?.communityCursorExpired ?? false
  communityFirstPageRequests = 0
  moderationFailure = body?.moderationFailure ?? false
  moderationReports = body?.moderationFixture ? [{
    id: 'experience-moderation-report', reason: 'The ending is revealed in this review.',
    target: { kind: 'review', id: 'experience-review' }, commentId: null,
    createdAt: '2026-10-28T12:00:00.000Z', status: 'open',
    content: 'The ending reveals the hidden identity of the visitor.', href: '/reviews/experience-review',
  }] : []
  collection = body?.collectionFixture ? initialCollection() : null
  if (collection && body?.collectionAtTitleLimit) { collection.items = [collection.items[0]!, ...Array.from({ length: 499 }, (_, index) => ({ kind: 'movie' as const, id: 900000 + index, note: null }))]; collection.layout.assignments = {} }
  if (collection && body?.collectionAtChapterLimit) collection.layout.chapters = [collection.layout.chapters[0]!, ...Array.from({ length: 29 }, (_, index) => ({ id: `limit-chapter-${index + 2}`, name: `Evening ${String(index + 2).padStart(2, '0')}`, introduction: '' }))]
  collectionCreationKeys.clear(); collectionCopyKeys.clear(); collectionCopy = null
  collectionRole = body?.collectionRole ?? 'owner'; collectionSaved = false; collectionEditors = []
  if (body?.publicCollection && collection) collection.visibility = 'public'
  ownedArchivePages = body?.ownedArchivePages ?? false; savedArchivePages = body?.savedArchivePages ?? false; olderBookmarkRemoved = false; archiveOlderAvailable = body?.archiveOlderAvailable ?? false
  if (savedArchivePages && collection) { collectionSaved = true; savedCollectionName = collection.name }
  collectionDraft = { data: body?.collectionDraft && collection ? { ...collection, name: 'An unfinished private collection' } : {}, revision: 0 }
  if (body?.staleCollectionDraft && collection) collection = { ...collection, revision: collection.revision + 1, name: 'Latest saved collection', description: 'A newer saved introduction.' }
  if (body?.preferences) values.set(body.memberId ?? session.member.id, body.preferences)
  return { ok: true }
})
app.post('/__fixtures/home-catalog-mode', { config: { rateLimit: false } }, async request => {
  const mode = (request.body as { mode?: string })?.mode
  if (mode !== 'normal' && mode !== 'tmdb-outage' && mode !== 'empty' && mode !== 'loading') throw new Error('Invalid Home catalog fixture mode')
  if (mode === 'loading') holdHomeCatalog()
  else releaseHomeCatalogGate()
  homeCatalogMode = mode
  return { ok: true }
})
app.post('/__fixtures/release-home-catalog', { config: { rateLimit: false } }, async () => {
  homeCatalogMode = 'normal'
  releaseHomeCatalogGate()
  return { ok: true }
})
app.post('/__fixtures/collection-availability', async request => {
  const visibility = (request.body as { visibility: string }).visibility
  if (visibility !== 'public' && visibility !== 'unlisted' && visibility !== 'private') throw new Error('Invalid collection visibility')
  if (collection) collection.visibility = visibility
  return { ok: true }
})
app.post('/__fixtures/collection-access', async request => {
  const role = (request.body as { role: string }).role
  if (role !== 'owner' && role !== 'editor' && role !== 'visitor') throw new Error('Invalid collection fixture role')
  collectionRole = role
  return { ok: true }
})
app.post('/__fixtures/recover', async () => { saveFailure = false; return { ok: true } })
app.get('/v1/experience-fixture/subtitles', async (_request, reply) => reply.type('text/vtt').send('WEBVTT\n\n00:00:00.000 --> 00:00:30.000\nSous-titres de démonstration.\n'))
app.get('/v1/experience-fixture/media', async (request, reply) => {
  const file = await readFile(new URL('../playback/media/reference.mp4', import.meta.url))
  const match = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/)
  const start = match ? Math.min(Number(match[1]), file.length - 1) : 0, end = match?.[2] ? Math.min(Number(match[2]), file.length - 1) : file.length - 1
  reply.type('video/mp4').header('accept-ranges', 'bytes')
  if (match) reply.code(206).header('content-range', `bytes ${start}-${end}/${file.length}`)
  return reply.send(file.subarray(start, end + 1))
})
app.addHook('onRequest', async (request, reply) => {
  if (!request.url.startsWith('/v1/playback/relay-manifest?grant=fixture_')) return
  const file = await readFile(new URL('../playback/media/reference.mp4', import.meta.url))
  const match = request.headers.range?.match(/^bytes=(\d+)-(\d*)$/)
  const start = match ? Math.min(Number(match[1]), file.length - 1) : 0, end = match?.[2] ? Math.min(Number(match[2]), file.length - 1) : file.length - 1
  reply.type('video/mp4').header('accept-ranges', 'bytes')
  if (match) reply.code(206).header('content-range', `bytes ${start}-${end}/${file.length}`)
  return reply.send(file.subarray(start, end + 1))
})
await app.listen({ host: '0.0.0.0', port: 18563 })
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => void app.close())
