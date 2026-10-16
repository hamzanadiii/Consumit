import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createDbClient } from '../db/client.ts'
import { createPostgresMemberData } from '../member-data/postgres-member-data.ts'
import { createPostgresIdentityRepository } from '../identity/postgres-repository.ts'
import { createReleaseRepository } from './repository.ts'
import { CHECK_FRESH_MS, WEEK_MS } from './policy.ts'
import type { ReleaseProbeJob, ReleaseProbeSource } from '@consumit/contracts'

const url = process.env.DATABASE_URL
if (!url || !/_test$/.test(new URL(url).pathname)) throw new Error('Use a dedicated database whose name ends with _test for this suite.')
const db = createDbClient(url), prisma = db.prisma, memberData = createPostgresMemberData(prisma)
let now = new Date('2026-10-09T12:00:00Z'), current = true
const repo = createReleaseRepository(prisma, () => current, () => now)
const source: ReleaseProbeSource = { src: 'https://media.example/a.mp4', type: 'native', expiresAt: '2099-01-01T00:00:00.000Z', providerId: 'one', revision: 'a'.repeat(64), region: 'US', audioLanguage: 'en', mediaHosts: ['media.example'], mediaHostPatterns: [] }
beforeEach(async () => {
  await prisma.$executeRawUnsafe('TRUNCATE "Member", "ReleaseEpisode", "ReleaseTitle" CASCADE')
  now = new Date('2026-10-09T12:00:00Z'); current = true
})
afterAll(() => db.close())
async function member(name: string) { return prisma.member.create({ data: { email: `${name}@example.com`, profile: { create: { username: name, visibility: 'private' } } } }) }
async function tracked(id: string, kind: 'SERIES' | 'ANIME' = 'SERIES', title = 1) {
  await prisma.releaseTracking.create({ data: { memberId: id, catalogKind: kind, tmdbId: title, trackedSince: new Date(now.getTime() - WEEK_MS) } })
}
async function episode(number = 1, releasedAt = new Date(now.getTime() - 60_000), kind: 'SERIES' | 'ANIME' = 'SERIES', season = kind === 'ANIME' ? 0 : 1) {
  return prisma.releaseEpisode.create({ data: { catalogKind: kind, tmdbId: 1, season, episode: number, releasedAt, datePrecision: 'instant', title: 'Fixture', verifyAfter: now } })
}
async function check(job: ReleaseProbeJob | null, success = true) {
  if (!job) throw new Error('Expected queued check')
  const next = await repo.nextAttempt(job.id, job.leaseToken, ['one', 'two', 'three'])
  await repo.setSource(job.id, job.leaseToken, { ...source, providerId: next!.providerId })
  await repo.finish(job.id, job.leaseToken, success, () => current, success ? undefined : 'media', { decodedFrames: success ? 180 : 0, advancedSeconds: success ? 5 : 0, seeked: success, resumedSeconds: success ? 2 : 0 })
}
describe('persistent release tracking and alerts', () => {
  it('preserves tracking across duplicate saves and Favorite overlap; removal/re-add resets activation', async () => {
    const owner = await member('overlap')
    await memberData.setSaved(owner.id, { kind: 'series', id: 1 }, true)
    const original = await prisma.releaseTracking.findFirstOrThrow()
    await memberData.setFavorites(owner.id, [{ kind: 'series', id: 1 }])
    await memberData.setSaved(owner.id, { kind: 'series', id: 1 }, false)
    expect((await prisma.releaseTracking.findFirstOrThrow()).trackedSince).toEqual(original.trackedSince)
    await memberData.setFavorites(owner.id, [])
    expect(await prisma.releaseTracking.count()).toBe(0)
    await memberData.setSaved(owner.id, { kind: 'series', id: 1 }, true)
    expect((await prisma.releaseTracking.findFirstOrThrow()).trackedSince.getTime()).toBeGreaterThanOrEqual(original.trackedSince.getTime())
    await memberData.setSaved(owner.id, { kind: 'movie', id: 1 }, true)
    expect(await prisma.releaseTracking.count()).toBe(1)
  })
  it('shows recent episodes only, hides completed ones and preserves canonical collisions', async () => {
    const owner = await member('boundaries'); await tracked(owner.id); await tracked(owner.id, 'ANIME')
    const first = await episode(1, new Date(now.getTime() - WEEK_MS))
    await episode(2, new Date(now.getTime() - WEEK_MS - 1)); await episode(3, new Date(now.getTime() + 1))
    await episode(1, now, 'SERIES', 2); await episode(1, now, 'ANIME')
    expect((await repo.shelf(owner.id)).items).toHaveLength(3)
    await prisma.watchHistoryEntry.create({ data: { memberId: owner.id, catalogKind: 'SERIES', tmdbId: 1, season: 1, episode: 1, completionId: crypto.randomUUID() } })
    expect((await repo.shelf(owner.id)).items).toHaveLength(2)
    expect((await repo.shelf(owner.id)).items.some(item => item.releasedAt === first.releasedAt.toISOString())).toBe(false)
  })
  it('notifies once after delayed successful playback; rechecks and read actions retain history', async () => {
    const owner = await member('delayed'); await tracked(owner.id); await repo.setPreferences(owner.id, true)
    now = new Date(now.getTime() + 60_000); const released = await episode()
    await check(await repo.claimCheck(), false)
    expect(await prisma.releaseNotification.count()).toBe(0)
    now = new Date(now.getTime() + 60 * 60_000); await check(await repo.claimCheck())
    expect(await prisma.releaseNotification.count()).toBe(1)
    expect((await repo.shelf(owner.id)).items[0]?.checkedAt).toBe(now.toISOString())
    const alert = await prisma.releaseNotification.findFirstOrThrow()
    await repo.markRead(owner.id, alert.id)
    await prisma.watchHistoryEntry.create({ data: { memberId: owner.id, catalogKind: 'SERIES', tmdbId: 1, season: 1, episode: 1, completionId: crypto.randomUUID() } })
    now = new Date(now.getTime() + CHECK_FRESH_MS); await check(await repo.claimCheck())
    expect(await prisma.releaseNotification.count()).toBe(1)
    expect((await repo.shelf(owner.id)).items).toHaveLength(0)
    expect((await repo.notifications(owner.id, { filter: 'all', limit: 20 })).items[0]?.episode.ref.episode).toBe(released.episode)
    expect((await repo.notifications(owner.id, { filter: 'unread', limit: 20 })).items).toHaveLength(0)
  })
  it('does not backfill on activation, opt-out, removal or completed releases', async () => {
    const old = await member('old'), disabled = await member('disabled'), removed = await member('removed'), completed = await member('completed'), fresh = await member('fresh')
    for (const owner of [old, disabled, removed, completed, fresh]) { await tracked(owner.id); await repo.setPreferences(owner.id, true) }
    await episode(1, new Date(now.getTime() - 1)); await episode(2, now)
    await repo.setPreferences(disabled.id, false)
    await prisma.releaseTracking.deleteMany({ where: { memberId: removed.id } })
    await prisma.watchHistoryEntry.create({ data: { memberId: completed.id, catalogKind: 'SERIES', tmdbId: 1, season: 1, episode: 2, completionId: crypto.randomUUID() } })
    await check(await repo.claimCheck()); await check(await repo.claimCheck())
    expect(await prisma.releaseNotification.count({ where: { memberId: disabled.id } })).toBe(0)
    expect(await prisma.releaseNotification.count({ where: { memberId: removed.id } })).toBe(0)
    expect(await prisma.releaseNotification.count({ where: { memberId: completed.id } })).toBe(0)
    expect(await prisma.releaseNotification.count({ where: { memberId: fresh.id } })).toBe(1)
    expect(await prisma.releaseNotification.count({ where: { episode: { episode: 1 } } })).toBe(0)
  })
  it('serializes concurrent claims, expires leases, retains attempt position and invalidates evidence', async () => {
    const owner = await member('leases'); await tracked(owner.id); await episode()
    const claims = await Promise.all([repo.claimCheck(), repo.claimCheck(), repo.claimCheck()])
    expect(claims.filter(Boolean)).toHaveLength(1)
    const run = claims.find(Boolean)!
    expect((await repo.nextAttempt(run.id, run.leaseToken, ['one', 'two', 'three']))?.providerId).toBe('one')
    now = new Date(now.getTime() + 60 * 60_000)
    await expect(repo.finish(run.id, run.leaseToken, true, () => true)).rejects.toThrow('expired')
    const next = await repo.claimCheck()
    expect((await repo.nextAttempt(next!.id, next!.leaseToken, ['one', 'two', 'three']))?.providerId).toBe('two')
    await repo.setSource(next!.id, next!.leaseToken, { ...source, providerId: 'two' }); await repo.finish(next!.id, next!.leaseToken, true, () => true)
    expect((await repo.shelf(owner.id)).items[0]?.checkedAt).not.toBeNull()
    current = false; expect((await repo.shelf(owner.id)).items[0]?.checkedAt).toBeNull()
    current = true; now = new Date(now.getTime() + CHECK_FRESH_MS); expect((await repo.shelf(owner.id)).items[0]?.checkedAt).toBeNull()
  })
  it('pages without gaps, rejects cross-member read/cursors, exports and explicitly deletes owned records', async () => {
    const owner = await member('privacy'), other = await member('other'); await tracked(owner.id)
    for (let i = 1; i <= 5; i++) { const release = await episode(i); await prisma.releaseNotification.create({ data: { memberId: owner.id, episodeId: release.id, checkedAt: now, createdAt: new Date(now.getTime() + i) } }) }
    const first = await repo.notifications(owner.id, { filter: 'all', limit: 2 })
    const second = await repo.notifications(owner.id, { filter: 'all', limit: 2, cursor: first.nextCursor! })
    const third = await repo.notifications(owner.id, { filter: 'all', limit: 2, cursor: second.nextCursor! })
    expect(new Set([...first.items, ...second.items, ...third.items].map(row => row.id)).size).toBe(5)
    await expect(repo.markRead(other.id, first.items[0]!.id)).rejects.toThrow('not found')
    expect((await repo.notifications(other.id, { filter: 'all', limit: 2, cursor: first.nextCursor! })).items).toHaveLength(0)
    await repo.setPreferences(owner.id, true)
    const identity = createPostgresIdentityRepository(prisma)
    expect(await identity.exportMember(owner.id, now)).toMatchObject({ notificationPreferences: { newEpisodes: true }, notifications: expect.any(Array) })
    await identity.tombstone(owner.id)
    expect(await prisma.releaseNotification.count()).toBe(0); expect(await prisma.releaseTracking.count()).toBe(0); expect(await prisma.notificationPreference.count()).toBe(0)
  })
  it('limits work to 30 jobs per hour and two attempts, and concurrent completion inserts only once', async () => {
    const owner = await member('limits'); await tracked(owner.id); await repo.setPreferences(owner.id, true)
    const release = await episode(1, now)
    const job = await repo.claimCheck()
    await repo.nextAttempt(job!.id, job!.leaseToken, ['one'])
    await repo.nextAttempt(job!.id, job!.leaseToken, ['one'])
    expect(await repo.nextAttempt(job!.id, job!.leaseToken, ['one'])).toBeNull()
    await repo.setSource(job!.id, job!.leaseToken, source)
    const results = await Promise.allSettled([repo.finish(job!.id, job!.leaseToken, true, () => true), repo.finish(job!.id, job!.leaseToken, true, () => true)])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(await prisma.releaseNotification.count()).toBe(1)
    await prisma.releaseCheck.createMany({ data: Array.from({ length: 29 }, () => ({ episodeId: release.id, leaseToken: crypto.randomUUID(), startedAt: now, leaseUntil: now, finishedAt: now })) })
    await prisma.releaseEpisode.update({ where: { id: release.id }, data: { verifyAfter: now } })
    expect(await repo.claimCheck()).toBeNull()
    await prisma.playbackProgress.create({ data: { memberId: owner.id, catalogKind: 'SERIES', tmdbId: 1, season: 1, episode: 1, completed: true } })
    expect((await repo.shelf(owner.id)).items).toHaveLength(0)
  })
  it('recovers catalog leases after restart, preserves releases on failure and reports partial status', async () => {
    const owner = await member('catalog'); await tracked(owner.id)
    await prisma.releaseTitle.create({ data: { catalogKind: 'SERIES', tmdbId: 1, refreshAfter: now } })
    const first = await repo.claimTitle(); expect(first).not.toBeNull(); expect(await repo.claimTitle()).toBeNull()
    now = new Date(now.getTime() + 120_001)
    const replacement = await repo.claimTitle(); expect(replacement?.leaseToken).not.toBe(first?.leaseToken)
    await repo.refreshTitle(first!, []); expect(await repo.claimTitle()).toBeNull()
    await episode(); await repo.refreshTitle(replacement!, null)
    expect(await repo.shelf(owner.id)).toMatchObject({ partial: true, items: [expect.anything()] })
    await repo.setPreferences(owner.id, true); await createPostgresIdentityRepository(prisma).tombstone(owner.id)
    await expect(repo.setPreferences(owner.id, true)).rejects.toThrow('Sign in')
  })
  it('withdraws corrected releases while retaining inbox history and fresh evidence for retained releases', async () => {
    const owner = await member('withdrawal'); await tracked(owner.id)
    const first = await episode(1), second = await episode(2)
    await prisma.releaseEpisode.update({ where: { id: second.id }, data: { checkedAt: now, verifyAfter: new Date(now.getTime() + CHECK_FRESH_MS) } })
    await prisma.releaseNotification.create({ data: { memberId: owner.id, episodeId: first.id, checkedAt: now } })
    await prisma.releaseTitle.create({ data: { catalogKind: 'SERIES', tmdbId: 1, refreshAfter: now } })
    const job = await repo.claimCheck(), title = await repo.claimTitle()
    await repo.refreshTitle(title!, [{ ref: { kind: 'series', id: 1, season: 1, episode: 2 }, title: 'Fixture', episodeTitle: null, imageUrl: null, releasedAt: second.releasedAt.toISOString(), datePrecision: 'instant', checkedAt: null }])
    expect((await repo.shelf(owner.id)).items.map(value => value.ref.episode)).toEqual([2])
    expect((await prisma.releaseEpisode.findUniqueOrThrow({ where: { id: second.id } })).checkedAt).toEqual(now)
    expect((await repo.notifications(owner.id, { filter: 'all', limit: 20 })).items).toHaveLength(1)
    await repo.nextAttempt(job!.id, job!.leaseToken, ['one']); await repo.setSource(job!.id, job!.leaseToken, source)
    expect(await repo.finish(job!.id, job!.leaseToken, true, () => true)).toMatchObject({ passed: false, notificationsInserted: 0 })
  })
})
