import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildApp } from '../app.ts'
import { createFakeIdentity } from '../identity/fake-identity.ts'
import { sessionCookieName } from '../identity/session.ts'
import { loadEnv } from '../config/env.ts'
import type { PrismaClient } from '../../generated/prisma/client.js'
import { createPostgresMemberData } from './postgres-member-data.ts'

describe('personal profiles with legacy stored visibility', () => {
  const apps: Awaited<ReturnType<typeof buildApp>>[] = []
  afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())))

  it.each(['public', 'private'])('serves an owner profile stored as %s through the response contract', async (visibility) => {
    const identity = createFakeIdentity()
    await identity.register({ email: 'profile@example.com', password: 'long-enough-password', username: 'profile_owner' })
    const delivery = identity.notifier.deliveries.findLast((item) => item.kind === 'verification')
    if (!delivery || !('code' in delivery)) throw new Error('Expected verification delivery.')
    const session = await identity.verifyEmail({ code: delivery.code, email: 'profile@example.com' })
    const record = await identity.repository.findById(session.member.id)
    if (!record) throw new Error('Expected member record.')
    const member = {
      ...record,
      profile: { ...record.profile, visibility },
      diaryEntries: [], favorites: [], lists: [], reviews: [],
      _count: { diaryEntries: 0, followers: 2, following: 3, lists: 0, reviews: 0, watchedTitles: 0 },
    }
    const prisma = {
      profile: { findUnique: vi.fn(async () => ({ memberId: record.id })) },
      member: { findFirst: vi.fn(async () => member) },
      rating: { groupBy: vi.fn(async () => []) },
      follow: { count: vi.fn(async () => 0) },
    } as unknown as PrismaClient
    // Exercise the real persistence mapper and HTTP response validation;
    // only database query results are fixtures.
    const memberData = createPostgresMemberData(prisma)
    const env = loadEnv({ APP_ORIGIN: 'http://localhost:3000', NODE_ENV: 'test' })
    const app = await buildApp({ env, identity, memberData })
    apps.push(app)
    const cookies = { [sessionCookieName(env)]: session.sessionToken }

    const response = await app.inject({ cookies, method: 'GET', url: '/v1/profiles/profile_owner' })
    expect(response.statusCode).toBe(200)
    expect(response.headers['cache-control']).toBe('private, no-store')
    expect(response.json()).toMatchObject({ canonicalUsername: 'profile_owner', viewerIsOwner: true, profile: { visibility }, social: { followers: 0, following: 0 } })
    const settings = await app.inject({ cookies, method: 'GET', url: '/v1/me/profile' })
    expect(settings.statusCode).toBe(200)
    expect(settings.json()).toMatchObject({ visibility: 'private' })

    expect(await memberData.profile('profile_owner', 'another-member')).toBeNull()
    vi.spyOn(identity, 'getSession').mockResolvedValueOnce({ ...session.member, id: 'another-member' })
    expect((await app.inject({ cookies, method: 'GET', url: '/v1/profiles/profile_owner' })).statusCode).toBe(404)
    expect((await app.inject({ method: 'GET', url: '/v1/profiles/profile_owner' })).statusCode).toBe(404)
    expect(member.profile.visibility).toBe(visibility)
  })
})
