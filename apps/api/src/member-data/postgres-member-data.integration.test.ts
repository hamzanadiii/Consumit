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
  it('pages private latest destinations, keeps anime identity and preserves progress when hidden', async () => {
    const owner = await db.prisma.member.create({ data: { email: 'resume-owner@example.com', emailVerifiedAt: new Date(), profile: { create: { username: 'resume_owner' } } } })
    const other = await db.prisma.member.create({ data: { email: 'resume-other@example.com', emailVerifiedAt: new Date(), profile: { create: { username: 'resume_other' } } } })
    await memberData.setProgress(owner.id, { kind: 'anime', id: 21, episode: 3, positionSeconds: 120, durationSeconds: 1200 })
    await memberData.setProgress(owner.id, { kind: 'movie', id: 21, positionSeconds: 180, durationSeconds: 1200 })
    await memberData.setProgress(other.id, { kind: 'anime', id: 999, episode: 8, positionSeconds: 200, durationSeconds: 1200 })
    const first = await memberData.continueWatching!(owner.id, undefined, 1)
    const second = await memberData.continueWatching!(owner.id, first.nextCursor!, 1)
    expect([...first.items, ...second.items].map(row => `${row.kind}:${row.id}`).sort()).toEqual(['anime:21', 'movie:21'])
    await memberData.hideContinueWatching!(owner.id, { kind: 'anime', id: 21 })
    expect((await memberData.progress(owner.id, { kind: 'anime', id: 21 }))?.positionSeconds).toBe(120)
    expect((await memberData.continueWatching!(owner.id, undefined, 10)).items.find(row => row.kind === 'anime')?.hiddenAt).not.toBeNull()
    await memberData.setProgress(owner.id, { kind: 'anime', id: 21, episode: 3, positionSeconds: 220, durationSeconds: 1200 })
    expect((await memberData.continueWatching!(owner.id, undefined, 10)).items.find(row => row.kind === 'anime')?.hiddenAt).toBeNull()
    await memberData.dismissRecommendation!(owner.id, { kind: 'anime', id: 100 }, true)
    expect(await memberData.recommendationDismissals!(other.id)).toEqual([])
    expect(await memberData.filterRecommendations!(owner.id, [{ kind: 'anime', id: 100 }, { kind: 'movie', id: 100 }])).toEqual([{ kind: 'movie', id: 100 }])
    await memberData.dismissRecommendation!(owner.id, { kind: 'anime', id: 100 }, false)
    expect(await memberData.recommendationDismissals!(owner.id)).toEqual([])
  })
  it('pages every library collection without gaps and rejects another member cursor', async () => {
    const owner = await db.prisma.member.create({ data: { email: 'library-owner@example.com', profile: { create: { username: 'library_owner', visibility: 'public' } } } })
    const viewer = await db.prisma.member.create({ data: { email: 'library-viewer@example.com', profile: { create: { username: 'library_viewer', visibility: 'public' } } } })
    const timestamps = Array.from({ length: 5 }, (_, index) => new Date(Date.UTC(2026, 0, index + 1)))
    for (let index = 0; index < timestamps.length; index++) {
      const timestamp = timestamps[index]!
      const id = 710000 + index
      await db.prisma.savedTitle.create({ data: { catalogKind: 'MOVIE', createdAt: timestamp, memberId: owner.id, tmdbId: id } })
      await db.prisma.diaryEntry.create({ data: { catalogKind: 'MOVIE', createdAt: timestamp, memberId: owner.id, tmdbId: id, watchedOn: timestamp } })
      const list = await db.prisma.memberList.create({ data: { memberId: owner.id, name: `Page list ${index}`, slug: `page-list-${index}`, updatedAt: timestamp, visibility: 'public' } })
      await db.prisma.savedMemberList.create({ data: { createdAt: timestamp, listId: list.id, memberId: viewer.id } })
    }

    async function collect(memberId: string, collection: 'diary' | 'lists' | 'saved') {
      const items: unknown[] = []
      let cursor: string | undefined
      for (let pageNumber = 0; pageNumber < 5; pageNumber++) {
        const page = await memberData.libraryPage(memberId, collection, cursor, 2)
        expect(page.collection).toBe(collection)
        items.push(...page.items)
        if (!page.nextCursor) return items
        cursor = page.nextCursor
      }
      throw new Error(`Library ${collection} did not terminate within its fixture size.`)
    }

    const firstSaved = await memberData.libraryPage(owner.id, 'saved', undefined, 2)
    if (firstSaved.collection !== 'saved') throw new Error('Expected a saved-title page.')
    expect(firstSaved.items.map((item) => item.id)).toEqual([710004, 710003])
    expect(firstSaved.nextCursor).not.toBeNull()
    expect(await memberData.libraryPage(viewer.id, 'saved', firstSaved.nextCursor!, 2)).toMatchObject({ items: [], nextCursor: null })
    expect((await collect(owner.id, 'saved')).map((item) => (item as { id: number }).id)).toEqual([710004, 710003, 710002, 710001, 710000])
    expect((await collect(owner.id, 'diary')).map((item) => (item as { id: number }).id)).toEqual([710004, 710003, 710002, 710001, 710000])
    expect((await collect(owner.id, 'lists')).map((item) => (item as { slug: string }).slug)).toEqual(['page-list-4', 'page-list-3', 'page-list-2', 'page-list-1', 'page-list-0'])
    expect(await db.prisma.savedMemberList.count({ where: { memberId: viewer.id } })).toBe(5)
  })

  it('resolves username aliases and returns only stored profile activity', async () => {
    const member = await db.prisma.member.create({ data: {
      email: 'profile@example.com', emailVerifiedAt: new Date('2026-01-01T00:00:00Z'),
      profile: { create: { bio: 'Real bio', displayName: 'Real Member', location: 'Rabat', username: 'current_name', visibility: 'public' } },
      usernameAliases: { create: { username: 'old_name' } },
      watchedTitles: { create: { tmdbId: 666277 } },
      diaryEntries: { create: { sourceKey: null, tmdbId: 666277, watchedOn: new Date('2026-09-01T00:00:00Z') } },
      reviews: { create: { body: 'A stored review.', tmdbId: 666277 } },
    } })
    const profile = await memberData.profile('old_name', member.id)
    expect(profile).toMatchObject({ canonicalUsername: 'current_name', profile: { bio: 'Real bio', location: 'Rabat' }, statistics: { diaryEntries: 1, reviews: 1, watched: 1 } })
    expect(profile?.reviews[0]?.body).toBe('A stored review.')
    expect((await memberData.librarySnapshot(member.id)).diary.items).toHaveLength(1)
  })

  it('preserves exact episode identity while keeping legacy follows private', async () => {
    const viewer = await db.prisma.member.create({ data: { email: 'episode-viewer@example.com', profile: { create: { username: 'episode_viewer', visibility: 'public' } } } })
    const owner = await db.prisma.member.create({ data: { email: 'episode-owner@example.com', profile: { create: { username: 'episode_owner', visibility: 'public' } } } })
    await db.prisma.follow.create({ data: { followerId: viewer.id, followingId: owner.id } })

    const entry = await memberData.createDiaryEntry(owner.id, {
      episode: 3,
      id: 95396,
      idempotencyKey: crypto.randomUUID(),
      kind: 'series',
      season: 1,
      watchedOn: '2026-09-28',
    })

    expect(entry).toMatchObject({ episode: 3, id: 95396, kind: 'series', season: 1 })
    expect(await memberData.librarySnapshot(owner.id)).toMatchObject({ diary: { items: [{ episode: 3, id: 95396, kind: 'series', season: 1 }] } })
    expect(await memberData.profile('episode_owner', viewer.id)).toBeNull()
    expect(await memberData.profile('episode_owner', owner.id)).toMatchObject({ diary: [{ episode: 3, id: 95396, kind: 'series', season: 1 }] })
    expect(await db.prisma.follow.count()).toBe(1)
  })

  it('keeps private lists owner-only and persists four ordered native Favorites', async () => {
    const member = await db.prisma.member.create({ data: { email: 'owner@example.com', emailVerifiedAt: new Date(), profile: { create: { username: 'list_owner', visibility: 'public' } } } })
    const list = await db.prisma.memberList.create({ data: { memberId: member.id, name: 'Private list', slug: 'private-list' } })
    await db.prisma.memberList.create({ data: { memberId: member.id, name: 'Public list', slug: 'public-list', visibility: 'public' } })
    expect(await memberData.list(list.slug)).toBeNull()
    expect(await memberData.list(list.slug, member.id)).toMatchObject({ list: { name: 'Private list', visibility: 'private' } })
    expect(await memberData.profile('list_owner')).toBeNull()
    expect(await memberData.list('public-list')).toMatchObject({ viewerIsOwner: false, list: { visibility: 'public' } })
    expect(await memberData.profileArchive('list_owner', 'lists', member.id)).toMatchObject({ items: expect.arrayContaining([expect.objectContaining({ name: 'Private list', visibility: 'private' }), expect.objectContaining({ name: 'Public list', visibility: 'public' })]) })
    expect(await memberData.profile('list_owner', member.id)).toMatchObject({ statistics: { lists: 2 } })
    await memberData.setFavorites(member.id, [1, 2, 3, 4].map((id) => ({ id, kind: 'movie' as const })))
    const library = await memberData.librarySnapshot(member.id)
    expect(library.favorites.map((favorite) => favorite.position)).toEqual([1, 2, 3, 4])
    expect(library.favorites.every((favorite) => favorite.origin === 'native')).toBe(true)
    await memberData.setSaved(member.id, { id: 95396, kind: 'series' }, true)
    expect((await memberData.librarySnapshot(member.id)).saved.items).toMatchObject([{ id: 95396, kind: 'series', origin: 'native' }])
    await memberData.setSaved(member.id, { id: 95396, kind: 'series' }, false)
    expect((await memberData.librarySnapshot(member.id)).saved.items).toEqual([])
  })

  it('detaches edited Letterboxd records so import cleanup preserves them', async () => {
    const member = await db.prisma.member.create({ data: { email: 'editor@example.com', emailVerifiedAt: new Date(), profile: { create: { username: 'record_editor' } } } })
    const diary = await db.prisma.diaryEntry.create({ data: { importBatchId: 'import-1', memberId: member.id, origin: 'LETTERBOXD', sourceKey: 'diary-1', tmdbId: 843, watchedOn: new Date('2024-02-03T00:00:00.000Z') } })
    const review = await db.prisma.review.create({ data: { body: 'Imported body', importBatchId: 'import-1', memberId: member.id, origin: 'LETTERBOXD', sourceKey: 'review-1', tmdbId: 843 } })
    const list = await db.prisma.memberList.create({ data: { importBatchId: 'import-1', memberId: member.id, name: 'Imported list', origin: 'LETTERBOXD', slug: 'imported-list', sourceKey: 'list-1', items: { create: { origin: 'LETTERBOXD', position: 1, sourceKey: 'item-1', tmdbId: 843 } } } })

    expect(await memberData.updateDiary(member.id, diary.id, { rewatch: true, tags: ['favorite'] })).toBe(true)
    expect(await memberData.updateReview(member.id, review.id, { body: 'My edited review.' })).toBe(true)
    expect(await memberData.updateList(member.id, list.id, { name: 'My edited list', visibility: 'private' })).toBe(true)

    expect(await db.prisma.diaryEntry.findUnique({ where: { id: diary.id } })).toMatchObject({ importBatchId: null, origin: 'NATIVE', rewatch: true, sourceKey: null, tags: ['favorite'] })
    expect(await db.prisma.review.findUnique({ where: { id: review.id } })).toMatchObject({ body: 'My edited review.', importBatchId: null, origin: 'NATIVE', sourceKey: null })
    expect(await db.prisma.memberList.findUnique({ include: { items: true }, where: { id: list.id } })).toMatchObject({ importBatchId: null, name: 'My edited list', origin: 'NATIVE', sourceKey: null, visibility: 'private', items: [{ origin: 'NATIVE', sourceKey: null }] })
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

  it('records private episode completions once per attempt and preserves rewatches', async () => {
    const member = await db.prisma.member.create({ data: { email: 'history-owner@example.com', profile: { create: { username: 'history_owner' } } } })
    const other = await db.prisma.member.create({ data: { email: 'history-other@example.com', profile: { create: { username: 'history_other' } } } })
    const firstId = '82ef6eaf-9248-4b77-820d-6d7bc025c823'
    const secondId = '693fd9d7-b207-4b99-9167-98d498e5e002'
    const episode = { completed: true, episode: 3, id: 95396, kind: 'series' as const, positionSeconds: 1800, season: 1 }
    await memberData.setProgress(member.id, { ...episode, completionId: firstId })
    await memberData.setProgress(member.id, { ...episode, completionId: firstId })
    await memberData.setProgress(member.id, { ...episode, completionId: secondId })
    await memberData.setProgress(member.id, { ...episode, completionId: firstId, episode: 4 })
    const firstPage = await memberData.watchHistory(member.id, undefined, 2)
    expect(firstPage.items).toHaveLength(2)
    expect(firstPage.nextCursor).not.toBeNull()
    const secondPage = await memberData.watchHistory(member.id, firstPage.nextCursor!, 2)
    expect(secondPage.items).toHaveLength(1)
    expect([...firstPage.items, ...secondPage.items].filter((item) => item.episode === 3)).toHaveLength(2)
    expect((await memberData.watchHistory(other.id, undefined, 20)).items).toEqual([])
    expect((await memberData.watchHistory(other.id, firstPage.items[0]!.entryId, 20)).items).toEqual([])
    expect((await memberData.librarySnapshot(member.id)).diary.items).toEqual([])
    expect((await memberData.titleState(member.id, { id: 693134, kind: 'movie' })).watched).toBe(false)
    await memberData.setProgress(member.id, { completed: true, completionId: crypto.randomUUID(), id: 693134, kind: 'movie', positionSeconds: 7000 })
    expect((await memberData.titleState(member.id, { id: 693134, kind: 'movie' })).watched).toBe(true)
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

    await memberData.setWatched(member.id, { id: 693134, kind: 'movie' }, true)
    expect((await memberData.titleState(member.id, { id: 693134, kind: 'movie' })).watched).toBe(true)
    await memberData.setWatched(member.id, { id: 693134, kind: 'movie' }, false)
    expect((await memberData.titleState(member.id, { id: 693134, kind: 'movie' })).watched).toBe(false)

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

  it('lists only owner title reviews with author ratings attached', async () => {
    const open = await db.prisma.member.create({ data: { email: 'open@example.com', emailVerifiedAt: new Date(), profile: { create: { displayName: 'Open Critic', username: 'open_critic', visibility: 'public' } } } })
    const quiet = await db.prisma.member.create({ data: { email: 'quiet@example.com', emailVerifiedAt: new Date(), profile: { create: { username: 'quiet_member', visibility: 'private' } } } })
    await db.prisma.review.create({ data: { body: 'First public take.', memberId: open.id, tmdbId: 550 } })
    await db.prisma.review.create({ data: { body: 'Private take.', memberId: quiet.id, tmdbId: 550 } })
    await db.prisma.rating.create({ data: { memberId: open.id, tmdbId: 550, value: 8 } })

    const page = await memberData.titleReviews({ id: 550, kind: 'movie' }, 1, 'recent', open.id)
    expect(page).toMatchObject({ page: 1, totalPages: 1, totalResults: 1 })
    expect(page.items).toHaveLength(1)
    expect(page.items[0]).toMatchObject({
      author: { displayName: 'Open Critic', username: 'open_critic' },
      body: 'First public take.',
      rating: 8,
    })

    const empty = await memberData.titleReviews({ id: 550, kind: 'movie' }, 2, 'recent', open.id)
    expect(empty).toMatchObject({ items: [], page: 2, totalPages: 1, totalResults: 1 })
    expect(await memberData.titleReviews({ id: 551, kind: 'movie' }, 1, 'recent', open.id)).toMatchObject({ items: [], totalPages: 0, totalResults: 0 })
  })

  it('keeps anime ids in their own namespace beside colliding TMDB ids', async () => {
    const member = await db.prisma.member.create({ data: { email: 'anime@example.com', emailVerifiedAt: new Date(), profile: { create: { username: 'anime_watcher', visibility: 'public' } } } })

    const animeProgress = await memberData.setProgress(member.id, { durationSeconds: 1440, id: 21, kind: 'anime', episode: 1, positionSeconds: 300 })
    expect(animeProgress).toMatchObject({ id: 21, kind: 'anime', positionSeconds: 300 })
    const movieProgress = await memberData.setProgress(member.id, { durationSeconds: 7200, id: 21, kind: 'movie', positionSeconds: 60 })
    expect(movieProgress).toMatchObject({ id: 21, kind: 'movie', positionSeconds: 60 })

    expect(await memberData.progress(member.id, { id: 21, kind: 'anime' })).toMatchObject({ positionSeconds: 300 })
    expect(await memberData.progress(member.id, { id: 21, kind: 'movie' })).toMatchObject({ positionSeconds: 60 })

    const progressRows = await db.prisma.playbackProgress.findMany({ where: { memberId: member.id, tmdbId: 21 } })
    expect(progressRows.map((row) => row.catalogKind).sort()).toEqual(['ANIME', 'MOVIE'])

    expect(await memberData.setRating(member.id, { id: 21, kind: 'anime' }, 9)).toMatchObject({ id: 21, kind: 'anime', origin: 'native', value: 9 })
    expect(await memberData.rating(member.id, { id: 21, kind: 'movie' })).toBeNull()
    expect((await memberData.rating(member.id, { id: 21, kind: 'anime' }))?.value).toBe(9)

    await memberData.setWatched(member.id, { id: 21, kind: 'anime' }, true)
    await memberData.setSaved(member.id, { id: 21, kind: 'movie' }, true)
    expect((await memberData.titleState(member.id, { id: 21, kind: 'anime' })).watched).toBe(true)
    expect((await memberData.librarySnapshot(member.id)).saved.items).toMatchObject([{ id: 21, kind: 'movie' }])

    await memberData.createReview(member.id, { body: 'An anime take.', id: 21, kind: 'anime', reviewedOn: '2026-09-09' })
    expect(await memberData.titleReviews({ id: 21, kind: 'anime' }, 1, 'recent', member.id)).toMatchObject({ totalResults: 1 })
    expect(await memberData.titleReviews({ id: 21, kind: 'movie' }, 1, 'recent', member.id)).toMatchObject({ totalResults: 0 })
    expect(await db.prisma.review.count({ where: { memberId: member.id, tmdbId: 21, catalogKind: 'ANIME' } })).toBe(1)
  })
})

afterAll(async () => {
  await control.query('TRUNCATE "Member" CASCADE')
  await control.end()
  await db.close()
})
