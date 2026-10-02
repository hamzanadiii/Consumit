import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildApp } from '../app.ts'
import { loadEnv } from '../config/env.ts'
import { createFakeIdentity } from '../identity/fake-identity.ts'
import { sessionCookieName } from '../identity/session.ts'
import type { CreateDiaryEntryRequest } from '@consumit/contracts'
import type { MemberData } from './member-data.ts'

const origin = 'http://localhost:3000'

function memberDataStub(): MemberData {
  const emptyLibrary = { diary: { items: [], nextCursor: null }, favorites: [], lists: { items: [], nextCursor: null }, savedLists: { items: [], nextCursor: null }, saved: { items: [], nextCursor: null } }
  const storedProgress = { completed: false, durationSeconds: 3600, id: 693134, kind: 'movie' as const, positionSeconds: 1200, updatedAt: '2026-09-06T00:00:00.000Z' }
  const storedRating = { id: 693134, kind: 'movie' as const, origin: 'native' as const, sourceKey: null, value: 9 }
  const storedLike = { id: 693134, kind: 'movie' as const, origin: 'native' as const, sourceKey: null }
  const storedReview = { body: 'A patient masterpiece.', id: 693134, kind: 'movie' as const, origin: 'native' as const, reviewId: 'review-1', reviewedOn: '2026-09-06', sourceKey: null, tags: [] }
  const storedTitleReview = { author: { avatarStyle: 'dusk' as const, avatarUrl: null, displayName: 'Cinema Fan', username: 'cinema_fan' }, body: 'A patient masterpiece.', liked: true, likesCount: 12, rating: 9, reviewId: 'review-1', reviewedOn: '2026-09-06' }
  return {
    circleActivity: vi.fn(async () => ({ items: [], nextCursor: null })),
    createList: vi.fn(async () => { throw new Error('NOT_IMPLEMENTED') }),
    discoverLists: vi.fn(async () => []),
    createDiaryEntry: vi.fn(async (_memberId: string, input: CreateDiaryEntryRequest) => ({ ...(input.episode !== undefined ? { episode: input.episode } : {}), ...(input.season !== undefined ? { season: input.season } : {}), entryId: 'diary-1', id: input.id, kind: input.kind, origin: 'native' as const, rewatch: input.rewatch ?? false, sourceKey: null, tags: input.tags ?? [], watchedOn: input.watchedOn })),
    deleteDiary: vi.fn(async () => true),
    createReview: vi.fn(async () => storedReview),
    isFollowing: vi.fn(async () => false),
    libraryPage: vi.fn(async () => ({ collection: 'saved' as const, items: [], nextCursor: null })),
    librarySnapshot: vi.fn(async () => emptyLibrary),
    like: vi.fn(async () => storedLike),
    list: vi.fn(async () => null),
    profile: vi.fn(async () => null),
    profileArchive: vi.fn(async () => null),
    progress: vi.fn(async () => storedProgress),
    watchHistory: vi.fn(async () => ({ items: [{ completedAt: '2026-09-28T12:00:00.000Z', entryId: 'history-1', id: 95396, kind: 'series' as const, season: 1, episode: 3 }], nextCursor: null })),
    rating: vi.fn(async () => storedRating),
    ratingsByValue: vi.fn(async () => ({ items: [storedRating], nextCursor: null, totalCount: 1 })),
    ratingsForTitles: vi.fn(async () => [storedRating]),
    removeLike: vi.fn(async () => true),
    removeRating: vi.fn(async () => true),
    removeReviewLike: vi.fn(async () => true),
    review: vi.fn(async () => storedReview),
    setReviewLiked: vi.fn(async () => ({ likesCount: 13, reviewId: 'review-1' })),
    titleReviews: vi.fn(async (_ref: unknown, page: number) => ({ items: [storedTitleReview], page, totalPages: 3, totalResults: 21 })),
    setFavorites: vi.fn(async () => {}),
    setListSaved: vi.fn(async () => true),
    setFollow: vi.fn(async () => ({ followers: 4, following: true })),
    searchMembers: vi.fn(async () => []),
    setLiked: vi.fn(async () => storedLike),
    setProgress: vi.fn(async () => storedProgress),
    setRating: vi.fn(async () => storedRating),
    setSaved: vi.fn(async () => {}),
    setWatched: vi.fn(async () => {}),
    titleState: vi.fn(async () => ({ rating: storedRating, like: storedLike, review: storedReview, saved: false, watched: false })),
    updateDiary: vi.fn(async () => true),
    updateList: vi.fn(async () => true),
    updateListContent: vi.fn(async () => true),
    deleteList: vi.fn(async () => true),
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

  it('serves bounded library pages and rejects invalid or mismatched cursors', async () => {
    const { app, cookie, memberData, memberId } = await setup()
    const headers = { origin }
    const cursor = JSON.stringify({ collection: 'saved', createdAt: '2026-09-28T12:00:00.000Z', id: 'saved-cursor' })
    const page = await app.inject({ cookies: cookie, headers, method: 'GET', url: `/v1/me/library/collections/saved?limit=2&cursor=${encodeURIComponent(cursor)}` })

    expect(page.statusCode).toBe(200)
    expect(page.json()).toEqual({ collection: 'saved', items: [], nextCursor: null })
    expect(memberData.libraryPage).toHaveBeenCalledWith(memberId, 'saved', cursor, 2)
    expect((await app.inject({ cookies: cookie, headers, method: 'GET', url: '/v1/me/library/collections/saved?limit=51' })).statusCode).toBe(400)
    expect((await app.inject({ cookies: cookie, headers, method: 'GET', url: '/v1/me/library/collections/saved?cursor=not-json' })).statusCode).toBe(400)
    const wrongCollection = encodeURIComponent(JSON.stringify({ collection: 'diary', createdAt: '2026-09-28T12:00:00.000Z', id: 'diary-cursor' }))
    expect((await app.inject({ cookies: cookie, headers, method: 'GET', url: `/v1/me/library/collections/saved?cursor=${wrongCollection}` })).statusCode).toBe(400)
    expect((await app.inject({ headers, method: 'GET', url: '/v1/me/library/collections/saved' })).statusCode).toBe(401)
  })

  it('serves one member title state with 200 instead of three 404-able reads', async () => {
    const { app, cookie, memberData, memberId } = await setup()
    const headers = { origin }

    const full = await app.inject({ cookies: cookie, headers, method: 'GET', url: '/v1/me/titles/movie/693134' })
    expect(full.statusCode).toBe(200)
    expect(full.json()).toEqual({
      rating: { id: 693134, kind: 'movie', origin: 'native', sourceKey: null, value: 9 },
      like: { id: 693134, kind: 'movie', origin: 'native', sourceKey: null },
      review: { body: 'A patient masterpiece.', id: 693134, kind: 'movie', origin: 'native', reviewId: 'review-1', reviewedOn: '2026-09-06', sourceKey: null, tags: [] },
      saved: false,
      watched: false,
    })
    expect(memberData.titleState).toHaveBeenCalledTimes(1)

    vi.mocked(memberData.titleState).mockResolvedValueOnce({ rating: null, like: null, review: null, saved: false, watched: false })
    const empty = await app.inject({ cookies: cookie, headers, method: 'GET', url: '/v1/me/titles/movie/1' })
    expect(empty.statusCode).toBe(200)
    expect(empty.json()).toEqual({ rating: null, like: null, review: null, saved: false, watched: false })

    expect((await app.inject({ cookies: cookie, headers, method: 'GET', url: '/v1/me/titles/novel/1' })).statusCode).toBe(400)
    expect((await app.inject({ cookies: cookie, headers, method: 'GET', url: '/v1/me/titles/anime/1' })).statusCode).toBe(200)
    expect(memberData.titleState).toHaveBeenLastCalledWith(memberId, { id: 1, kind: 'anime' })
    expect((await app.inject({ headers, method: 'GET', url: '/v1/me/titles/movie/1' })).statusCode).toBe(401)
  })

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
    const missing = await app.inject({ cookies: cookie, headers: { origin }, method: 'GET', url: '/v1/progress/movie/693134' })
    expect(missing.statusCode).toBe(204)
    expect(missing.body).toBe('')
    expect((await app.inject({ cookies: cookie, headers: { origin }, method: 'GET', url: '/v1/progress/novel/693134' })).statusCode).toBe(400)
    expect((await app.inject({ cookies: cookie, headers: { origin }, method: 'GET', url: '/v1/progress/series/95396?season=abc' })).statusCode).toBe(400)
  })

  it('records an exact completion attempt and serves private paged history', async () => {
    const { app, cookie, memberData, memberId } = await setup()
    const completionId = '82ef6eaf-9248-4b77-820d-6d7bc025c823'
    const payload = { completed: true, completionId, episode: 3, id: 95396, kind: 'series', positionSeconds: 1800, season: 1 }
    const saved = await app.inject({ cookies: cookie, headers: { origin }, method: 'PUT', payload, url: '/v1/progress' })
    expect(saved.statusCode).toBe(200)
    expect(memberData.setProgress).toHaveBeenCalledWith(memberId, payload)
    const history = await app.inject({ cookies: cookie, method: 'GET', url: '/v1/me/watch-history?limit=10' })
    expect(history.statusCode).toBe(200)
    expect(history.headers['cache-control']).toBe('private, no-store')
    expect(history.json().items[0]).toMatchObject({ episode: 3, season: 1 })
    expect(memberData.watchHistory).toHaveBeenCalledWith(memberId, undefined, 10)
    expect((await app.inject({ method: 'GET', url: '/v1/me/watch-history' })).statusCode).toBe(401)
    expect((await app.inject({ cookies: cookie, method: 'GET', url: '/v1/me/watch-history?limit=100' })).statusCode).toBe(400)
    expect((await app.inject({ cookies: cookie, headers: { origin }, method: 'PUT', payload: { ...payload, episode: undefined }, url: '/v1/progress' })).statusCode).toBe(400)
  })

  it('writes, reads, and removes member ratings through validated same-origin requests', async () => {
    const { app, cookie, memberData, memberId } = await setup()
    const headers = { origin }

    const saved = await app.inject({ cookies: cookie, headers, method: 'PUT', payload: { id: 693134, kind: 'movie', value: 9 }, url: '/v1/ratings' })
    expect(saved.statusCode).toBe(200)
    expect(saved.json()).toMatchObject({ id: 693134, kind: 'movie', value: 9 })
    expect(memberData.setRating).toHaveBeenCalledWith(memberId, { id: 693134, kind: 'movie' }, 9)

    const resumed = await app.inject({ cookies: cookie, headers, method: 'GET', url: '/v1/ratings/movie/693134' })
    expect(resumed.statusCode).toBe(200)
    expect(memberData.rating).toHaveBeenCalledWith(memberId, { id: 693134, kind: 'movie' })

    expect((await app.inject({ cookies: cookie, headers, method: 'DELETE', url: '/v1/ratings/movie/693134' })).statusCode).toBe(204)
    expect(memberData.removeRating).toHaveBeenCalledWith(memberId, { id: 693134, kind: 'movie' })
  })

  it('rejects invalid, cross-site, unauthenticated, and missing ratings', async () => {
    const memberData = memberDataStub()
    vi.mocked(memberData.rating).mockResolvedValue(null)
    vi.mocked(memberData.removeRating).mockResolvedValue(false)
    const { app, cookie } = await setup(memberData)

    expect((await app.inject({ cookies: cookie, headers: { origin }, method: 'PUT', payload: { id: 693134, kind: 'movie', value: 11 }, url: '/v1/ratings' })).statusCode).toBe(400)
    expect((await app.inject({ cookies: cookie, headers: { origin: 'https://evil.example' }, method: 'PUT', payload: { id: 693134, kind: 'movie', value: 8 }, url: '/v1/ratings' })).statusCode).toBe(403)
    expect((await app.inject({ headers: { origin }, method: 'PUT', payload: { id: 693134, kind: 'movie', value: 8 }, url: '/v1/ratings' })).statusCode).toBe(401)
    expect((await app.inject({ cookies: cookie, headers: { origin }, method: 'GET', url: '/v1/ratings/movie/693134' })).statusCode).toBe(404)
    expect((await app.inject({ cookies: cookie, headers: { origin }, method: 'DELETE', url: '/v1/ratings/movie/693134' })).statusCode).toBe(404)
    expect((await app.inject({ cookies: cookie, headers: { origin }, method: 'GET', url: '/v1/ratings/novel/693134' })).statusCode).toBe(400)
  })

  it('toggles watched state through validated same-origin library requests', async () => {
    const { app, cookie, memberData, memberId } = await setup()
    const headers = { origin }

    const marked = await app.inject({ cookies: cookie, headers, method: 'PUT', url: '/v1/me/library/watched/movie/693134' })
    expect(marked.statusCode).toBe(204)
    expect(memberData.setWatched).toHaveBeenCalledWith(memberId, { id: 693134, kind: 'movie' }, true)

    const cleared = await app.inject({ cookies: cookie, headers, method: 'DELETE', url: '/v1/me/library/watched/movie/693134' })
    expect(cleared.statusCode).toBe(204)
    expect(memberData.setWatched).toHaveBeenCalledWith(memberId, { id: 693134, kind: 'movie' }, false)

    expect((await app.inject({ cookies: cookie, headers: { origin }, method: 'PUT', url: '/v1/me/library/watched/novel/693134' })).statusCode).toBe(400)
    expect((await app.inject({ cookies: cookie, headers: { origin: 'https://evil.example' }, method: 'PUT', url: '/v1/me/library/watched/movie/693134' })).statusCode).toBe(403)
    expect((await app.inject({ headers: { origin }, method: 'PUT', url: '/v1/me/library/watched/movie/693134' })).statusCode).toBe(401)
  })

  it('writes, reads, and removes member likes through validated same-origin requests', async () => {
    const { app, cookie, memberData, memberId } = await setup()
    const headers = { origin }

    const liked = await app.inject({ cookies: cookie, headers, method: 'PUT', payload: { id: 693134, kind: 'movie' }, url: '/v1/likes' })
    expect(liked.statusCode).toBe(200)
    expect(liked.json()).toMatchObject({ id: 693134, kind: 'movie' })
    expect(memberData.setLiked).toHaveBeenCalledWith(memberId, { id: 693134, kind: 'movie' }, true)

    const read = await app.inject({ cookies: cookie, headers, method: 'GET', url: '/v1/likes/movie/693134' })
    expect(read.statusCode).toBe(200)
    expect(memberData.like).toHaveBeenCalledWith(memberId, { id: 693134, kind: 'movie' })

    expect((await app.inject({ cookies: cookie, headers, method: 'DELETE', url: '/v1/likes/movie/693134' })).statusCode).toBe(204)
    expect(memberData.removeLike).toHaveBeenCalledWith(memberId, { id: 693134, kind: 'movie' })
  })

  it('rejects invalid, cross-site, unauthenticated, and missing likes', async () => {
    const memberData = memberDataStub()
    vi.mocked(memberData.like).mockResolvedValue(null)
    vi.mocked(memberData.removeLike).mockResolvedValue(false)
    const { app, cookie } = await setup(memberData)

    expect((await app.inject({ cookies: cookie, headers: { origin }, method: 'PUT', payload: { id: -4, kind: 'movie' }, url: '/v1/likes' })).statusCode).toBe(400)
    expect((await app.inject({ cookies: cookie, headers: { origin: 'https://evil.example' }, method: 'PUT', payload: { id: 693134, kind: 'movie' }, url: '/v1/likes' })).statusCode).toBe(403)
    expect((await app.inject({ headers: { origin }, method: 'PUT', payload: { id: 693134, kind: 'movie' }, url: '/v1/likes' })).statusCode).toBe(401)
    expect((await app.inject({ cookies: cookie, headers: { origin }, method: 'GET', url: '/v1/likes/movie/693134' })).statusCode).toBe(404)
    expect((await app.inject({ cookies: cookie, headers: { origin }, method: 'DELETE', url: '/v1/likes/movie/693134' })).statusCode).toBe(404)
  })

  it('creates native diary entries through validated same-origin requests', async () => {
    const { app, cookie, memberData, memberId } = await setup()
    const headers = { origin }

    const created = await app.inject({ cookies: cookie, headers, method: 'POST', payload: { id: 693134, idempotencyKey: 'f167ea18-4ea8-4d83-9ce7-e6bac7d3fef2', kind: 'movie', rewatch: true, tags: ['cinema'], watchedOn: '2026-09-09' }, url: '/v1/me/diary' })
    expect(created.statusCode).toBe(201)
    expect(created.json()).toMatchObject({ entryId: 'diary-1', id: 693134, watchedOn: '2026-09-09' })
    expect(memberData.createDiaryEntry).toHaveBeenCalledWith(memberId, { id: 693134, idempotencyKey: 'f167ea18-4ea8-4d83-9ce7-e6bac7d3fef2', kind: 'movie', rewatch: true, tags: ['cinema'], watchedOn: '2026-09-09' })

    const episode = await app.inject({ cookies: cookie, headers, method: 'POST', payload: { episode: 3, id: 95396, idempotencyKey: '693fd9d7-b207-4b99-9167-98d498e5e002', kind: 'series', season: 1, watchedOn: '2026-09-09' }, url: '/v1/me/diary' })
    expect(episode.statusCode).toBe(201)
    expect(episode.json()).toMatchObject({ episode: 3, id: 95396, kind: 'series', season: 1 })
    expect(memberData.createDiaryEntry).toHaveBeenLastCalledWith(memberId, { episode: 3, id: 95396, idempotencyKey: '693fd9d7-b207-4b99-9167-98d498e5e002', kind: 'series', season: 1, watchedOn: '2026-09-09' })

    expect((await app.inject({ cookies: cookie, headers: { origin }, method: 'POST', payload: { id: 693134, kind: 'movie', watchedOn: 'not-a-date' }, url: '/v1/me/diary' })).statusCode).toBe(400)
    expect((await app.inject({ cookies: cookie, headers, method: 'POST', payload: { episode: 3, id: 95396, idempotencyKey: '82ef6eaf-9248-4b77-820d-6d7bc025c823', kind: 'series', watchedOn: '2026-09-09' }, url: '/v1/me/diary' })).statusCode).toBe(400)
    expect((await app.inject({ cookies: cookie, headers: { origin: 'https://evil.example' }, method: 'POST', payload: { id: 693134, kind: 'movie', watchedOn: '2026-09-09' }, url: '/v1/me/diary' })).statusCode).toBe(403)
    expect((await app.inject({ headers: { origin }, method: 'POST', payload: { id: 693134, idempotencyKey: 'f167ea18-4ea8-4d83-9ce7-e6bac7d3fef2', kind: 'movie', watchedOn: '2026-09-09' }, url: '/v1/me/diary' })).statusCode).toBe(401)
  })

  it('creates native reviews through validated same-origin requests', async () => {
    const { app, cookie, memberData, memberId } = await setup()
    const headers = { origin }

    const created = await app.inject({ cookies: cookie, headers, method: 'POST', payload: { body: 'A patient masterpiece.', id: 693134, kind: 'movie' }, url: '/v1/me/reviews' })
    expect(created.statusCode).toBe(201)
    expect(created.json()).toMatchObject({ body: 'A patient masterpiece.', id: 693134, reviewId: 'review-1' })
    expect(memberData.createReview).toHaveBeenCalledWith(memberId, { body: 'A patient masterpiece.', id: 693134, kind: 'movie' })

    expect((await app.inject({ cookies: cookie, headers: { origin }, method: 'POST', payload: { body: '  ', id: 693134, kind: 'movie' }, url: '/v1/me/reviews' })).statusCode).toBe(400)
    expect((await app.inject({ cookies: cookie, headers: { origin: 'https://evil.example' }, method: 'POST', payload: { body: 'Great.', id: 693134, kind: 'movie' }, url: '/v1/me/reviews' })).statusCode).toBe(403)
    expect((await app.inject({ headers: { origin }, method: 'POST', payload: { body: 'Great.', id: 693134, kind: 'movie' }, url: '/v1/me/reviews' })).statusCode).toBe(401)
  })

  it('reads owned reviews through validated same-origin requests', async () => {
    const { app, cookie, memberData, memberId } = await setup()
    const headers = { origin }

    const read = await app.inject({ cookies: cookie, headers, method: 'GET', url: '/v1/me/reviews/movie/693134' })
    expect(read.statusCode).toBe(200)
    expect(read.json()).toMatchObject({ body: 'A patient masterpiece.', id: 693134, reviewId: 'review-1' })
    expect(memberData.review).toHaveBeenCalledWith(memberId, { id: 693134, kind: 'movie' })
  })

  it('rejects invalid, unauthenticated, and missing review reads', async () => {
    const memberData = memberDataStub()
    vi.mocked(memberData.review).mockResolvedValue(null)
    const { app, cookie } = await setup(memberData)

    expect((await app.inject({ cookies: cookie, headers: { origin }, method: 'GET', url: '/v1/me/reviews/movie/693134' })).statusCode).toBe(404)
    expect((await app.inject({ headers: { origin }, method: 'GET', url: '/v1/me/reviews/movie/693134' })).statusCode).toBe(401)
    expect((await app.inject({ cookies: cookie, headers: { origin }, method: 'GET', url: '/v1/me/reviews/novel/693134' })).statusCode).toBe(400)
  })

  it('lists public title reviews without authentication', async () => {
    const { app, cookie, memberData, memberId } = await setup()
    const headers = { origin }

    const first = await app.inject({ headers, method: 'GET', url: '/v1/reviews/movie/693134' })
    expect(first.statusCode).toBe(200)
    expect(first.json()).toMatchObject({ page: 1, totalPages: 3, totalResults: 21, items: [{ body: 'A patient masterpiece.', liked: true, likesCount: 12, rating: 9, reviewId: 'review-1' }] })
    expect(memberData.titleReviews).toHaveBeenCalledWith({ id: 693134, kind: 'movie' }, 1, 'recent', undefined, 'all')

    const popular = await app.inject({ cookies: cookie, headers, method: 'GET', url: '/v1/reviews/movie/693134?sort=popular' })
    expect(popular.statusCode).toBe(200)
    expect(memberData.titleReviews).toHaveBeenCalledWith({ id: 693134, kind: 'movie' }, 1, 'popular', memberId, 'all')

    const circle = await app.inject({ cookies: cookie, headers, method: 'GET', url: '/v1/reviews/movie/693134?audience=circle' })
    expect(circle.statusCode).toBe(200)
    expect(memberData.titleReviews).toHaveBeenCalledWith({ id: 693134, kind: 'movie' }, 1, 'recent', memberId, 'circle')

    const second = await app.inject({ headers, method: 'GET', url: '/v1/reviews/movie/693134?page=2' })
    expect(second.statusCode).toBe(200)
    expect(memberData.titleReviews).toHaveBeenCalledWith({ id: 693134, kind: 'movie' }, 2, 'recent', undefined, 'all')
  })

  it('rejects invalid title review list queries', async () => {
    const { app } = await setup()
    const headers = { origin }

    expect((await app.inject({ headers, method: 'GET', url: '/v1/reviews/novel/693134' })).statusCode).toBe(400)
    expect((await app.inject({ headers, method: 'GET', url: '/v1/reviews/movie/693134?page=0' })).statusCode).toBe(400)
    expect((await app.inject({ headers, method: 'GET', url: '/v1/reviews/movie/693134?page=501' })).statusCode).toBe(400)
    expect((await app.inject({ headers, method: 'GET', url: '/v1/reviews/movie/693134?sort=top' })).statusCode).toBe(400)
    expect((await app.inject({ headers, method: 'GET', url: '/v1/reviews/movie/693134?audience=everyone' })).statusCode).toBe(400)
  })

  it('writes and removes review likes through validated same-origin requests', async () => {
    const { app, cookie, memberData, memberId } = await setup()
    const headers = { origin }

    const liked = await app.inject({ cookies: cookie, headers, method: 'PUT', payload: { reviewId: 'review-1' }, url: '/v1/review-likes' })
    expect(liked.statusCode).toBe(200)
    expect(liked.json()).toMatchObject({ likesCount: 13, reviewId: 'review-1' })
    expect(memberData.setReviewLiked).toHaveBeenCalledWith(memberId, 'review-1', true)

    expect((await app.inject({ cookies: cookie, headers, method: 'DELETE', url: '/v1/review-likes/review-1' })).statusCode).toBe(204)
    expect(memberData.removeReviewLike).toHaveBeenCalledWith(memberId, 'review-1')
  })

  it('rejects invalid, cross-site, unauthenticated, and missing review likes', async () => {
    const memberData = memberDataStub()
    vi.mocked(memberData.setReviewLiked).mockResolvedValue(null)
    vi.mocked(memberData.removeReviewLike).mockResolvedValue(false)
    const { app, cookie } = await setup(memberData)

    expect((await app.inject({ cookies: cookie, headers: { origin }, method: 'PUT', payload: { reviewId: '' }, url: '/v1/review-likes' })).statusCode).toBe(400)
    expect((await app.inject({ cookies: cookie, headers: { origin: 'https://evil.example' }, method: 'PUT', payload: { reviewId: 'review-1' }, url: '/v1/review-likes' })).statusCode).toBe(403)
    expect((await app.inject({ headers: { origin }, method: 'PUT', payload: { reviewId: 'review-1' }, url: '/v1/review-likes' })).statusCode).toBe(401)
    expect((await app.inject({ cookies: cookie, headers: { origin }, method: 'PUT', payload: { reviewId: 'review-1' }, url: '/v1/review-likes' })).statusCode).toBe(404)
    expect((await app.inject({ cookies: cookie, headers: { origin }, method: 'DELETE', url: '/v1/review-likes/review-1' })).statusCode).toBe(404)
  })

  it('follows and unfollows members through validated same-origin requests', async () => {
    const { app, cookie, memberData, memberId } = await setup()
    const headers = { origin }

    const followed = await app.inject({ cookies: cookie, headers, method: 'PUT', url: '/v1/follows/cinema_fan' })
    expect(followed.statusCode).toBe(200)
    expect(followed.json()).toEqual({ followers: 4, following: true })
    expect(memberData.setFollow).toHaveBeenCalledWith(memberId, 'cinema_fan', true)

    vi.mocked(memberData.setFollow).mockResolvedValue({ followers: 3, following: false })
    const unfollowed = await app.inject({ cookies: cookie, headers, method: 'DELETE', url: '/v1/follows/cinema_fan' })
    expect(unfollowed.statusCode).toBe(200)
    expect(unfollowed.json()).toEqual({ followers: 3, following: false })
    expect(memberData.setFollow).toHaveBeenCalledWith(memberId, 'cinema_fan', false)

    const state = await app.inject({ cookies: cookie, headers, method: 'GET', url: '/v1/follows/cinema_fan' })
    expect(state.statusCode).toBe(200)
    expect(state.json()).toEqual({ following: false })
    expect(memberData.isFollowing).toHaveBeenCalledWith(memberId, 'cinema_fan')
  })

  it('rejects invalid, cross-site, unauthenticated, and missing follows', async () => {
    const memberData = memberDataStub()
    vi.mocked(memberData.setFollow).mockResolvedValue(null)
    const { app, cookie } = await setup(memberData)

    expect((await app.inject({ cookies: cookie, headers: { origin }, method: 'PUT', url: '/v1/follows/admin' })).statusCode).toBe(400)
    expect((await app.inject({ cookies: cookie, headers: { origin: 'https://evil.example' }, method: 'PUT', url: '/v1/follows/cinema_fan' })).statusCode).toBe(403)
    expect((await app.inject({ headers: { origin }, method: 'PUT', url: '/v1/follows/cinema_fan' })).statusCode).toBe(401)
    expect((await app.inject({ headers: { origin }, method: 'GET', url: '/v1/follows/cinema_fan' })).statusCode).toBe(401)
    expect((await app.inject({ cookies: cookie, headers: { origin }, method: 'PUT', url: '/v1/follows/missing_member' })).statusCode).toBe(404)
    expect((await app.inject({ cookies: cookie, headers: { origin }, method: 'DELETE', url: '/v1/follows/missing_member' })).statusCode).toBe(404)
  })
})
