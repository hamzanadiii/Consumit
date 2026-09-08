import type { CatalogMovieDetail } from '@consumit/contracts'
import { describe, expect, it } from 'vitest'

import { createFakeCatalog } from '../../catalog/fake-catalog.ts'
import { createLetterboxdImporter } from './importer.ts'
import { createMemoryLetterboxdImportRepository } from './memory-repository.ts'

const movie = (id: number, title: string, year: number): CatalogMovieDetail => ({
  backdropUrl: null, cast: [], certification: null, countries: [], creators: [], genreNames: [], homepageUrl: null,
  id, kind: 'movie', languages: [], originalTitle: title, overview: '', popularity: 1, posterUrl: null,
  recommendations: [], releaseDate: `${year}-01-01`, runtimeMinutes: 120, status: 'Released', tagline: null,
  title, tmdbRating: null, tmdbVoteCount: 0, year,
})

describe('Letterboxd importer', () => {
  it('stages before matching and classifies exact and title/year matches', async () => {
    const repository = createMemoryLetterboxdImportRepository()
    const importer = createLetterboxdImporter({ catalog: createFakeCatalog({ titles: [movie(666277, 'Past Lives', 2023), movie(843, 'In the Mood for Love', 2000)] }), repository })
    const csv = 'Title,Year,tmdbID\nPast Lives,2023,666277\nIn the Mood for Love,2000,\nUnknown Film,1991,\n'
    const staged = await importer.upload('member-1', 'watched.csv', Buffer.from(csv))
    expect(staged.status).toBe('uploaded')
    expect((await importer.detail('member-1', staged.id)).items.every((item) => item.status === 'unmatched')).toBe(true)

    expect(await importer.processNext('worker-1')).toBe(true)
    const matched = await importer.detail('member-1', staged.id)
    expect(matched.items.map((item) => item.status)).toEqual(['exact', 'confident', 'unmatched'])
    expect(matched.import.status).toBe('needs_review')
  })

  it('requires uncertain rows to be corrected or skipped before idempotent confirmation', async () => {
    const repository = createMemoryLetterboxdImportRepository()
    const importer = createLetterboxdImporter({ catalog: createFakeCatalog({ titles: [movie(843, 'In the Mood for Love', 2000)] }), repository })
    const staged = await importer.upload('member-1', 'watched.csv', Buffer.from('Title,Year\nMood for Love,2000\n'))
    await importer.processNext('worker-1')
    const detail = await importer.detail('member-1', staged.id)
    await expect(importer.confirm('member-1', staged.id)).rejects.toMatchObject({ code: 'IMPORT_NOT_READY' })
    await importer.select('member-1', staged.id, detail.items[0]!.id, { tmdbId: 843 })
    await importer.confirm('member-1', staged.id)
    await expect(importer.confirm('member-1', staged.id)).resolves.toBeUndefined()
    expect((await importer.detail('member-1', staged.id)).import.status).toBe('confirmed')
  })

  it('preserves parser skips in upload, processing, detail, and history progress', async () => {
    const repository = createMemoryLetterboxdImportRepository()
    const importer = createLetterboxdImporter({ catalog: createFakeCatalog({ titles: [movie(666277, 'Past Lives', 2023)] }), repository })
    const staged = await importer.upload('member-1', 'watched.csv', Buffer.from('Title,Year,tmdbID\nPast Lives,2023,666277\nPast Lives,2023,666277\n'))

    expect(staged.progress).toEqual({ confident: 0, exact: 0, needsReview: 0, skipped: 1, total: 2, unmatched: 1 })
    await importer.processNext('worker-1')
    expect((await importer.detail('member-1', staged.id)).import.progress).toEqual({ confident: 0, exact: 1, needsReview: 0, skipped: 1, total: 2, unmatched: 0 })
    expect((await importer.history('member-1'))[0]?.progress.skipped).toBe(1)
  })

  it('prevents a stale worker from saving or failing a reclaimed batch', async () => {
    const repository = createMemoryLetterboxdImportRepository()
    const importer = createLetterboxdImporter({ catalog: createFakeCatalog({ titles: [movie(666277, 'Past Lives', 2023)] }), repository })
    const staged = await importer.upload('member-1', 'watched.csv', Buffer.from('Title,Year,tmdbID\nPast Lives,2023,666277\n'))
    expect(await repository.claimNext('worker-a', new Date(0))).not.toBeNull()
    expect(await repository.claimNext('worker-b', new Date('2999-01-01T00:00:00.000Z'))).not.toBeNull()

    expect(await repository.saveMatches(staged.id, 'worker-a', [])).toBe(false)
    expect(await repository.fail(staged.id, 'worker-a', 'stale failure')).toBe(false)
    expect((await importer.detail('member-1', staged.id)).import.status).toBe('processing')
  })
})
