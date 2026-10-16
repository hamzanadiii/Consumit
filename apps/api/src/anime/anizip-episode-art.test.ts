import { describe, expect, it, vi } from 'vitest'
import { StaleCache } from '../catalog/stale-cache.ts'
import { createAnizipEpisodeArt } from './anizip-episode-art.ts'

function payload() {
  return {
    mappings: { anilist_id: 142853 },
    episodes: {
      '1': { episode: '1', seasonNumber: 2, episodeNumber: 1, absoluteEpisodeNumber: 25, title: { en: 'It Is What It Is' }, overview: 'Back in the present.', image: 'https://artworks.thetvdb.com/banners/episode1.jpg', airDate: '2023-01-08' },
      '2': { episode: '2', title: { en: 'Gotta Go' }, image: 'https://artworks.thetvdb.com/banners/episode2.jpg', airDate: '2023-01-15' },
      S1: { episode: 'S1', title: { en: 'Special' } },
    },
  }
}

describe('canonical anime episode art', () => {
  it('keeps season-local episode identity and coalesces a visible batch into one mapping read', async () => {
    const mappingsFor = vi.fn(async () => payload())
    const art = createAnizipEpisodeArt({ mappingsFor })
    const [first, second] = await Promise.all([art.episodeByAnilistId(142853, 1), art.episodeByAnilistId(142853, 2)])
    expect(first).toEqual({ title: 'It Is What It Is', synopsis: 'Back in the present.', stillUrl: 'https://artworks.thetvdb.com/banners/episode1.jpg', airDate: '2023-01-08' })
    expect(second?.title).toBe('Gotta Go')
    expect(mappingsFor).toHaveBeenCalledTimes(1)
    expect(await art.episodeByAnilistId(142853, 25)).toBeNull()
    expect(await art.episodeByAnilistId(142853, 99)).toBeNull()
    expect(mappingsFor).toHaveBeenCalledTimes(1)
  })

  it('rejects a different anime identity and mismatched episode numbers', async () => {
    const wrongTitle = createAnizipEpisodeArt({ mappingsFor: async () => ({ ...payload(), mappings: { anilist_id: 120120 } }) })
    expect(await wrongTitle.episodeByAnilistId(142853, 1)).toBeNull()
    const wrongEpisode = createAnizipEpisodeArt({ mappingsFor: async () => ({ ...payload(), episodes: { '1': { ...payload().episodes['1'], episode: '25' } } }) })
    expect(await wrongEpisode.episodeByAnilistId(142853, 1)).toBeNull()
  })

  it('retains real titles while rejecting unsafe images and invalid dates', async () => {
    const art = createAnizipEpisodeArt({ mappingsFor: async () => ({ ...payload(), episodes: { '1': { ...payload().episodes['1'], image: 'https://artworks.thetvdb.com.evil.test/a.jpg', airDate: '2023-02-30' } } }) })
    expect(await art.episodeByAnilistId(142853, 1)).toMatchObject({ title: 'It Is What It Is', stillUrl: null, airDate: null })
  })

  it('preserves partial English metadata and does not substitute specials', async () => {
    const art = createAnizipEpisodeArt({ mappingsFor: async () => ({ ...payload(), episodes: { '1': { episode: 1, title: { 'x-jat': 'Episode title' }, image: null }, S2: payload().episodes.S1 } }) })
    expect(await art.episodeByAnilistId(142853, 1)).toEqual({ title: 'Episode title', synopsis: null, stillUrl: null, airDate: null })
    expect(await art.episodeByAnilistId(142853, 2)).toBeNull()
  })

  it('recovers after an unavailable mapping and rejects invalid input before fetching', async () => {
    const mappingsFor = vi.fn().mockResolvedValueOnce(null).mockResolvedValue(payload())
    const art = createAnizipEpisodeArt({ mappingsFor })
    expect(await art.episodeByAnilistId(0, 1)).toBeNull()
    expect(await art.episodeByAnilistId(142853, 0)).toBeNull()
    expect(await art.episodeByAnilistId(142853, 10001)).toBeNull()
    expect(mappingsFor).not.toHaveBeenCalled()
    expect(await art.episodeByAnilistId(142853, 1)).toBeNull()
    expect((await art.episodeByAnilistId(142853, 1))?.title).toBe('It Is What It Is')
  })

  it('serves the last validated art during an upstream outage', async () => {
    let now = 0
    const mappingsFor = vi.fn().mockResolvedValueOnce(payload()).mockResolvedValue(null)
    const art = createAnizipEpisodeArt({ mappingsFor }, new StaleCache(() => now))
    const first = await art.episodeByAnilistId(142853, 1)
    now = 7 * 3600_000
    expect(await art.episodeByAnilistId(142853, 1)).toEqual(first)
    expect(mappingsFor).toHaveBeenCalledTimes(2)
  })
})
