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

  it('keeps private lists owner-only and persists four ordered native Favorites', async () => {
    const member = await db.prisma.member.create({ data: { email: 'owner@example.com', emailVerifiedAt: new Date(), profile: { create: { username: 'list_owner', visibility: 'public' } } } })
    const list = await db.prisma.memberList.create({ data: { memberId: member.id, name: 'Private list', slug: 'private-list' } })
    await db.prisma.memberList.create({ data: { memberId: member.id, name: 'Public list', slug: 'public-list', visibility: 'public' } })
    expect(await memberData.list(list.slug)).toBeNull()
    expect(await memberData.list(list.slug, member.id)).toMatchObject({ list: { name: 'Private list', visibility: 'private' } })
    expect(await memberData.profile('list_owner')).toMatchObject({ lists: [{ name: 'Public list' }], statistics: { lists: 1 } })
    expect(await memberData.profile('list_owner', member.id)).toMatchObject({ statistics: { lists: 2 } })
    const library = await memberData.setFavorites(member.id, [1, 2, 3, 4].map((id) => ({ id, kind: 'movie' as const })))
    expect(library.favorites.map((favorite) => favorite.position)).toEqual([1, 2, 3, 4])
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
})

afterAll(async () => {
  await control.query('TRUNCATE "Member" CASCADE')
  await control.end()
  await db.close()
})
