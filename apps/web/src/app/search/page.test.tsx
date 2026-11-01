import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AnimeTitleSummary } from '@consumit/contracts'
import { movieSummary } from '@/test/catalog-fixtures'

const mocks = vi.hoisted(() => ({
  getAnimeTrending: vi.fn(),
  getCatalogDiscovery: vi.fn(),
  getPeopleSearch: vi.fn(),
  getPeopleSuggestions: vi.fn(),
  searchAnime: vi.fn(),
  searchCatalog: vi.fn(),
}))

vi.mock('@/lib/anime-api', () => ({
  AnimeApiError: class AnimeApiError extends Error {
    status = 500
  },
  getAnimeTrending: mocks.getAnimeTrending,
  searchAnime: mocks.searchAnime,
}))

vi.mock('@/lib/catalog-api', () => ({
  getCatalogDiscovery: mocks.getCatalogDiscovery,
  searchCatalog: mocks.searchCatalog,
}))

vi.mock('@/lib/member-server', () => ({
  getPeopleSearch: mocks.getPeopleSearch,
  getPeopleSuggestions: mocks.getPeopleSuggestions,
}))

import SearchPage from './page'
import { PeopleSearchScreen } from './people-search-screen'
import { SearchScreen } from './search-screen'

const page = {
  items: [],
  meta: { fetchedAt: '2026-09-06T00:00:00.000Z', language: 'en-US', region: 'US', source: 'tmdb' as const, stale: false },
  page: 1,
  totalPages: 0,
  totalResults: 0,
}

const anime: AnimeTitleSummary = {
  anilistId: 21,
  kind: 'anime',
  titles: { preferred: 'One Piece', english: 'One Piece', romaji: 'One Piece', native: 'ワンピース' },
  format: 'TV',
  status: 'RELEASING',
  season: null,
  seasonYear: 1999,
  episodes: null,
  episodeDuration: 24,
  genres: ['Adventure'],
  coverImage: { url: null, color: null },
  bannerImage: null,
  averageScore: 87,
  popularity: 1000,
  description: 'Pirates.',
  nextAiringEpisode: null,
}

describe('search page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getAnimeTrending.mockResolvedValue({ items: [] })
    mocks.getCatalogDiscovery.mockResolvedValue(page)
    mocks.searchAnime.mockResolvedValue({ items: [] })
    mocks.searchCatalog.mockResolvedValue(page)
  })

  it.each(['movie', 'series'] as const)('loads %s results from the matching catalog scope', async (kind) => {
    await SearchPage({ searchParams: Promise.resolve({ q: 'dune', type: kind }) })

    expect(mocks.searchCatalog).toHaveBeenCalledWith('dune', kind)
    expect(mocks.searchAnime).not.toHaveBeenCalled()
  })

  it('uses the selected movie scope for short-query discovery', async () => {
    await SearchPage({ searchParams: Promise.resolve({ q: 'd', type: 'movie' }) })

    expect(mocks.getCatalogDiscovery).toHaveBeenCalledWith({ feed: 'trending', kind: 'movie' })
  })

  it('loads curator suggestions for a People no-match and preserves suggestion failure', async () => {
    mocks.getPeopleSearch.mockResolvedValue({ items: [], nextCursor: null })
    mocks.getPeopleSuggestions.mockRejectedValue(new Error('Suggestions unavailable'))

    const result = await SearchPage({ searchParams: Promise.resolve({ q: 'no-such-curator', type: 'people' }) })

    expect(mocks.getPeopleSearch).toHaveBeenCalledWith('no-such-curator')
    expect(mocks.getPeopleSuggestions).toHaveBeenCalledOnce()
    expect(result.type).toBe(PeopleSearchScreen)
    expect(result.props.initialPage).toEqual({ items: [], nextCursor: null })
    expect(result.props.suggestionsError).toBe(true)
  })

  it.each(['movie', 'series'] as const)('keeps the selected %s query and filter in Search when its catalog read fails', async (kind) => {
    mocks.searchCatalog.mockRejectedValue(new Error('TMDB unavailable'))

    const result = await SearchPage({ searchParams: Promise.resolve({ q: 'dune', type: kind }) })

    expect(result.type).toBe(SearchScreen)
    expect(result.props.initialKind).toBe(kind)
    expect(result.props.initialQuery).toBe('dune')
    expect(result.props.catalogUnavailable).toBe(true)
  })

  it('shows AniList results for Anime even when the TMDB catalog is unavailable', async () => {
    mocks.searchAnime.mockResolvedValue({ items: [anime] })
    mocks.searchCatalog.mockRejectedValue(new Error('TMDB unavailable'))

    const result = await SearchPage({ searchParams: Promise.resolve({ q: 'one piece', type: 'anime' }) })

    expect(mocks.searchAnime).toHaveBeenCalledWith('one piece')
    expect(mocks.searchCatalog).not.toHaveBeenCalled()
    expect(result.type).toBe(SearchScreen)
    expect(result.props.animeResults).toEqual([anime])
  })

  it('marks a failed AniList read as unavailable instead of an empty result', async () => {
    mocks.searchAnime.mockRejectedValue(new Error('AniList timeout'))

    const result = await SearchPage({ searchParams: Promise.resolve({ q: 'one piece', type: 'anime' }) })

    expect(result.type).toBe(SearchScreen)
    expect(result.props.animeUnavailable).toBe(true)
    expect(result.props.animeSignInRequired).toBe(false)
  })

  it('preserves AniList matches when the all-catalog read is unavailable', async () => {
    mocks.searchAnime.mockResolvedValue({ items: [anime] })
    mocks.searchCatalog.mockRejectedValue(new Error('TMDB unavailable'))

    const result = await SearchPage({ searchParams: Promise.resolve({ q: 'one piece' }) })

    expect(result.type).toBe(SearchScreen)
    expect(result.props.animeResults).toEqual([anime])
    expect(result.props.catalogUnavailable).toBe(true)
  })

  it('preserves catalog matches when the all-scope Anime read is unavailable', async () => {
    mocks.searchAnime.mockRejectedValue(new Error('AniList unavailable'))
    mocks.searchCatalog.mockResolvedValue({ ...page, items: [movieSummary] })

    const result = await SearchPage({ searchParams: Promise.resolve({ q: 'dune' }) })

    expect(result.type).toBe(SearchScreen)
    expect(result.props.page.items).toEqual([movieSummary])
    expect(result.props.animeUnavailable).toBe(true)
    expect(result.props.catalogUnavailable).toBe(false)
  })
})
