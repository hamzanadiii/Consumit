import type { CatalogMovieDetail } from '@consumit/contracts'
import pg from 'pg'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { createFakeCatalog } from '../../catalog/fake-catalog.ts'
import { createDbClient } from '../../db/client.ts'
import { createLetterboxdImporter } from './importer.ts'
import { createPostgresLetterboxdImportRepository } from './postgres-repository.ts'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required for integration tests.')
const control = new pg.Pool({ connectionString: databaseUrl })
const db = createDbClient(databaseUrl)

const movie: CatalogMovieDetail = {
  backdropUrl: null, cast: [], certification: null, countries: [], creators: [], genreNames: [], homepageUrl: null,
  id: 666277, kind: 'movie', languages: [], originalTitle: 'Past Lives', overview: '', popularity: 1, posterUrl: null,
  recommendations: [], releaseDate: '2023-01-01', runtimeMinutes: 106, status: 'Released', tagline: null,
  title: 'Past Lives', tmdbRating: null, tmdbVoteCount: 0, year: 2023,
}

const alternateMovie: CatalogMovieDetail = { ...movie, id: 843, originalTitle: 'In the Mood for Love', releaseDate: '2000-09-29', title: 'In the Mood for Love', year: 2000 }

beforeEach(async () => {
  await control.query('TRUNCATE "Member" CASCADE')
})

describe('Postgres Letterboxd repository', () => {
  it('confirms atomically, merges a repeated archive, and preserves a manually detached review', async () => {
    const member = await db.prisma.member.create({ data: { email: 'member@example.com', emailVerifiedAt: new Date(), profile: { create: { username: 'cinema_fan' } } } })
    const repository = createPostgresLetterboxdImportRepository(db.prisma)
    const importer = createLetterboxdImporter({ catalog: createFakeCatalog({ titles: [movie] }), repository })
    const csv = Buffer.from('Title,Year,tmdbID,Rating,Review,WatchedDate\nPast Lives,2023,666277,4.5,"A real, quiet review.",2024-02-03\n')

    for (let pass = 0; pass < 2; pass += 1) {
      const batch = await importer.upload(member.id, 'reviews.csv', csv)
      await importer.processNext(`worker-${pass}`)
      await importer.confirm(member.id, batch.id)
    }
    expect(await db.prisma.watchedTitle.count({ where: { memberId: member.id } })).toBe(1)
    expect(await db.prisma.rating.count({ where: { memberId: member.id } })).toBe(1)
    expect(await db.prisma.review.count({ where: { memberId: member.id } })).toBe(1)

    await db.prisma.review.updateMany({ data: { origin: 'NATIVE' }, where: { memberId: member.id } })
    await importer.removeImportedData(member.id)
    expect(await db.prisma.watchedTitle.count({ where: { memberId: member.id } })).toBe(0)
    expect(await db.prisma.rating.count({ where: { memberId: member.id } })).toBe(0)
    expect(await db.prisma.review.count({ where: { memberId: member.id } })).toBe(1)
  })

  it('claims a queued import only once across concurrent workers', async () => {
    const member = await db.prisma.member.create({ data: { email: 'worker@example.com', emailVerifiedAt: new Date(), profile: { create: { username: 'worker_member' } } } })
    const repository = createPostgresLetterboxdImportRepository(db.prisma)
    const importer = createLetterboxdImporter({ catalog: createFakeCatalog({ titles: [movie] }), repository })
    await importer.upload(member.id, 'watched.csv', Buffer.from('Title,Year,tmdbID\nPast Lives,2023,666277\n'))
    const claims = await Promise.all([repository.claimNext('worker-a', new Date(0)), repository.claimNext('worker-b', new Date(0))])
    expect(claims.filter(Boolean)).toHaveLength(1)
  })

  it('moves stable imported records when a repeated source is corrected to another TMDB title', async () => {
    const member = await db.prisma.member.create({ data: { email: 'correction@example.com', emailVerifiedAt: new Date(), profile: { create: { username: 'correction_fan' } } } })
    const repository = createPostgresLetterboxdImportRepository(db.prisma)
    const importer = createLetterboxdImporter({ catalog: createFakeCatalog({ titles: [movie, alternateMovie] }), repository })
    const csv = Buffer.from('Title,Year,Rating,Review\nAmbiguous Film,2023,4.5,Imported review\n')

    for (const tmdbId of [843, 666277]) {
      const batch = await importer.upload(member.id, 'reviews.csv', csv)
      await importer.processNext(`worker-${tmdbId}`)
      const item = (await importer.detail(member.id, batch.id)).items[0]!
      await importer.select(member.id, batch.id, item.id, { tmdbId })
      await importer.confirm(member.id, batch.id)
    }

    expect(await db.prisma.watchedTitle.findMany({ where: { memberId: member.id } })).toMatchObject([{ tmdbId: 666277 }])
    expect(await db.prisma.rating.findMany({ where: { memberId: member.id } })).toMatchObject([{ tmdbId: 666277, value: 9 }])
    expect(await db.prisma.review.findMany({ where: { memberId: member.id } })).toMatchObject([{ tmdbId: 666277 }])
  })

  it('rejects completion from a worker after its stale claim is recovered', async () => {
    const member = await db.prisma.member.create({ data: { email: 'lease@example.com', emailVerifiedAt: new Date(), profile: { create: { username: 'lease_member' } } } })
    const repository = createPostgresLetterboxdImportRepository(db.prisma)
    const importer = createLetterboxdImporter({ catalog: createFakeCatalog({ titles: [movie] }), repository })
    const batch = await importer.upload(member.id, 'watched.csv', Buffer.from('Title,Year,tmdbID\nPast Lives,2023,666277\n'))
    expect(await repository.claimNext('worker-a', new Date(0))).not.toBeNull()
    expect(await repository.claimNext('worker-b', new Date('2999-01-01T00:00:00.000Z'))).not.toBeNull()

    expect(await repository.saveMatches(batch.id, 'worker-a', [])).toBe(false)
    expect(await repository.fail(batch.id, 'worker-a', 'stale failure')).toBe(false)
    expect((await repository.find(member.id, batch.id))?.workerId).toBe('worker-b')
  })
})

afterAll(async () => {
  await control.query('TRUNCATE "Member" CASCADE')
  await control.end()
  await db.close()
})
