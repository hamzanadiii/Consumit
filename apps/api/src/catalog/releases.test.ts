import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTmdbCatalog } from './tmdb-catalog.ts'
import { createAnilistCatalog } from './anilist/adapter.ts'
import type { AnilistClient } from './anilist/client.ts'
import { createReleaseCatalog } from '../releases/catalog.ts'
import { createFakeCatalog } from './fake-catalog.ts'

const now = new Date('2026-10-09T12:00:00Z'), since = new Date('2026-10-02T12:00:00Z')
afterEach(() => vi.useRealTimers())
const json = (data: unknown) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } })
describe('recent release adapter capabilities', () => {
  it('preserves TMDB calendar precision and excludes specials, future and unknown dates', async () => {
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now)
    const paths: string[] = []
    const catalog = createTmdbCatalog({ token: 'fixture', fetch: async input => {
      const path = new URL(String(input)).pathname; paths.push(path)
      if (path === '/3/configuration') return json({ images: { secure_base_url: 'https://image.tmdb.org/t/p/', backdrop_sizes: ['original'], logo_sizes: ['original'], poster_sizes: ['original'], profile_sizes: ['original'], still_sizes: ['original'] } })
      if (path === '/3/tv/1399') return json({ id: 1399, name: 'Fixture', backdrop_path: null, seasons: [{ season_number: 0, air_date: '2026-10-08' }, { season_number: 1, air_date: '2026-01-01' }, { season_number: 2, air_date: '2027-01-01' }] })
      return json({ name: 'Season 1', season_number: 1, poster_path: null, episodes: ['2026-10-02', '2026-10-03', '2026-10-09', '2026-10-10', null].map((air_date, index) => ({ id: index + 1, season_number: 1, episode_number: index + 1, name: 'Episode', air_date, still_path: null })) })
    } })
    const episodes = await catalog.recentEpisodes!(1399, since)
    expect(episodes.map(value => value.ref.episode)).toEqual([2, 3])
    expect(episodes[0]).toMatchObject({ releasedAt: '2026-10-03T00:00:00.000Z', datePrecision: 'date', ref: { kind: 'series', id: 1399, season: 1, episode: 2 } })
    expect(paths).not.toContain('/3/tv/1399/season/0'); expect(paths).not.toContain('/3/tv/1399/season/2')
  })
  it('pages historical AniList schedules and retains canonical episode identities', async () => {
    const seen: Record<string, unknown>[] = []
    const client = { query: async (query: string, variables: Record<string, unknown>) => {
      if (!query.includes('airingSchedules')) return { Media: { id: 21, title: { english: 'Fixture', romaji: 'Fixture', native: null }, coverImage: { large: null }, isAdult: false } }
      seen.push(variables)
      return { Page: { pageInfo: { hasNextPage: variables.page === 1 }, airingSchedules: variables.page === 1
        ? [{ mediaId: 21, episode: 1001, airingAt: now.getTime() / 1000 }, { mediaId: 22, episode: 1, airingAt: now.getTime() / 1000 }]
        : [{ mediaId: 21, episode: 1000, airingAt: since.getTime() / 1000 }, { mediaId: 21, episode: 1002, airingAt: now.getTime() / 1000 + 1 }] } }
    } } as unknown as AnilistClient
    const releases = createReleaseCatalog(createFakeCatalog(), createAnilistCatalog(client))
    const episodes = await releases('anime', 21, now)
    expect(episodes.map(value => value.ref)).toEqual([{ kind: 'anime', id: 21, season: 0, episode: 1001 }, { kind: 'anime', id: 21, season: 0, episode: 1000 }])
    expect(episodes[1]).toMatchObject({ releasedAt: since.toISOString(), datePrecision: 'instant' })
    expect(seen).toHaveLength(2); expect(seen[0]).toMatchObject({ since: since.getTime() / 1000 - 1, until: now.getTime() / 1000 + 1, page: 1 })
  })
})
