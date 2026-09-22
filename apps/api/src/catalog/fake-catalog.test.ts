import type { CatalogMovieDetail } from '@consumit/contracts'
import { describe, expect, it } from 'vitest'

import { createFakeCatalog } from './fake-catalog.ts'

const movie: CatalogMovieDetail = {
  backdropUrl: null, cast: [], certification: null, countries: [], creators: [], genreNames: ['Drama'], heroBackdropUrl: null, homepageUrl: null,
  id: 550, kind: 'movie', languages: [], logoUrl: null, originalTitle: 'Fight Club', overview: '', popularity: 1, posterUrl: null,
  recommendations: [], releaseDate: '1999-10-15', runtimeMinutes: 139, status: 'Released', tagline: null,
  title: 'Fight Club', tmdbRating: 8.4, tmdbVoteCount: 30_000, year: 1999,
}

describe('fake catalog adapter', () => {
  it('implements the same discovery, search, batch, and detail interface without network access', async () => {
    const catalog = createFakeCatalog({ titles: [movie] })
    await expect(catalog.discover({ feed: 'popular', kind: 'movie', page: 1 })).resolves.toMatchObject({ items: [{ id: 550 }] })
    await expect(catalog.search({ kind: 'all', page: 1, query: 'fight' })).resolves.toMatchObject({ totalResults: 1 })
    await expect(catalog.batch([{ id: 550, kind: 'movie' }, { id: 1, kind: 'movie' }])).resolves.toMatchObject({ missing: [{ id: 1 }] })
    await expect(catalog.title('movie', 550)).resolves.toMatchObject({ item: { title: 'Fight Club' } })
  })
})
