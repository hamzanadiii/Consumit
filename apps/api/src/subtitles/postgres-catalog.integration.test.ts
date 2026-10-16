import pg from 'pg'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'

import { createDbClient } from '../db/client.ts'
import { catalogIdentity } from './catalog.ts'
import { createPostgresSubtitleCatalog } from './postgres-catalog.ts'
import { createPostgresSubtitlePreferences } from './postgres-preferences.ts'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) throw new Error('DATABASE_URL is required for integration tests.')
const control = new pg.Pool({ connectionString: databaseUrl })
const db = createDbClient(databaseUrl)

beforeEach(async () => {
  await control.query('TRUNCATE "UserSubtitlePreference", "SubtitleTrack", "Member" CASCADE')
})

afterAll(async () => {
  await control.end()
  await db.close()
})

const VTT = 'WEBVTT\n\n00:00.000 --> 00:04.000\nHi\n\n00:05.000 --> 00:06.000\nYo\n'

describe('Postgres subtitle catalog', () => {
  it('saves discoveries idempotently and serves them back canonically', async () => {
    const catalog = createPostgresSubtitleCatalog(db.prisma)
    const ref = { kind: 'movie' as const, id: 550 }
    expect(await catalog.find(ref, ['en'])).toEqual([])
    const input = {
      language: 'en', label: 'English (yify)', format: 'vtt' as const, provider: 'yify',
      storageKey: 'abcdef0123456789', vtt: VTT, hi: false, rating: 9, releaseTag: 'BluRay',
    }
    await catalog.save(ref, [input])
    await catalog.save(ref, [input])
    const found = await catalog.find(ref, ['en'])
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ language: 'en', provider: 'yify', storageKey: 'abcdef0123456789', hi: false, rating: 9, releaseTag: 'BluRay' })
    expect(await catalog.find(ref, ['ar'])).toEqual([])
    expect(await catalog.find({ kind: 'movie', id: 551 }, ['en'])).toEqual([])
    expect(catalogIdentity(ref)).toEqual({ kind: 'MOVIE', tmdbId: 550, anilistId: 0, season: 0, episode: 0 })
  })

  it('stores per-member sync corrections independently', async () => {
    const preferences = createPostgresSubtitlePreferences(db.prisma)
    const member = await db.prisma.member.create({ data: { email: 'subs@example.com', emailVerifiedAt: new Date() } })
    const other = await db.prisma.member.create({ data: { email: 'other@example.com', emailVerifiedAt: new Date() } })
    const ref = { kind: 'series' as const, id: 1396, season: 1, episode: 1 }
    expect(await preferences.get(member.id, ref)).toBeNull()
    await preferences.set(member.id, ref, { trackId: 'sub-yify-ab12', offsetMs: 1500 })
    expect(await preferences.get(member.id, ref)).toEqual({ trackId: 'sub-yify-ab12', offsetMs: 1500 })
    await preferences.set(member.id, ref, { offsetMs: -500 })
    expect(await preferences.get(member.id, ref)).toEqual({ trackId: null, offsetMs: -500 })
    expect(await preferences.get(other.id, ref)).toBeNull()
  })
})
