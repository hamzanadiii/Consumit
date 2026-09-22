import pg from 'pg'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { createDbClient } from '../db/client.ts'
import { createPostgresMemberData } from './postgres-member-data.ts'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required for integration tests.')
const control = new pg.Pool({ connectionString: databaseUrl })
const db = createDbClient(databaseUrl)
const memberData = createPostgresMemberData(db.prisma)

beforeEach(async () => control.query('TRUNCATE "Member" CASCADE'))

describe('real member data read model', () => {
  it('resolves username aliases and returns only stored profile activity', async () => {
    const member = await db.prisma.member.create({ data: {
      email: 'profile@example.com', emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
      profile: { create: { bio: 'Real bio', displayName: 'Real Member', location: 'Rabat', username: 'current_name', visibility: 'public' } },
      usernameAliases: { create: { username: 'old_name' } },
      watchedTitles: { create: { tmdbId: 666277 } },
      diaryEntries: { create: { sourceKey: null, tmdbId: 666277, watchedOn: new Date('2026-09-01T00:00:00Z') } },
      reviews: { create: { body: 'A stored review.', tmdbId: 666277 } },
    } })
    const profile = await memberData.profile('old_name')
    expect(profile).toMatchObject({ canonicalUsername: 'current_name', profile: { bio: 'Real bio', location: 'Rabat' }, social: { followers: 0, following: 0 }, statistics: { diaryEntries: 1, reviews: 1, watched: 1 } })
    expect(profile?.reviews[0]?.body).toBe('A stored review.')
    expect((await memberData.library(member.id)).diary).toHaveLength(1)
  })

  it('keeps private lists owner-only and persists six ordered native Favorites', async () => {
    const member = await db.prisma.member.create({ data: { email: 'owner@example.com', emailVerifiedAt: new Date(), profile: { create: { username: 'list_owner', visibility: 'public' } } } })
    const list = await db.prisma.memberList.create({ data: { memberId: member.id, name: 'Private list', slug: 'private-list' } })
    await db.prisma.memberList.create({ data: { memberId: member.id, name: 'Public list', slug: 'public-list', visibility: 'public' } })
    expect(await memberData.list(list.slug)).toBeNull()
    expect(await memberData.list(list.slug, member.id)).toMatchObject({ list: { name: 'Private list', visibility: 'private' } })
    expect(await memberData.profile('list_owner')).toMatchObject({ lists: [{ name: 'Public list' }], statistics: { lists: 1 } })
    expect(await memberData.profile('list_owner', member.id)).toMatchObject({ statistics: { lists: 2 } })
    const library = await memberData.setFavorites(member.id, [1, 2, 3, 4, 5, 6].map((id) => ({ id, kind: 'movie' as const })))
    expect(library.favorites.map((favorite) => favorite.position)).toEqual([1, 2, 3, 4, 5, 6])
    expect(library.favorites.every((favorite) => favorite.origin === 'native')).toBe(true)
    expect((await memberData.setSaved(member.id, { id: 95396, kind: 'series' }, true)).saved).toMatchObject([{ id: 95396, kind: 'series', origin: 'native' }])
    expect((await memberData.setSaved(member.id, { id: 95396, kind: 'series' }, false)).saved).toEqual([])
  })

    it('detaches edited Letterboxd records so import cleanup preserves them', async () => {    const member = await db.prisma.member.create({ data: { email: 'editor@example.com', emailVerifiedAt: new Date(), profile: { create: { username: 'record_editor' } } } })
    const diary = await db.prisma.diaryEntry.create({ data: { importBatchId: 'import-1', memberId: member.id, origin: 'LETTERBOXD', sourceKey: 'diary-1', tmdbId: 843, watchedOn: new Date('2024-02-03T00:00:00.000Z') } })
    const review = await db.prisma.review.create({ data: { body: 'Imported body', importBatchId: 'import-1', memberId: member.id, origin: 'LETTERBOXD', sourceKey: 'review-1', tmdbId: 843 } })
    const list = await db.prisma.memberList.create({ data: { importBatchId: 'import-1', memberId: member.id, name: 'Imported list', origin: 'LETTERBOXD', slug: 'imported-list', sourceKey: 'list-1', items: { create: { origin: 'LETTERBOXD', position: 1, sourceKey: 'item-1', tmdbId: 843 } } } })

    expect(await memberData.updateDiary(member.id, diary.id, { rewatch: true, tags: ['favorite'] })).toBe(true)
    expect(await memberData.updateReview(member.id, review.id, { body: 'My edited review.' })).toBe(true)
    expect(await memberData.updateList(member.id, list.id, { name: 'My edited list', visibility: 'public' })).toBe(true)

    expect(await db.prisma.diaryEntry.findUnique({ where: { id: diary.id } })).toMatchObject({ importBatchId: null, origin: 'NATIVE', rewatch: true, sourceKey: null, tags: ['favorite'] })
    expect(await db.prisma.review.findUnique({ where: { id: review.id } })).toMatchObject({ body: 'My edited review.', importBatchId: null, origin: 'NATIVE', sourceKey: null })
    expect(await db.prisma.memberList.findUnique({ include: { items: true }, where: { id: list.id } })).toMatchObject({ importBatchId: null, name: 'My edited list', origin: 'NATIVE', sourceKey: null, visibility: 'public', items: [{ origin: 'NATIVE', sourceKey: null }] })
    expect(await memberData.updateReview('another-member', review.id, { body: 'No access' })).toBe(false)
  })

  it('stores resume positions idempotently per member and title', async () => {
    const member = await db.prisma.member.create({ data: { email: 'watcher@example.com', emailVerifiedAt: new Date(), profile: { create: { username: 'watcher' } } } })
    const other = await db.prisma.member.create({ data: { email: 'stranger@example.com', emailVerifiedAt: new Date(), profile: { create: { username: 'stranger' } } } })

    expect(await memberData.progress(member.id, { id: 693134, kind: 'movie' })).toBeNull()

    const first = await memberData.setProgress(member.id, { durationSeconds: 7200, id: 693134, kind: 'movie', positionSeconds: 1200 })
    expect(first).toMatchObject({ completed: false, durationSeconds: 7200, id: 693134, kind: 'movie', positionSeconds: 1200 })
    expect(await memberData.progress(member.id, { id: 693134, kind: 'movie' })).toMatchObject({ positionSeconds: 1200 })

    const rewritten = await memberData.setProgress(member.id, { durationSeconds: 7200, id: 693134, kind: 'movie', positionSeconds: 1800 })
    expect(rewritten.positionSeconds).toBe(1800)

    const tinyRegression = await memberData.setProgress(member.id, { id: 693134, kind: 'movie', positionSeconds: 1798 })
    expect(tinyRegression.positionSeconds).toBe(1800)

    const realRewind = await memberData.setProgress(member.id, { id: 693134, kind: 'movie', positionSeconds: 900 })
    expect(realRewind.positionSeconds).toBe(900)

    const finished = await memberData.setProgress(member.id, { completed: true, id: 693134, kind: 'movie', positionSeconds: 7199 })
    expect(finished).toMatchObject({ completed: true, positionSeconds: 7199 })

    const episode = await memberData.setProgress(member.id, { episode: 3, id: 95396, kind: 'series', positionSeconds: 100, season: 1 })
    expect(episode).toMatchObject({ episode: 3, id: 95396, kind: 'series', season: 1 })
    expect(await memberData.progress(member.id, { episode: 2, id: 95396, kind: 'series', season: 1 })).toBeNull()

    expect(await memberData.progress(other.id, { id: 693134, kind: 'movie' })).toBeNull()
  })

  it('stores member ratings idempotently and detaches them from imports', async () => {
    const member = await db.prisma.member.create({ data: { email: 'rater@example.com', emailVerifiedAt: new Date(), profile: { create: { username: 'rater' } } } })
    const other = await db.prisma.member.create({ data: { email: 'outsider@example.com', emailVerifiedAt: new Date(), profile: { create: { username: 'outsider' } } } })
    await db.prisma.rating.create({ data: { importBatchId: 'import-1', memberId: member.id, origin: 'LETTERBOXD', sourceKey: 'rating-1', tmdbId: 843, value: 7 } })

    expect(await memberData.rating(member.id, { id: 693134, kind: 'movie' })).toBeNull()

    const first = await memberData.setRating(member.id, { id: 693134, kind: 'movie' }, 9)
    expect(first).toMatchObject({ id: 693134, kind: 'movie', origin: 'native', value: 9 })
    expect(await memberData.rating(member.id, { id: 693134, kind: 'movie' })).toMatchObject({ value: 9 })

    const rewritten = await memberData.setRating(member.id, { id: 693134, kind: 'movie' }, 6)
    expect(rewritten.value).toBe(6)
    expect(await db.prisma.rating.count({ where: { memberId: member.id, tmdbId: 693134 } })).toBe(1)

    const detached = await memberData.setRating(member.id, { id: 843, kind: 'movie' }, 10)
    expect(detached).toMatchObject({ origin: 'native', value: 10 })
    expect(await db.prisma.rating.findFirst({ where: { memberId: member.id, tmdbId: 843 } })).toMatchObject({ importBatchId: null, origin: 'NATIVE', sourceKey: null })

    expect(await memberData.removeRating(member.id, { id: 693134, kind: 'movie' })).toBe(true)
    expect(await memberData.rating(member.id, { id: 693134, kind: 'movie' })).toBeNull()
    expect(await memberData.removeRating(member.id, { id: 693134, kind: 'movie' })).toBe(false)
    expect(await memberData.rating(other.id, { id: 843, kind: 'movie' })).toBeNull()
  })

  it('toggles watched and liked titles and stores native reviews', async () => {
    const member = await db.prisma.member.create({ data: { email: 'shelf@example.com', emailVerifiedAt: new Date(), profile: { create: { username: 'shelf_owner' } } } })

    expect((await memberData.setWatched(member.id, { id: 693134, kind: 'movie' }, true)).watched).toMatchObject([{ id: 693134, kind: 'movie', origin: 'native' }])
    expect((await memberData.setWatched(member.id, { id: 693134, kind: 'movie' }, false)).watched).toEqual([])

    expect(await memberData.like(member.id, { id: 693134, kind: 'movie' })).toBeNull()
    expect(await memberData.setLiked(member.id, { id: 693134, kind: 'movie' }, true)).toMatchObject({ id: 693134, kind: 'movie', origin: 'native' })
    expect(await memberData.like(member.id, { id: 693134, kind: 'movie' })).toMatchObject({ id: 693134 })
    expect(await memberData.setLiked(member.id, { id: 693134, kind: 'movie' }, false)).toBeNull()
    expect(await memberData.removeLike(member.id, { id: 693134, kind: 'movie' })).toBe(false)

    const review = await memberData.createReview(member.id, { body: 'A patient masterpiece.', id: 693134, kind: 'movie', reviewedOn: '2026-09-09' })
    expect(review).toMatchObject({ body: 'A patient masterpiece.', id: 693134, origin: 'native', reviewedOn: '2026-09-09' })
    expect(review.reviewId).toEqual(expect.any(String))
    expect((await memberData.profile('shelf_owner', member.id))?.reviews.map((item) => item.body)).toContain('A patient masterpiece.')
    expect(await memberData.review(member.id, { id: 693134, kind: 'movie' })).toMatchObject({ body: 'A patient masterpiece.', id: 693134, reviewId: review.reviewId })
    expect(await memberData.review(member.id, { id: 1, kind: 'movie' })).toBeNull()
  })

  it('lists recent public title reviews with author ratings attached', async () => {
    const open = await db.prisma.member.create({ data: { email: 'open@example.com', emailVerifiedAt: new Date(), profile: { create: { displayName: 'Open Critic', username: 'open_critic', visibility: 'public' } } } })
    const quiet = await db.prisma.member.create({ data: { email: 'quiet@example.com', emailVerifiedAt: new Date(), profile: { create: { username: 'quiet_member', visibility: 'private' } } } })
    await db.prisma.review.create({ data: { body: 'First public take.', memberId: open.id, tmdbId: 550 } })
    await db.prisma.review.create({ data: { body: 'Private take.', memberId: quiet.id, tmdbId: 550 } })
    await db.prisma.rating.create({ data: { memberId: open.id, tmdbId: 550, value: 8 } })

    const page = await memberData.titleReviews({ id: 550, kind: 'movie' }, 1, 'recent')
    expect(page).toMatchObject({ page: 1, totalPages: 1, totalResults: 1 })
    expect(page.items).toHaveLength(1)
    expect(page.items[0]).toMatchObject({
      author: { displayName: 'Open Critic', username: 'open_critic' },
      body: 'First public take.',
      liked: false,
      likesCount: 0,
      rating: 8,
    })

    const empty = await memberData.titleReviews({ id: 550, kind: 'movie' }, 2, 'recent')
    expect(empty).toMatchObject({ items: [], page: 2, totalPages: 1, totalResults: 1 })
    expect(await memberData.titleReviews({ id: 551, kind: 'movie' }, 1, 'recent')).toMatchObject({ items: [], totalPages: 0, totalResults: 0 })
  })

  it('likes reviews once per member and ranks popular reviews first', async () => {
    const critic = await db.prisma.member.create({ data: { email: 'critic@example.com', emailVerifiedAt: new Date(), profile: { create: { username: 'liked_critic', visibility: 'public' } } } })
    const fan = await db.prisma.member.create({ data: { email: 'fan@example.com', emailVerifiedAt: new Date(), profile: { create: { username: 'liking_fan', visibility: 'public' } } } })
    const older = await db.prisma.review.create({ data: { body: 'Older take.', createdAt: new Date('2026-09-01T00:00:00Z'), memberId: critic.id, tmdbId: 551 } })
    await db.prisma.review.create({ data: { body: 'Newer take.', createdAt: new Date('2026-09-02T00:00:00Z'), memberId: fan.id, tmdbId: 551 } })

    expect(await memberData.setReviewLiked(fan.id, older.id, true)).toMatchObject({ likesCount: 1, reviewId: older.id })
    expect(await memberData.setReviewLiked(fan.id, older.id, true)).toMatchObject({ likesCount: 1, reviewId: older.id })
    expect(await memberData.setReviewLiked(critic.id, older.id, true)).toBeNull()
    expect(await memberData.setReviewLiked(fan.id, 'missing-review', true)).toBeNull()

    const popular = await memberData.titleReviews({ id: 551, kind: 'movie' }, 1, 'popular', fan.id)
    expect(popular.items.map((item) => item.body)).toEqual(['Older take.', 'Newer take.'])
    expect(popular.items[0]).toMatchObject({ liked: true, likesCount: 1 })
    expect(popular.items[1]).toMatchObject({ liked: false, likesCount: 0 })

    const recent = await memberData.titleReviews({ id: 551, kind: 'movie' }, 1, 'recent')
    expect(recent.items.map((item) => item.body)).toEqual(['Newer take.', 'Older take.'])
    expect(recent.items[0]).toMatchObject({ liked: false })

    expect(await memberData.removeReviewLike(fan.id, older.id)).toBe(true)
    expect(await memberData.removeReviewLike(fan.id, older.id)).toBe(false)
    expect((await memberData.titleReviews({ id: 551, kind: 'movie' }, 1, 'popular', fan.id)).items[0]).toMatchObject({ liked: false, likesCount: 0 })
  })

  it('follows members once and counts both sides honestly', async () => {
    await db.prisma.member.create({ data: { email: 'followed@example.com', emailVerifiedAt: new Date(), profile: { create: { username: 'followed_star' } } } })
    const follower = await db.prisma.member.create({ data: { email: 'follower@example.com', emailVerifiedAt: new Date(), profile: { create: { username: 'eager_follower' } } } })

    expect(await memberData.isFollowing(follower.id, 'followed_star')).toBe(false)
    expect(await memberData.setFollow(follower.id, 'followed_star', true)).toEqual({ followers: 1, following: true })
    expect(await memberData.setFollow(follower.id, 'followed_star', true)).toEqual({ followers: 1, following: true })
    expect(await memberData.isFollowing(follower.id, 'followed_star')).toBe(true)
    expect(await memberData.profile('followed_star')).toMatchObject({ social: { followers: 1, following: 0 } })
    expect(await memberData.profile('eager_follower')).toMatchObject({ social: { followers: 0, following: 1 } })

    expect(await memberData.setFollow(follower.id, 'followed_star', false)).toEqual({ followers: 0, following: false })
    expect(await memberData.isFollowing(follower.id, 'followed_star')).toBe(false)
    expect(await memberData.setFollow(follower.id, 'followed_star', false)).toEqual({ followers: 0, following: false })

    expect(await memberData.setFollow(follower.id, 'eager_follower', true)).toBeNull()
    expect(await memberData.setFollow(follower.id, 'missing_member', true)).toBeNull()
    expect(await memberData.isFollowing(follower.id, 'missing_member')).toBe(false)
  })

  it('limits circle review listings to followed public profiles', async () => {
    const critic = await db.prisma.member.create({ data: { email: 'circle-critic@example.com', emailVerifiedAt: new Date(), profile: { create: { username: 'circle_critic', visibility: 'public' } } } })
    const stranger = await db.prisma.member.create({ data: { email: 'stranger2@example.com', emailVerifiedAt: new Date(), profile: { create: { username: 'total_stranger', visibility: 'public' } } } })
    const quiet = await db.prisma.member.create({ data: { email: 'quiet2@example.com', emailVerifiedAt: new Date(), profile: { create: { username: 'quiet_followed', visibility: 'private' } } } })
    const viewer = await db.prisma.member.create({ data: { email: 'viewer2@example.com', emailVerifiedAt: new Date(), profile: { create: { username: 'circle_viewer' } } } })
    await db.prisma.review.create({ data: { body: 'Circle take.', memberId: critic.id, tmdbId: 552 } })
    await db.prisma.review.create({ data: { body: 'Stranger take.', memberId: stranger.id, tmdbId: 552 } })
    await db.prisma.review.create({ data: { body: 'Quiet take.', memberId: quiet.id, tmdbId: 552 } })
    expect(await memberData.setFollow(viewer.id, 'circle_critic', true)).toMatchObject({ following: true })
    expect(await memberData.setFollow(viewer.id, 'quiet_followed', true)).toMatchObject({ following: true })

    const circle = await memberData.titleReviews({ id: 552, kind: 'movie' }, 1, 'recent', viewer.id, 'circle')
    expect(circle).toMatchObject({ totalResults: 1 })
    expect(circle.items.map((item) => item.body)).toEqual(['Circle take.'])

    const guests = await memberData.titleReviews({ id: 552, kind: 'movie' }, 1, 'recent', undefined, 'circle')
    expect(guests).toMatchObject({ items: [], totalPages: 0, totalResults: 0 })

    const everyone = await memberData.titleReviews({ id: 552, kind: 'movie' }, 1, 'recent', viewer.id, 'all')
    expect(everyone.totalResults).toBe(2)
  })
})

afterAll(async () => {
  await control.query('TRUNCATE "Member" CASCADE')
  await control.end()
  await db.close()
})
