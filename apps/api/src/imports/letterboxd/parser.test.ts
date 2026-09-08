import { describe, expect, it } from 'vitest'

import { isSafeZipPath, normalizeLetterboxdTitle, parseLetterboxdUpload } from './parser.ts'

describe('Letterboxd import parser', () => {
  it('parses standalone CSV with BOM, aliases, quoted commas, and half-star ratings', async () => {
    const csv = '\uFEFFTitle,Year,WatchedDate,Rating,Rewatch,Tags,LetterboxdURI,tmdbID\n"Past Lives",2023,2024-02-03,4.5,Yes,"quiet, memory",https://letterboxd.com/film/past-lives/,666277\n'
    const result = await parseLetterboxdUpload('diary.csv', Buffer.from(csv))
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0]).toMatchObject({ kind: 'diary', normalizedTitle: 'past lives', payload: { rating: 9, rewatch: true, tags: ['quiet', 'memory'], watchedOn: '2024-02-03' }, tmdbId: 666277, year: 2023 })
  })

  it('handles Unicode normalization and rejects unsafe archive paths', () => {
    expect(normalizeLetterboxdTitle('  In the Mood—for Love! ')).toBe('in the mood for love')
    expect(isSafeZipPath('export/lists/favorites.csv')).toBe(true)
    expect(isSafeZipPath('../secrets.csv')).toBe(false)
    expect(isSafeZipPath('C:\\secrets.csv')).toBe(false)
  })

  it('streams an official-style ZIP without extracting files', async () => {
    const archive = Buffer.from('UEsDBBQAAAAIALueJ13PiyIaLwAAAC0AAAALAAAAd2F0Y2hlZC5jc3Z7v3t/SGZJTqpOZGpikU5JbkqSpwtXQGJxiYJPZllqsY6RgZGxjpmZmZG5OS8XAFBLAQIUABQAAAAIALueJ13PiyIaLwAAAC0AAAALAAAAAAAAAAAAAAAAAAAAAAB3YXRjaGVkLmNzdlBLBQYAAAAAAQABADkAAABYAAAAAAA=', 'base64')
    const result = await parseLetterboxdUpload('letterboxd.zip', archive)
    expect(result.rows).toMatchObject([{ kind: 'watched', title: 'Past Lives', tmdbId: 666277 }])
  })

  it('rejects unsupported and empty documents honestly', async () => {
    await expect(parseLetterboxdUpload('notes.txt', Buffer.from('hello'))).rejects.toMatchObject({ code: 'IMPORT_INVALID_ARCHIVE' })
    await expect(parseLetterboxdUpload('watched.csv', Buffer.from('Title,Year\n,2020\n'))).rejects.toMatchObject({ code: 'IMPORT_INVALID_ARCHIVE' })
  })

  it('deduplicates identical diary rows using a stable source key', async () => {
    const row = 'Past Lives,2023,2024-02-03,https://letterboxd.com/film/past-lives/'
    const result = await parseLetterboxdUpload('diary.csv', Buffer.from(`Title,Year,WatchedDate,LetterboxdURI\n${row}\n${row}\n`))
    expect(result.rows).toHaveLength(1)
    expect(result.skippedRows).toBe(1)
  })
})
