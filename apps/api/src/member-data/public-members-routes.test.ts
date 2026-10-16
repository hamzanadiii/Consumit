import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PublicProfile } from '@consumit/contracts'
import { buildApp } from '../app.ts'
import { loadEnv } from '../config/env.ts'
import { createFakeIdentity } from '../identity/fake-identity.ts'
import { sessionCookieName } from '../identity/session.ts'
import { unavailableMemberData } from './unavailable-member-data.ts'
import type { PublicMembers } from './public-members.ts'

const origin = 'http://localhost:3000'
const fixture: PublicProfile = { viewerIsOwner: false, canonicalUsername: 'film_fan', profile: { id: 'public-id', username: 'film_fan', displayName: 'Film Fan', avatarStyle: 'dusk', avatarUrl: null, bannerUrl: null, bio: 'Public taste', isFollowing: false }, favorites: [], ratingDistribution: Array.from({ length: 10 }, (_, index) => ({ count: 0, value: index + 1 })), statistics: { lists: 0, ratings: 0, reviews: 0 }, social: { followers: 0, following: 0 } }
const apps: Array<Awaited<ReturnType<typeof buildApp>>> = []
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())) })
async function setup() {
  const identity = createFakeIdentity()
  await identity.register({ email: 'viewer@example.test', password: 'long-enough-password', username: 'viewer' })
  const delivery = identity.notifier.deliveries.findLast(item => item.kind === 'verification')
  if (!delivery || !('code' in delivery)) throw new Error('Missing verification')
  const session = await identity.verifyEmail({ code: delivery.code, email: 'viewer@example.test' })
  const env = loadEnv({ APP_ORIGIN: origin, NODE_ENV: 'test' })
  const publicMembers: PublicMembers = { profile: vi.fn(async username => username === 'film_fan' ? fixture : null), search: vi.fn(async () => ({ items: [fixture.profile], nextCursor: null })), collection: vi.fn(async () => ({ collection: 'ratings' as const, items: [], nextCursor: null })), follow: vi.fn(async () => {}) }
  const memberData = { ...unavailableMemberData, profile: vi.fn(async () => null) }
  const app = await buildApp({ env, identity, memberData, publicMembers })
  apps.push(app)
  return { app, memberData, publicMembers, cookies: { [sessionCookieName(env)]: session.sessionToken }, memberId: session.member.id }
}
describe('public member API boundaries', () => {
  it('serves guest-safe profiles and collections without credentials or private projections', async () => {
    const { app, memberData } = await setup()
    const profile = await app.inject('/v1/profiles/film_fan')
    expect(profile.statusCode).toBe(200)
    expect(profile.json()).toEqual(fixture)
    expect(profile.headers['cache-control']).toBe('private, no-store')
    expect(memberData.profile).not.toHaveBeenCalled()
    for (const username of ['private_member', 'deleted_member', 'missing_member']) {
      const response = await app.inject(`/v1/profiles/${username}`)
      expect(response.statusCode).toBe(404)
      expect(response.json().error.message).toBe('Profile not found.')
    }
    expect((await app.inject('/v1/profiles/film_fan/collections/ratings')).statusCode).toBe(200)
    expect((await app.inject('/v1/profiles/film_fan/archives/diary')).statusCode).toBe(401)
  })
  it('searches public members independently of unavailable catalogs with bounded inputs and no-store', async () => {
    const { app, publicMembers } = await setup()
    const response = await app.inject('/v1/members/search?q=film')
    expect(response.statusCode).toBe(200)
    expect(response.headers['cache-control']).toBe('private, no-store')
    expect(publicMembers.search).toHaveBeenCalledWith('film', undefined, 20, undefined)
    for (const query of ['q=fi', 'q=' + 'a'.repeat(101), 'q=film&limit=51', 'q=film&limit=0']) expect((await app.inject(`/v1/members/search?${query}`)).statusCode).toBe(400)
  })
  it('requires sign-in and mutation origin for follow writes and accepts repeated methods', async () => {
    const { app, publicMembers, cookies, memberId } = await setup()
    const url = '/v1/me/follows/public-id'
    expect((await app.inject({ method: 'PUT', url, headers: { origin } })).statusCode).toBe(401)
    expect((await app.inject({ method: 'PUT', url, cookies, headers: { origin: 'https://evil.test' } })).statusCode).toBe(403)
    expect(publicMembers.follow).not.toHaveBeenCalled()
    for (const method of ['PUT', 'PUT', 'DELETE', 'DELETE'] as const) expect((await app.inject({ method, url, cookies, headers: { origin } })).statusCode).toBe(204)
    expect(publicMembers.follow).toHaveBeenCalledWith(memberId, 'public-id', true)
    expect(publicMembers.follow).toHaveBeenCalledWith(memberId, 'public-id', false)
  })
})
