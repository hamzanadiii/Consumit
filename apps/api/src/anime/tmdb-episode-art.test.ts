import type { CatalogSeasonResponse, CatalogTitleResponse } from '@consumit/contracts'
import { describe, expect, it, vi } from 'vitest'

import type { Catalog } from '../catalog/catalog.ts'
import { createTmdbEpisodeArt, matchesAnimeTitle, matchesTmdbTitle, normalizeAnimeTitle } from './tmdb-episode-art.ts'

const titles = { english: 'Cowboy Bebop', romaji: 'Cowboy Bebop', native: 'カウボーイビバップ' }

function seriesDetail(seasons: { number: number; episodeCount: number }[]): CatalogTitleResponse {
  return {
    item: {
      backdropUrl: null,
      cast: [],
      certification: null,
      contentRating: null,
      countries: ['Japan'],
      creators: [],
      episodeRuntimeMinutes: 24,
      genreNames: ['Animation'],
      heroBackdropUrl: null,
      homepageUrl: null,
      id: 34969,
      kind: 'series',
      languages: ['Japanese'],
      logoUrl: null,
      originalTitle: 'カウボーイビバップ',
      overview: '',
      popularity: 10,
      posterUrl: null,
      recommendations: [],
      releaseDate: '1998-04-03',
      seasons: seasons.map((season) => ({ airDate: null, episodeCount: season.episodeCount, name: `Season ${season.number}`, number: season.number, posterUrl: null })),
      status: 'Ended',
      tagline: null,
      title: 'Cowboy Bebop',
      tmdbRating: 8.5,
      tmdbVoteCount: 100,
      year: 1998,
    },
    meta: { fetchedAt: '2026-09-06T00:00:00.000Z', language: 'en-US', region: 'US', source: 'tmdb', stale: false },
  }
}

function seasonResponse(episodes: { n: number; title: string }[]): CatalogSeasonResponse {
  return {
    item: {
      episodes: episodes.map(({ n, title }) => ({
        airDate: '1998-04-03',
        episodeNumber: n,
        id: n,
        overview: `${title} overview`,
        runtimeMinutes: 24,
        seasonNumber: 1,
        stillUrl: `https://image.tmdb.org/t/p/w780/ep${n}.jpg`,
        title,
      })),
      name: 'Season 1',
      overview: '',
      posterUrl: null,
      seasonNumber: 1,
      seriesId: 34969,
    },
    meta: { fetchedAt: '2026-09-06T00:00:00.000Z', language: 'en-US', region: 'US', source: 'tmdb', stale: false },
  }
}

function catalogStub(): Catalog & { calls: string[] } {
  const calls: string[] = []
  const catalog = {
    calls,
    batch: vi.fn(async () => { throw new Error('unused') }),
    discover: vi.fn(async () => { throw new Error('unused') }),
    movieByExternalId: vi.fn(async () => null),
    search: vi.fn(async ({ query }: { query: string }) => {
      calls.push(`search:${query}`)
      return {
        items: [{
          backdropUrl: null, genreNames: [], id: 34969, kind: 'series', logoUrl: null,
          originalTitle: 'カウボーイビバップ', overview: '', popularity: 10, posterUrl: null,
          releaseDate: '1998-04-03', title: 'Cowboy Bebop', tmdbRating: 8.5, tmdbVoteCount: 100, year: 1998,
        }],
        meta: { fetchedAt: '2026-09-06T00:00:00.000Z', language: 'en-US', region: 'US', source: 'tmdb', stale: false },
        page: 1, totalPages: 1, totalResults: 1,
      }
    }),
    season: vi.fn(async (seriesId: number, seasonNumber: number) => {
      calls.push(`season:${seriesId}:${seasonNumber}`)
      return seasonResponse([{ n: 1, title: 'S2E1' }, { n: 2, title: 'S2E2' }, { n: 3, title: 'S2E3' }])
    }),
    title: vi.fn(async () => seriesDetail([{ number: 1, episodeCount: 12 }, { number: 2, episodeCount: 14 }])),
  } as unknown as Catalog & { calls: string[] }
  return catalog
}

