import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createDbClient } from '../db/client.ts'
import { createExperienceRepository } from './repository.ts'
import { createPostgresIdentityRepository } from '../identity/postgres-repository.ts'
const url = process.env.DATABASE_URL
if (!url || !/_test$/.test(new URL(url).pathname)) throw new Error('Use a dedicated _test database.')
const db = createDbClient(url), repo = createExperienceRepository(db.prisma)
beforeEach(async () => { await db.prisma.$executeRawUnsafe('TRUNCATE "Member" CASCADE') })
afterAll(() => db.close())
describe('durable member preferences', () => {
  it('keeps concurrent partial writes and survives repository restart without affecting another member', async () => {
    const first = await db.prisma.member.create({ data: { email: 'first@prefs.example' } })
    const second = await db.prisma.member.create({ data: { email: 'second@prefs.example' } })
    await repo.patch(first.id, { guideStatus: 'dismissed', guideVersion: 1 })
    expect((await repo.read(first.id)).preferences.playbackConfigured).toBe(false)
    await Promise.all([repo.patch(first.id, { audioLanguage: 'ar' }), repo.patch(first.id, { qualityHeight: 1080 }), repo.patch(first.id, { subtitleLanguages: ['fr', 'ar'] })])
    expect((await createExperienceRepository(db.prisma).read(first.id)).preferences).toMatchObject({ audioLanguage: 'ar', qualityHeight: 1080, subtitleLanguages: ['fr', 'ar'], playbackConfigured: true })
    expect((await repo.read(second.id)).saved).toBe(false)
  })
  it('exports preferences and serializes deletion against late writes', async () => {
    const member = await db.prisma.member.create({ data: { email: 'export@prefs.example', profile: { create: { username: 'prefs_export' } } } })
    await repo.patch(member.id, { animeAudio: 'dub', guideStatus: 'completed', guideVersion: 1 })
    const identity = createPostgresIdentityRepository(db.prisma)
    expect((await identity.exportMember(member.id, new Date()))?.experiencePreferences).toMatchObject({ animeAudio: 'dub', guideStatus: 'completed' })
    await identity.tombstone(member.id)
    await expect(repo.patch(member.id, { audioLanguage: 'fr' })).rejects.toThrow('Sign in')
    expect((await repo.read(member.id)).saved).toBe(false)
  })
})
