import { describe, expect, it } from 'vitest'
import { releaseRefSchema, type ReleaseEpisode } from '@consumit/contracts'
import { episodeKey, playbackPassed, recentlyReleased, WEEK_MS } from './policy.ts'
import { createReleaseCatalog } from './catalog.ts'
import { createFakeCatalog } from '../catalog/fake-catalog.ts'
import { createAnilistCatalog } from '../catalog/anilist/adapter.ts'

const now = new Date('2026-10-09T12:00:00Z')
const valid: ReleaseEpisode = { ref: { kind: 'series', id: 1, season: 1, episode: 3 }, title: 'Example', episodeTitle: null, imageUrl: null, releasedAt: now.toISOString(), datePrecision: 'instant', checkedAt: null }
describe('episode release rules', () => {
  it('uses inclusive UTC week boundaries and excludes future/unknown dates', () => {
    expect(recentlyReleased(new Date(now.getTime() - WEEK_MS), now)).toBe(true)
    expect(recentlyReleased(new Date(now.getTime() - WEEK_MS - 1), now)).toBe(false)
    expect(recentlyReleased(now, now)).toBe(true)
    expect(recentlyReleased(new Date(now.getTime() + 1), now)).toBe(false)
    expect(recentlyReleased(new Date('invalid'), now)).toBe(false)
  })
  it('keeps season, episode and catalog identities independent and excludes specials/movies', () => {
    expect(new Set([episodeKey('series', 1, 1, 1), episodeKey('series', 1, 2, 1), episodeKey('anime', 1, 0, 1)]).size).toBe(3)
    expect(releaseRefSchema.safeParse({ kind: 'movie', id: 1, season: 0, episode: 1 }).success).toBe(false)
    expect(releaseRefSchema.safeParse({ kind: 'series', id: 1, season: 0, episode: 1 }).success).toBe(false)
    expect(releaseRefSchema.safeParse({ kind: 'anime', id: 1, season: 1, episode: 1 }).success).toBe(false)
  })
  it('requires decoded frames, advancing playback and resumed seeking', () => {
    const pass = { decodedFrames: 180, advancedSeconds: 5, seeked: true, resumedSeconds: 2 }
    expect(playbackPassed(pass)).toBe(true)
    for (const evidence of [{ ...pass, decodedFrames: 0 }, { ...pass, advancedSeconds: 0 }, { ...pass, seeked: false }, { ...pass, resumedSeconds: 0 }, { ...pass, failure: 'media' as const }]) expect(playbackPassed(evidence)).toBe(false)
  })
  it('validates identity at the adapter seam and filters eligibility', async () => {
    const catalog = { ...createFakeCatalog(), recentEpisodes: async () => [valid, { ...valid, releasedAt: new Date(now.getTime() + 1).toISOString() }] }
    const releases = createReleaseCatalog(catalog, createAnilistCatalog())
    expect(await releases('series', 1, now)).toEqual([valid])
    await expect(releases('series', 2, now)).rejects.toThrow('identity')
  })
})
