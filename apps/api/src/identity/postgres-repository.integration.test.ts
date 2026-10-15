import pg from 'pg'
import { describe, expect, it } from 'vitest'

import { createDbClient } from '../db/client.ts'
import { describeIdentityContract } from './contract-suite.ts'
import { createMemoryAuthState } from './memory-auth-state.ts'
import { createMemoryAuthNotifier } from './memory-notifier.ts'
import { createPostgresIdentityRepository } from './postgres-repository.ts'
import { createIdentity } from './service.ts'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required for integration tests.')

describeIdentityContract('Postgres repository', async () => {
  const pool = new pg.Pool({ connectionString: databaseUrl })
  await pool.query('TRUNCATE "Member" CASCADE')
  const db = createDbClient(databaseUrl)
  const repository = createPostgresIdentityRepository(db.prisma)
  const state = createMemoryAuthState()
  const notifier = createMemoryAuthNotifier()
  return {
    cleanup: async () => {
      await pool.query('TRUNCATE "Member" CASCADE')
      await pool.end()
      await db.close()
    },
    identity: createIdentity({ notifier, repository, state }),
    notifier,
    repository,
    state,
  }
})

describe('Postgres username advisory locks', () => {
  it('includes private completed episode history in an account export', async () => {
    const db = createDbClient(databaseUrl)
    const pool = new pg.Pool({ connectionString: databaseUrl })
    try {
      const repository = createPostgresIdentityRepository(db.prisma)
      const member = await repository.createVerifiedAccount({ createdAt: new Date(), email: 'export-history@example.com', passwordHash: 'hash', username: 'export_history' })
      await db.prisma.watchHistoryEntry.create({ data: { catalogKind: 'SERIES', completionId: crypto.randomUUID(), episode: 4, memberId: member.id, season: 2, tmdbId: 95396 } })
      await db.prisma.diaryEntry.create({ data: { catalogKind: 'SERIES', episode: 4, memberId: member.id, season: 2, tmdbId: 95396, watchedOn: new Date('2026-09-27T00:00:00.000Z') } })
      await db.prisma.profile.update({ where: { memberId: member.id }, data: { visibility: 'public' } })
      const legacyList = await db.prisma.memberList.create({ data: { memberId: member.id, name: 'Legacy list', slug: 'legacy-export-list', visibility: 'public' } })
      const exported = await repository.exportMember(member.id, new Date('2026-09-28T00:00:00.000Z'))
      expect(exported?.watchHistory).toMatchObject([{ episode: 4, id: 95396, kind: 'series', season: 2 }])
      expect(exported?.library.diary).toMatchObject([{ episode: 4, id: 95396, kind: 'series', season: 2 }])
      // Export retains deliberate publication after the public-profile migration.
      // Watch History and Diary remain private independently of this choice.
      expect(exported?.profile.visibility).toBe('public')
      expect(exported?.library.lists).toMatchObject([{ visibility: 'public' }])
      expect(exported?.library).not.toHaveProperty('savedLists')
      expect((await db.prisma.profile.findUniqueOrThrow({ where: { memberId: member.id } })).visibility).toBe('public')
      expect((await db.prisma.memberList.findUniqueOrThrow({ where: { id: legacyList.id } })).visibility).toBe('public')
    } finally {
      await pool.query('TRUNCATE "Member" CASCADE')
      await pool.end()
      await db.close()
    }
  })
  it('creates verified accounts and renames usernames without void-column failures', async () => {
    const db = createDbClient(databaseUrl)
    const pool = new pg.Pool({ connectionString: databaseUrl })
    try {
      const repository = createPostgresIdentityRepository(db.prisma)
      const created = await repository.createVerifiedAccount({
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        email: 'lock@example.com',
        passwordHash: 'hash',
        username: 'lock_fan',
      })
      const updated = await repository.updateProfile(
        created.id,
        { displayName: 'Lock Fan', username: 'lock_films' },
        new Date('2026-02-01T00:00:00.000Z'),
      )
      expect(updated?.profile.username).toBe('lock_films')
      expect(updated?.profile.displayName).toBe('Lock Fan')
      expect(await repository.isUsernameAvailable('lock_fan')).toBe(false)
    } finally {
      await pool.query('TRUNCATE "Member" CASCADE')
      await pool.end()
      await db.close()
    }
  })

  it('keeps only the anonymized tombstone and username aliases after deletion', async () => {
    const db = createDbClient(databaseUrl)
    const pool = new pg.Pool({ connectionString: databaseUrl })
    try {
      const repository = createPostgresIdentityRepository(db.prisma)
      const member = await repository.createVerifiedAccount({
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        email: 'delete@example.com',
        passwordHash: 'hash',
        username: 'delete_fan',
      })
      await db.prisma.importBatch.create({ data: { archiveSha256: 'archive', memberId: member.id, sourceFilename: 'letterboxd.zip' } })
      await db.prisma.watchedTitle.create({ data: { memberId: member.id, tmdbId: 843 } })
      await db.prisma.playbackProgress.create({ data: { memberId: member.id, tmdbId: 843 } })
      await db.prisma.watchHistoryEntry.create({ data: { completionId: crypto.randomUUID(), memberId: member.id, catalogKind: 'MOVIE', tmdbId: 843 } })
      await db.prisma.diaryEntry.create({ data: { memberId: member.id, tmdbId: 843, watchedOn: new Date('2024-02-03T00:00:00.000Z') } })
      await db.prisma.rating.create({ data: { memberId: member.id, tmdbId: 843, value: 10 } })
      await db.prisma.review.create({ data: { body: 'Review', memberId: member.id, tmdbId: 843 } })
      await db.prisma.savedTitle.create({ data: { memberId: member.id, tmdbId: 843 } })
      await db.prisma.favorite.create({ data: { memberId: member.id, position: 1, tmdbId: 843 } })
      await db.prisma.memberList.create({ data: { memberId: member.id, name: 'List', slug: 'delete-list', items: { create: { position: 1, tmdbId: 843 } } } })

      await repository.tombstone(member.id)

      expect(await db.prisma.member.findUnique({ where: { id: member.id } })).toMatchObject({ emailVerifiedAt: null, status: 'DELETED' })
      expect(await db.prisma.usernameAlias.findUnique({ where: { username: 'delete_fan' } })).toMatchObject({ memberId: member.id })
      expect(await Promise.all([
        db.prisma.profile.count({ where: { memberId: member.id } }),
        db.prisma.credential.count({ where: { memberId: member.id } }),
        db.prisma.importBatch.count({ where: { memberId: member.id } }),
        db.prisma.watchedTitle.count({ where: { memberId: member.id } }),
        db.prisma.playbackProgress.count({ where: { memberId: member.id } }),
        db.prisma.watchHistoryEntry.count({ where: { memberId: member.id } }),
        db.prisma.diaryEntry.count({ where: { memberId: member.id } }),
        db.prisma.rating.count({ where: { memberId: member.id } }),
        db.prisma.review.count({ where: { memberId: member.id } }),
        db.prisma.savedTitle.count({ where: { memberId: member.id } }),
        db.prisma.favorite.count({ where: { memberId: member.id } }),
        db.prisma.memberList.count({ where: { memberId: member.id } }),
      ])).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    } finally {
      await pool.query('TRUNCATE "Member" CASCADE')
      await pool.end()
      await db.close()
    }
  })
})
