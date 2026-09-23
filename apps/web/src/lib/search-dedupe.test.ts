import { describe, expect, it } from 'vitest'
import type { AnimeTitleSummary, CatalogPage } from '@consumit/contracts'

import { dedupeTwinSeries } from './search-dedupe'

function series(id: number, title: string, year: number | null, originalTitle?: string): CatalogPage['items'][number] {
  return {
    kind: 'series', id, title, year, originalTitle: originalTitle ?? title,
    backdropUrl: null, genreNames: [], logoUrl: null, overview: '', popularity: 0,
    posterUrl: null, releaseDate: null, tmdbRating: null, tmdbVoteCount: 0,
  }
}

function movie(id: number, title: string, year: number | null): CatalogPage['items'][number] {
  return { ...series(id, title, year), kind: 'movie' }
}

function anime(anilistId: number, preferred: string, seasonYear: number | null, english: string | null = null): AnimeTitleSummary {
  return {
    anilistId, kind: 'anime', titles: { preferred, english, romaji: null, native: null },
    format: 'TV', status: 'FINISHED', season: null, seasonYear, episodes: 24,
    episodeDuration: 24, genres: [], coverImage: { url: null, color: null },
    bannerImage: null, averageScore: null, popularity: 0, description: '',
    nextAiringEpisode: null,
  }
}

describe('twin-page dedupe', () => {
  it('drops the TMDB series twin when title and year match anime', () => {
    const items = dedupeTwinSeries(
      [series(1, 'Naruto Shippuden', 2007), series(2, 'Breaking Bad', 2008)],
      [anime(1735, 'Naruto Shippuden', 2007)],
    )
    expect(items.map((item) => item.id)).toEqual([2])
  })
  it('matches english and original titles, never movies or year-less records', () => {
    const items = dedupeTwinSeries(
      [
        movie(10, 'Naruto Shippuden', 2007),
        series(11, 'Wrong Year', null),
        series(12, 'Attack on Titan', 2013, 'Shingeki no Kyojin'),
      ],
      [anime(16498, 'Shingeki no Kyojin', 2013, 'Attack on Titan')],
    )
    expect(items.map((item) => item.id).sort()).toEqual([10, 11])
  })
  it('keeps everything when years disagree or anime has no year', () => {
    const items = dedupeTwinSeries(
      [series(1, 'Naruto', 2002)],
      [anime(20, 'Naruto', null), anime(21, 'One Piece', 1999)],
    )
    expect(items.map((item) => item.id)).toEqual([1])
  })
})
