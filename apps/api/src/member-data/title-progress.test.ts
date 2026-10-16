import { afterAll, describe, expect, it, vi } from 'vitest'
import { createDbClient } from '../db/client.ts'
import { createPostgresMemberData } from './postgres-member-data.ts'

// Prisma delegates are intercepted; this suite never connects to a database.
const db = createDbClient('postgresql://fixture:fixture@127.0.0.1:1/fixture')
const memberData = createPostgresMemberData(db.prisma)
afterAll(() => db.close())

describe('title progress versus exact Watch progress', () => {
  it.each(['series', 'anime'] as const)('reads the newest %s episode only within this member and title', async (kind) => {
    const read = vi.spyOn(db.prisma.playbackProgress, 'findFirst').mockResolvedValue({ id: 'progress', memberId: 'owner', catalogKind: kind === 'anime' ? 'ANIME' : 'SERIES', tmdbId: 21, season: 2, episode: 3, completed: false, hiddenFromContinueAt: null, positionSeconds: 450, durationSeconds: 1400, createdAt: new Date('2026-10-02T00:00:00Z'), updatedAt: new Date('2026-10-03T00:00:00Z') })
    try {
      expect(await memberData.progress('owner', { kind, id: 21 })).toMatchObject({ kind, id: 21, episode: 3, season: 2, positionSeconds: 450 })
      expect(read).toHaveBeenCalledWith({ where: { memberId: 'owner', catalogKind: kind === 'anime' ? 'ANIME' : 'SERIES', tmdbId: 21, episode: { gt: 0 } }, orderBy: [{ updatedAt: 'desc' }, { season: 'desc' }, { episode: 'desc' }] })
    } finally { read.mockRestore() }
  })
  it('keeps an exact episode lookup separate from the title resume lookup', async () => {
    const exact = vi.spyOn(db.prisma.playbackProgress, 'findUnique').mockResolvedValue(null)
    const latest = vi.spyOn(db.prisma.playbackProgress, 'findFirst')
    try {
      expect(await memberData.progress('owner', { kind: 'series', id: 21, season: 2, episode: 4 })).toBeNull()
      expect(exact).toHaveBeenCalledWith({ where: { memberId_catalogKind_tmdbId_season_episode: { memberId: 'owner', catalogKind: 'SERIES', tmdbId: 21, season: 2, episode: 4 } } })
      expect(latest).not.toHaveBeenCalled()
    } finally { exact.mockRestore(); latest.mockRestore() }
  })
})
