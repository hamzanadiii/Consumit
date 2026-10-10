import { buildApp } from '../../apps/api/src/app'
import { loadEnv } from '../../apps/api/src/config/env'
import { createFakeIdentity } from '../../apps/api/src/identity/fake-identity'
import { createFakeCatalog } from '../../apps/api/src/catalog/fake-catalog'
import { unavailableMemberData } from '../../apps/api/src/member-data/unavailable-member-data'
import type { MemberData } from '../../apps/api/src/member-data/member-data'
import type { PublicMembers } from '../../apps/api/src/member-data/public-members'
import { ApiError } from '../../apps/api/src/http/errors'
import { movieDetail } from '../../apps/web/src/test/catalog-fixtures'
import type { MemberListDetail, MemberProfileData, PublicProfile, PublicMemberSummary } from '@consumit/contracts'

process.env.NODE_ENV = 'test'
const identity = createFakeIdentity()
async function register(username: string) {
  const email = `${username}@example.test`
  await identity.register({ username, email, password: 'social-fixture-password' })
  const delivery = identity.notifier.deliveries.findLast(item => item.kind === 'verification')!
  if (!('code' in delivery)) throw new Error('Missing code')
  return identity.verifyEmail({ email, code: delivery.code })
}
const owner = await register('social_owner'), target = await register('cinephile')
await identity.updateProfile(target.sessionToken, { displayName: 'Samira — Cinema after midnight', bio: 'Stories that stay with you. Slow cinema, distant worlds, and a very long watchlist.', visibility: 'public' })
let following = false, followError = false, searchError = false
const distribution = Array.from({ length: 10 }, (_, index) => ({ count: index === 7 ? 1 : 0, value: index + 1 }))
const list: MemberListDetail = { viewerIsOwner: true, owner: { username: 'social_owner', displayName: 'Social Owner' }, list: { id: 'fixture-list', slug: 'social-list', name: 'Quiet evenings', description: 'A list to return to.', itemCount: 1, origin: 'native', visibility: 'private' }, items: [{ id: movieDetail.id, kind: 'movie', note: 'Watch slowly.', position: 1, origin: 'native', sourceKey: null }] }
async function summary(): Promise<PublicMemberSummary> {
  const p = await identity.getOwnProfile(target.sessionToken)
  return { id: target.member.id, username: p.username, displayName: p.displayName, avatarStyle: p.avatarStyle, avatarUrl: null, isFollowing: following }
}
const social: PublicMembers = {
  async profile(username) {
    const p = await identity.getOwnProfile(target.sessionToken)
    if (!['cinephile', 'old_cinephile'].includes(username) || p.visibility !== 'public') return null
    return { viewerIsOwner: false, canonicalUsername: p.username, profile: { ...await summary(), bio: p.bio, bannerUrl: null }, favorites: [{ kind: 'movie', id: movieDetail.id, position: 1 }], ratingDistribution: distribution, statistics: { lists: 0, reviews: 1, ratings: 1 }, social: { followers: following ? 1 : 0, following: 0 } } satisfies PublicProfile
  },
  async search(q, cursor) {
    if (searchError) throw new ApiError('AUTH_STATE_UNAVAILABLE', 'Fixture search unavailable.')
    const p = await identity.getOwnProfile(target.sessionToken)
    return { items: p.visibility === 'public' && 'cinephile samira'.includes(q.toLowerCase()) ? [await summary()] : [], nextCursor: cursor ? null : null }
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
    return { canonicalUsername: profile.username, profile, favorites: [{ id: movieDetail.id, kind: 'movie', position: 1, origin: 'native', sourceKey: null }], diary: [], lists: [list.list], reviews: [], ratingDistribution: distribution, social: { followers: 0, following: following ? 1 : 0 }, statistics: { lists: 1, diaryEntries: 0, reviews: 0, watched: 0 } } satisfies MemberProfileData
  },
  async list(slug, viewer) {
    if (slug !== list.list.slug) return null
    if (viewer === owner.member.id) return list
    const p = await identity.getOwnProfile(owner.sessionToken)
    return list.list.visibility === 'public' && p.visibility === 'public' ? { ...list, viewerIsOwner: false } : null
  },
  async updateListContent(_member, _id, changes) { Object.assign(list.list, { name: changes.name, description: changes.description, visibility: changes.visibility }); return true },
  async librarySnapshot() { return { diary: { items: [], nextCursor: null }, lists: { items: [list.list], nextCursor: null }, saved: { items: [], nextCursor: null }, favorites: [] } },
}
const app = await buildApp({ env: loadEnv({ NODE_ENV: 'test', APP_ORIGIN: 'http://127.0.0.1:28113' }), identity, memberData, publicMembers: social, catalog: createFakeCatalog({ titles: [movieDetail] }) })
app.get('/__fixtures/session', async () => ({ token: owner.sessionToken }))
app.post('/__fixtures/reset', { config: { rateLimit: false } }, async request => {
  const body = request.body as { followError?: boolean; searchError?: boolean }
  following = false; followError = body?.followError ?? false; searchError = body?.searchError ?? false
  list.list.visibility = 'private'
  await identity.updateProfile(owner.sessionToken, { visibility: 'private' })
  return { ok: true }
})
app.post('/__fixtures/search-recover', async () => { searchError = false; return { ok: true } })
await app.listen({ host: '127.0.0.1', port: 18562 })
