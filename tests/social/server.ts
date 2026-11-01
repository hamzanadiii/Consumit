import { buildApp } from '../../apps/api/src/app'
import { loadEnv } from '../../apps/api/src/config/env'
import { createFakeIdentity } from '../../apps/api/src/identity/fake-identity'
import { createFakeCatalog } from '../../apps/api/src/catalog/fake-catalog'
import { unavailableMemberData } from '../../apps/api/src/member-data/unavailable-member-data'
import type { MemberData } from '../../apps/api/src/member-data/member-data'
import type { PublicMembers } from '../../apps/api/src/member-data/public-members'
import { ApiError } from '../../apps/api/src/http/errors'
import { movieDetail } from '../../apps/web/src/test/catalog-fixtures'
import { defaultProfileSectionVisibility } from '../../packages/contracts/src/index'
import type { MemberListDetail, MemberProfileArchivePage, MemberProfileData, PublicProfile, PublicMemberSummary } from '@consumit/contracts'
import type { TasteRepository } from '../../apps/api/src/taste/repository'

process.env.NODE_ENV = 'test'
const identity = createFakeIdentity()
async function register(username: string) {
  const email = `${username}@example.test`
  await identity.register({ username, email, password: 'social-fixture-password' })
  const delivery = identity.notifier.deliveries.findLast(item => item.kind === 'verification')!
  if (!('code' in delivery)) throw new Error('Missing code')
  return identity.verifyEmail({ email, code: delivery.code })
}
const owner = await register('social_owner'), target = await register('cinephile'), secondTarget = await register('cine_curator')
const publicSections = { ...defaultProfileSectionVisibility(), watched: false, diary: false, history: false, likes: false, tags: false, watchlist: false }
await identity.updateProfile(target.sessionToken, { displayName: 'Samira — Cinema after midnight', bio: 'Stories that stay with you. Slow cinema, distant worlds, and a very long watchlist.', sectionVisibility: publicSections })
await identity.updateProfile(secondTarget.sessionToken, { displayName: 'Nour — Frame by frame' })
let following = false, followError = false, searchError = false, searchMoreError = false
let archiveMoreError = false
let blockedTarget = false, blockReadError = false, unblockError = false
const distribution = Array.from({ length: 10 }, (_, index) => ({ count: index === 7 ? 1 : 0, value: index + 1 }))
const list: MemberListDetail = { viewerIsOwner: true, viewerHasSaved: false, viewerCanEdit: true, viewerIsCollaborator: false, collaborators: [], owner: { username: 'social_owner', displayName: 'Social Owner' }, list: { id: 'fixture-list', slug: 'social-list', name: 'Quiet evenings', description: 'A list to return to.', itemCount: 1, origin: 'native', visibility: 'private' }, items: [{ id: movieDetail.id, kind: 'movie', note: 'Watch slowly.', position: 1, origin: 'native', sourceKey: null }] }
async function summary(member = target): Promise<PublicMemberSummary> {
  const p = await identity.getOwnProfile(member.sessionToken)
  return { id: member.member.id, username: p.username, displayName: p.displayName, avatarStyle: p.avatarStyle, avatarUrl: null, isFollowing: member.member.id === target.member.id && following }
}
const social: PublicMembers = {
  async profile(username) {
    if (!['cinephile', 'old_cinephile', 'cine_curator'].includes(username)) return null
    const member = username === 'cine_curator' ? secondTarget : target
    const p = await identity.getOwnProfile(member.sessionToken)
    return { viewerIsOwner: false, canonicalUsername: p.username, sectionVisibility: p.sectionVisibility, profile: { ...await summary(member), bio: p.bio, bannerUrl: null }, favorites: [{ kind: 'movie', id: movieDetail.id, position: 1 }], ratingDistribution: distribution, statistics: { activity: p.sectionVisibility.activity ? Number(p.sectionVisibility.diary) + Number(p.sectionVisibility.reviews) : 0, diary: p.sectionVisibility.diary ? 1 : 0, history: p.sectionVisibility.history ? 1 : 0, lists: 0, ratings: 1, reviews: p.sectionVisibility.reviews ? 1 : 0, watchlist: p.sectionVisibility.watchlist ? 1 : 0, watched: p.sectionVisibility.watched ? 1 : 0 }, social: { followers: member.member.id === target.member.id && following ? 1 : 0, following: 0 } } satisfies PublicProfile
  },
  async search(q, cursor) {
    if (searchError || (cursor && searchMoreError)) throw new ApiError('AUTH_STATE_UNAVAILABLE', 'Fixture search unavailable.')
    if (!'cinephile samira cine_curator nour'.includes(q.toLowerCase())) return { items: [], nextCursor: null }
    if (cursor) return { items: [await summary(secondTarget)], nextCursor: null }
    return { items: [await summary()], nextCursor: 'fixture-search-next' }
  },
  async listDiscovery() {
    return {
      newFromNetwork: [],
      popular: [{
        list: { id: 'fixture-discovery-list', slug: 'quiet-evenings', name: 'Quiet evenings', description: 'A list to return to.', itemCount: 1 },
        owner: { username: 'cinephile', displayName: 'Samira — Cinema after midnight' },
        preview: [{ kind: 'movie', id: movieDetail.id }],
      }],
    }
  },
  async collection(username, collection) {
    if (username === 'social_owner') {
      if (collection === 'following') return { collection, items: following ? [{ ...await summary(), private: false }] : [], nextCursor: null }
      if (collection === 'followers') return { collection, items: [], nextCursor: null }
    }
    if (!await social.profile(username)) return null
    if (collection === 'ratings') return { collection, items: [{ kind: 'movie', id: movieDetail.id, value: 8 }], nextCursor: null }
    if (collection === 'reviews') return { collection, items: [{ kind: 'movie', id: movieDetail.id, reviewId: 'fixture-review', body: 'A world worth getting lost in. Every quiet moment holds its own weight.', reviewedOn: '2026-10-01' }], nextCursor: null }
    return { collection, items: [], nextCursor: null }
  },
  async follow(_actor, _target, next) {
    if (followError) { followError = false; throw new ApiError('AUTH_STATE_UNAVAILABLE', 'Fixture follow unavailable.') }
    following = next
  },
}
const memberData: MemberData = {
  ...unavailableMemberData,
  async profile(username, viewer) {
    if (viewer !== owner.member.id || username !== 'social_owner') return null
    const profile = await identity.getOwnProfile(owner.sessionToken)
    return { canonicalUsername: profile.username, profile, favorites: [{ id: movieDetail.id, kind: 'movie', position: 1, origin: 'native', sourceKey: null }], diary: [], lists: [list.list], reviews: [], ratingDistribution: distribution, social: { followers: 0, following: following ? 1 : 0 }, statistics: { activity: 0, diaryEntries: 0, history: 0, lists: 1, reviews: 0, watchlist: 0, watched: 0 } } satisfies MemberProfileData
  },
  async list(slug, viewer) {
    if (slug !== list.list.slug) return null
    if (viewer === owner.member.id) return list
    const p = await identity.getOwnProfile(owner.sessionToken)
    return list.list.visibility === 'public' ? { ...list, viewerIsOwner: false } : null
  },
  async updateListContent(_member, _id, changes) { Object.assign(list.list, { name: changes.name, description: changes.description, visibility: changes.visibility }); return true },
  async librarySnapshot() { return { diary: { items: [], nextCursor: null }, lists: { items: [list.list], nextCursor: null }, saved: { items: [], nextCursor: null }, favorites: [] } },
  async profileArchive(username, collection, viewer, cursor) {
    if (username !== 'cinephile') return null
    if (cursor && archiveMoreError) throw new ApiError('AUTH_STATE_UNAVAILABLE', 'Fixture archive page unavailable.')
    const profile = await identity.getOwnProfile(target.sessionToken)
    const section = collection === 'films' ? 'watched' : collection
    if (viewer !== target.member.id && (!profile.sectionVisibility[section] || (collection === 'tags' && !profile.sectionVisibility.reviews))) return null
    const title = { id: movieDetail.id, kind: 'movie' as const, origin: 'native' as const, sourceKey: null }
    const diary = { ...title, entryId: 'public-diary', rewatch: false, tags: ['after-hours'], watchedOn: '2026-10-01' }
    const review = { ...title, reviewId: 'public-review', body: 'A world worth getting lost in.', reviewedOn: '2026-10-02', tags: ['after-hours'] }
    const extraDiary = { ...title, entryId: 'public-diary-2', rewatch: true, tags: ['returning'], watchedOn: '2026-09-30' }
    const extraReview = { ...title, reviewId: 'public-review-2', body: 'A second look reveals another story.', reviewedOn: '2026-09-30', tags: [] }
    const pages: Record<string, MemberProfileArchivePage> = {
      activity: { collection: 'activity', items: cursor ? [
        ...(profile.sectionVisibility.diary ? [{ occurredAt: '2026-09-30T12:00:00.000Z', kind: 'diary' as const, item: extraDiary }] : []),
        ...(profile.sectionVisibility.reviews ? [{ occurredAt: '2026-09-30T11:00:00.000Z', kind: 'review' as const, item: extraReview }] : []),
      ] : [
        ...(profile.sectionVisibility.reviews ? [{ occurredAt: '2026-10-02T12:00:00.000Z', kind: 'review' as const, item: review }] : []),
        ...(profile.sectionVisibility.diary ? [{ occurredAt: '2026-10-01T12:00:00.000Z', kind: 'diary' as const, item: diary }] : []),
      ], nextCursor: cursor ? null : JSON.stringify({ collection: 'activity', id: 'next', createdAt: '2026-09-30T12:00:00.000Z', kind: 'diary' }) },
      diary: { collection: 'diary', items: cursor ? [extraDiary] : [diary], nextCursor: cursor ? null : JSON.stringify({ collection: 'diary', id: 'public-diary', watchedOn: '2026-10-01T00:00:00.000Z', createdAt: '2026-10-01T12:00:00.000Z' }) },
      films: { collection: 'films', items: [title], nextCursor: null },
      history: { collection: 'history', items: [{ id: movieDetail.id, kind: 'movie', entryId: 'public-history', completedAt: '2026-10-03T12:00:00.000Z' }], nextCursor: null },
      likes: { collection: 'likes', items: [title], nextCursor: null },
      reviews: { collection: 'reviews', items: [review], nextCursor: null },
      tags: { collection: 'tags', items: [{ count: 2, tag: 'after-hours' }], nextCursor: null },
      watchlist: { collection: 'watchlist', items: [{ id: movieDetail.id, kind: 'movie' }], nextCursor: null },
    }
    return pages[collection] ?? null
  },
}
const layout = { genres: [] as ('Drama')[], preset: 'collection' as const, cover: null, chapters: [], assignments: {} }
let layoutRevision = 1
const taste = {
  async listLayout() { return { layout, revision: layoutRevision, watched: [] } },
  async blocks() {
    if (blockReadError) throw new ApiError('AUTH_STATE_UNAVAILABLE', 'Blocked members are temporarily unavailable.')
    return { items: blockedTarget ? [{ id: target.member.id, username: 'cinephile', name: 'Samira — Cinema after midnight', avatarUrl: null }] : [] }
  },
  async block(_memberId: string, _targetId: string, enabled: boolean) {
    if (!enabled && unblockError) { unblockError = false; throw new ApiError('AUTH_STATE_UNAVAILABLE', 'The unblock could not be saved.') }
    blockedTarget = enabled
  },
  async community() {
    return { items: [{ id: list.list.id, kind: 'list' as const, href: `/lists/${list.list.slug}`, title: list.list.name, excerpt: list.list.description ?? '', spoiler: false, date: '2026-10-27T00:00:00.000Z', author: { id: owner.member.id, username: 'social_owner', name: 'Social Owner', avatarUrl: null }, refs: list.items.map(({ id, kind }) => ({ id, kind })) }], nextCursor: null }
  },
  async saveList(_memberId: string, listId: string, input: { name: string; description: string | null; visibility: 'public' | 'unlisted' | 'private'; items: Array<{ kind: 'movie' | 'series' | 'anime'; id: number; note?: string | null }> }) {
    if (listId !== list.list.id) throw new ApiError('NOT_FOUND', 'List not found.')
    Object.assign(list.list, { name: input.name, description: input.description, visibility: input.visibility, itemCount: input.items.length })
    list.items = input.items.map((item, index) => ({ ...item, note: item.note ?? null, position: index + 1, origin: 'native', sourceKey: null }))
    layoutRevision += 1
    return { revision: layoutRevision }
  },
} as unknown as TasteRepository
const app = await buildApp({ env: loadEnv({ NODE_ENV: 'test', APP_ORIGIN: 'http://127.0.0.1:28113' }), identity, memberData, publicMembers: social, taste, catalog: createFakeCatalog({ titles: [movieDetail] }), enableRateLimit: false })
app.get('/__fixtures/session', async () => ({ token: owner.sessionToken }))
app.post('/__fixtures/reset', { config: { rateLimit: false } }, async request => {
  const body = request.body as { followError?: boolean; searchError?: boolean; searchMoreError?: boolean; archiveMoreError?: boolean; publicArchives?: boolean; hideReviews?: boolean; blockedTarget?: boolean; blockReadError?: boolean; unblockError?: boolean }
  following = false; followError = body?.followError ?? false; searchError = body?.searchError ?? false; searchMoreError = body?.searchMoreError ?? false
  archiveMoreError = body?.archiveMoreError ?? false
  blockedTarget = body?.blockedTarget ?? false; blockReadError = body?.blockReadError ?? false; unblockError = body?.unblockError ?? false
  list.list.visibility = 'private'
  const visibility = body?.publicArchives ? defaultProfileSectionVisibility() : publicSections
  await identity.updateProfile(target.sessionToken, { sectionVisibility: body?.hideReviews ? { ...visibility, reviews: false, tags: true } : visibility })
  await identity.updateProfile(owner.sessionToken, { sectionVisibility: defaultProfileSectionVisibility() })
  return { ok: true }
})
app.post('/__fixtures/archive-more-recover', async () => { archiveMoreError = false; return { ok: true } })
app.post('/__fixtures/search-recover', async () => { searchError = false; return { ok: true } })
app.post('/__fixtures/search-more-recover', async () => { searchMoreError = false; return { ok: true } })
await app.listen({ host: '127.0.0.1', port: 18562 })
