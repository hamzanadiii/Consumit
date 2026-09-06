import { describe, expect, it } from 'vitest'

import {
  catalogTitleSummarySchema,
  titleHref,
  watchHref,
} from './index'

describe('catalog contracts', () => {
  it('builds canonical title and watch destinations', () => {
    expect(titleHref({ id: 550, kind: 'movie' })).toBe('/title/550')
    expect(titleHref({ id: 1399, kind: 'series' })).toBe('/series/1399')
    expect(watchHref({ id: 550, kind: 'movie' })).toBe('/watch/movie/550')
    expect(watchHref({ id: 1399, kind: 'series' }, { episode: 2, season: 3 })).toBe(
      '/watch/series/1399?season=3&episode=2',
    )
  })

  it('rejects non-allowlisted artwork URLs', () => {
    const result = catalogTitleSummarySchema.safeParse({
      backdropUrl: null,
      genreNames: [],
      id: 550,
      kind: 'movie',
      originalTitle: 'Fight Club',
      overview: '',
      popularity: 1,
      posterUrl: 'not-a-url',
      releaseDate: '1999-10-15',
      title: 'Fight Club',
      tmdbRating: 8.4,
      tmdbVoteCount: 10,
      year: 1999,
    })

    expect(result.success).toBe(false)
  })
})
