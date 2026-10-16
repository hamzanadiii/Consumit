import type { AnimeTitleSummary, CatalogTitleSummary } from '@consumit/contracts'
import { describe, expect, it } from 'vitest'

import { animeToCatalogSummary } from './anime-to-catalog.ts'

const summary: AnimeTitleSummary = {
  anilistId: 21,
  averageScore: 86,
  bannerImage: 'https://images.anilist.co/banner/21.jpg',
  coverImage: { color: '#0ea5e9', url: 'https://images.anilist.co/cover/21.jpg' },
  description: 'Two brothers search for the philosopher\'s stone.',
  episodeDuration: 24,
  episodes: 51,
  format: 'TV',
  genres: ['Action', 'Adventure'],
  kind: 'anime',
  nextAiringEpisode: null,
  popularity: 42_000,
  season: 'SPRING',
  seasonYear: 2003,
  status: 'FINISHED',
  titles: { english: 'Fullmetal Alchemist', native: '鋼の錬金術師', preferred: 'Fullmetal Alchemist', romaji: 'Hagane no Renkinjutsushi' },
}

describe('animeToCatalogSummary', () => {
  it('renders AniList fields in the catalog display shape', () => {
    expect(animeToCatalogSummary(summary)).toEqual<CatalogTitleSummary>({
      backdropUrl: 'https://images.anilist.co/banner/21.jpg',
      genreNames: ['Action', 'Adventure'],
      id: 21,
      kind: 'anime',
      logoUrl: null,
      originalTitle: '鋼の錬金術師',
      overview: 'Two brothers search for the philosopher\'s stone.',
      popularity: 42_000,
      posterUrl: 'https://images.anilist.co/cover/21.jpg',
      releaseDate: null,
      title: 'Fullmetal Alchemist',
      tmdbRating: 8.6,
      tmdbVoteCount: 42_000,
      year: 2003,
    })
  })

  it('keeps TMDB-only fields honestly empty instead of inventing them', () => {
    const sparse = animeToCatalogSummary({
      ...summary,
      averageScore: null,
      bannerImage: null,
      coverImage: { color: null, url: null },
      seasonYear: null,
      titles: { english: null, native: null, preferred: 'Preferred', romaji: null },
    })

    expect(sparse).toMatchObject({
      backdropUrl: null,
      logoUrl: null,
      originalTitle: 'Preferred',
      posterUrl: null,
      releaseDate: null,
      tmdbRating: null,
      year: null,
    })
  })
})