describe('tmdb title matching', () => {
  it('normalizes punctuation and case', () => {
    expect(normalizeAnimeTitle('Cowboy Bebop: The Movie')).toBe('cowboybebopthemovie')
    expect(normalizeAnimeTitle('カウボーイ ビバップ')).toBe('')
  })

  it('requires title equality plus a year within one', () => {
    const candidate = { name: 'Cowboy Bebop', originalName: 'カウボーイビバップ', firstAirDate: '1998-04-03' }
    expect(matchesTmdbTitle(titles, 1998, candidate)).toBe(true)
    expect(matchesTmdbTitle(titles, 1999, candidate)).toBe(true)
    expect(matchesTmdbTitle(titles, 2005, candidate)).toBe(false)
    expect(matchesTmdbTitle(titles, 1998, { ...candidate, name: 'Cowboy Bebop: Remake', originalName: 'X' })).toBe(false)
    expect(matchesTmdbTitle({ english: null, romaji: null, native: null }, 1998, candidate)).toBe(false)
  })
})

describe('anime reverse matching', () => {
  const candidate = (overrides = {}) => ({
    titles: { english: 'Cowboy Bebop', romaji: 'Cowboy Bebop', native: 'カウボーイビバップ' },
    seasonYear: 1998,
    ...overrides,
  })
  it('matches exact titles within a year', () => {
    expect(matchesAnimeTitle({ title: 'Cowboy Bebop', originalTitle: null }, 1998, candidate())).toBe(true)
    expect(matchesAnimeTitle({ title: 'Cowboy Bebop', originalTitle: null }, 1999, candidate())).toBe(true)
    expect(matchesAnimeTitle({ title: 'Cowboy Bebop', originalTitle: null }, 2010, candidate())).toBe(false)
    expect(matchesAnimeTitle({ title: 'Cowboy Bebop: The Remake', originalTitle: null }, 1998, candidate())).toBe(false)
    expect(matchesAnimeTitle({ title: '', originalTitle: null }, 1998, candidate())).toBe(false)
  })

  it('leaves non-latin scripts unmatched rather than guessing', () => {
    expect(matchesAnimeTitle(
      { title: 'Unrelated', originalTitle: 'カウボーイビバップ' },
      null,
      candidate({ titles: { english: null, romaji: null, native: 'カウボーイビバップ' } }),
    )).toBe(false)
  })
})

describe('tmdb episode walk', () => {
  it('maps absolute episodes across split seasons', async () => {
    const catalog = catalogStub()
    const art = createTmdbEpisodeArt(catalog)
    // Episode 15 of a 12+14 split lands on S2E3.
    const found = await art.episodeByTitle(1, titles, 1998, 15)
    expect(found).toMatchObject({ tmdbId: 34969, season: 2, episode: 3, title: 'S2E3', stillUrl: 'https://image.tmdb.org/t/p/w780/ep3.jpg' })
    expect(catalog.calls.filter((call) => call.startsWith('search:'))).toHaveLength(1)
    // Mapping is cached: a second episode reuses it without searching.
    await art.episodeByTitle(1, titles, 1998, 2)
    expect(catalog.calls.filter((call) => call.startsWith('search:'))).toHaveLength(1)
    expect(catalog.calls).toContain('season:34969:2')
  })

  it('returns null past the absolute run and for bad ids', async () => {
    const catalog = catalogStub()
    const art = createTmdbEpisodeArt(catalog)
    expect(await art.episodeByTitle(1, titles, 1998, 27)).toBeNull()
    expect(await art.episodeByTitle(0, titles, 1998, 1)).toBeNull()
    expect(await art.episodeByTitle(1, titles, 1998, 0)).toBeNull()
  })

  it('returns null when nothing matches confidently', async () => {
    const catalog = catalogStub()
    catalog.search = vi.fn(async () => ({
      items: [], meta: { fetchedAt: '2026-09-06T00:00:00.000Z', language: 'en-US', region: 'US', source: 'tmdb', stale: false },
      page: 1, totalPages: 0, totalResults: 0,
    })) as never
    expect(await createTmdbEpisodeArt(catalog).episodeByTitle(1, titles, 1998, 1)).toBeNull()
  })
})
