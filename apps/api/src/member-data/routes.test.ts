import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildApp } from '../app.ts'
import { loadEnv } from '../config/env.ts'
import { createFakeIdentity } from '../identity/fake-identity.ts'
import { sessionCookieName } from '../identity/session.ts'
import type { MemberData } from './member-data.ts'

const origin = 'http://localhost:3000'

function memberDataStub(): MemberData {
  const emptyLibrary = { diary: [], favorites: [], lists: [], saved: [], watched: [] }
  const storedProgress = { completed: false, durationSeconds: 3600, id: 693134, kind: 'movie' as const, positionSeconds: 1200, updatedAt: '2026-09-06T00:00:00.000Z' }
  return {
    library: vi.fn(async () => emptyLibrary),
    list: vi.fn(async () => null),
    profile: vi.fn(async () => null),
    progress: vi.fn(async () => storedProgress),
    setFavorites: vi.fn(async () => emptyLibrary),
    setProgress: vi.fn(async () => storedProgress),
    setSaved: vi.fn(async () => emptyLibrary),
    updateDiary: vi.fn(async () => true),
    updateList: vi.fn(async () => true),
    updateReview: vi.fn(async () => true),
  }
}

describe('member data mutation routes', () => {
  const apps: Array<Awaited<ReturnType<typeof buildApp>>> = []
  afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())))

  async function setup(memberData = memberDataStub()) {
    const identity = createFakeIdentity()
    await identity.register({ email: 'member@example.com', password: 'long-enough-password', username: 'cinema_fan' })
    const delivery = identity.notifier.deliveries.findLast((item) => item.kind === 'verification')
    if (!delivery || !('code' in delivery)) throw new Error('Expected verification delivery.')
    const session = await identity.verifyEmail({ code: delivery.code, email: 'member@example.com' })
    const env = loadEnv({ APP_ORIGIN: origin, NODE_ENV: 'test' })
    const app = await buildApp({ env, identity, memberData })
    apps.push(app)
    return { app, cookie: { [sessionCookieName(env)]: session.sessionToken }, memberData, memberId: session.member.id }
  }

  it('updates owned diary, review, and list records through validated same-origin requests', async () => {
    const { app, cookie, memberData, memberId } = await setup()
    const headers = { origin }

    expect((await app.inject({ cookies: cookie, headers, method: 'PATCH', payload: { rewatch: true }, url: '/v1/me/diary/diary-1' })).statusCode).toBe(204)
    expect((await app.inject({ cookies: cookie, headers, method: 'PATCH', payload: { body: 'Edited review' }, url: '/v1/me/reviews/review-1' })).statusCode).toBe(204)
    expect((await app.inject({ cookies: cookie, headers, method: 'PATCH', payload: { name: 'Edited list', visibility: 'public' }, url: '/v1/me/lists/list-1' })).statusCode).toBe(204)

    expect(memberData.updateDiary).toHaveBeenCalledWith(memberId, 'diary-1', { rewatch: true })
    expect(memberData.updateReview).toHaveBeenCalledWith(memberId, 'review-1', { body: 'Edited review' })
    expect(memberData.updateList).toHaveBeenCalledWith(memberId, 'list-1', { name: 'Edited list', visibility: 'public' })
  })

  it('rejects invalid, cross-site, unauthenticated, and missing-record edits', async () => {
    const memberData = memberDataStub()
    vi.mocked(memberData.updateReview).mockResolvedValue(false)
    const { app, cookie } = await setup(memberData)

    expect((await app.inject({ cookies: cookie, headers: { origin }, method: 'PATCH', payload: {}, url: '/v1/me/reviews/review-1' })).statusCode).toBe(400)
    expect((await app.inject({ cookies: cookie, headers: { origin: 'https://evil.example' }, method: 'PATCH', payload: { body: 'Edited' }, url: '/v1/me/reviews/review-1' })).statusCode).toBe(403)
    expect((await app.inject({ headers: { origin }, method: 'PATCH', payload: { body: 'Edited' }, url: '/v1/me/reviews/review-1' })).statusCode).toBe(401)
    expect((await app.inject({ cookies: cookie, headers: { origin }, method: 'PATCH', payload: { body: 'Edited' }, url: '/v1/me/reviews/review-1' })).statusCode).toBe(404)
  })

  it('writes and reads playback progress through validated same-origin requests', async () => {
    const { app, cookie, memberData, memberId } = await setup()
    const headers = { origin }

    const saved = await app.inject({ cookies: cookie, headers, method: 'PUT', payload: { durationSeconds: 3600, id: 693134, kind: 'movie', positionSeconds: 1200 }, url: '/v1/progress' })
    expect(saved.statusCode).toBe(200)
    expect(saved.json()).toMatchObject({ id: 693134, kind: 'movie', positionSeconds: 1200 })
    expect(memberData.setProgress).toHaveBeenCalledWith(memberId, { durationSeconds: 3600, id: 693134, kind: 'movie', positionSeconds: 1200 })

    const resumed = await app.inject({ cookies: cookie, headers, method: 'GET', url: '/v1/progress/movie/693134' })
    expect(resumed.statusCode).toBe(200)
    expect(memberData.progress).toHaveBeenCalledWith(memberId, { id: 693134, kind: 'movie' })

    const episode = await app.inject({ cookies: cookie, headers, method: 'GET', url: '/v1/progress/series/95396?season=1&episode=3' })
    expect(episode.statusCode).toBe(200)
    expect(memberData.progress).toHaveBeenCalledWith(memberId, { episode: 3, id: 95396, kind: 'series', season: 1 })
  })

  it('rejects invalid, cross-site, unauthenticated, and missing progress reads and writes', async () => {
    const memberData = memberDataStub()
    vi.mocked(memberData.progress).mockResolvedValue(null)
    const { app, cookie } = await setup(memberData)

    expect((await app.inject({ cookies: cookie, headers: { origin }, method: 'PUT', payload: { id: 693134, kind: 'movie', positionSeconds: -5 }, url: '/v1/progress' })).statusCode).toBe(400)
    expect((await app.inject({ cookies: cookie, headers: { origin: 'https://evil.example' }, method: 'PUT', payload: { id: 693134, kind: 'movie', positionSeconds: 10 }, url: '/v1/progress' })).statusCode).toBe(403)
    expect((await app.inject({ headers: { origin }, method: 'PUT', payload: { id: 693134, kind: 'movie', positionSeconds: 10 }, url: '/v1/progress' })).statusCode).toBe(401)
    expect((await app.inject({ cookies: cookie, headers: { origin }, method: 'GET', url: '/v1/progress/movie/693134' })).statusCode).toBe(404)
    expect((await app.inject({ cookies: cookie, headers: { origin }, method: 'GET', url: '/v1/progress/novel/693134' })).statusCode).toBe(400)
    expect((await app.inject({ cookies: cookie, headers: { origin }, method: 'GET', url: '/v1/progress/series/95396?season=abc' })).statusCode).toBe(400)
  })
})
