import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'

import { parse } from 'csv-parse'
import * as yauzl from 'yauzl'

import { LetterboxdImportError } from './errors.ts'
import type { LetterboxdParseResult, LetterboxdProfileDraft, LetterboxdStagedPayload, LetterboxdStagedRow } from './types.ts'

export const LETTERBOXD_UPLOAD_LIMIT = 25 * 1024 * 1024
export const LETTERBOXD_EXPANDED_LIMIT = 100 * 1024 * 1024
export const LETTERBOXD_ENTRY_LIMIT = 2_000
export const LETTERBOXD_ROW_LIMIT = 250_000
const CSV_RECORD_LIMIT = 1024 * 1024

type CsvRow = Record<string, string>

function invalid(message: string, cause?: unknown): LetterboxdImportError {
  return new LetterboxdImportError('IMPORT_INVALID_ARCHIVE', message, { cause })
}

function limited(message: string): LetterboxdImportError {
  return new LetterboxdImportError('IMPORT_LIMIT_EXCEEDED', message)
}

export function isSafeZipPath(filename: string): boolean {
  const normalized = filename.replaceAll('\\', '/')
  if (normalized.startsWith('/') || /^[a-z]:/i.test(normalized)) return false
  return normalized.split('/').every((segment) => segment !== '..' && segment !== '.')
}

export function normalizeLetterboxdTitle(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase().replace(/[\p{P}\p{S}]+/gu, ' ').replace(/\s+/g, ' ').trim()
}

function normalizedHeader(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function valueOf(row: CsvRow, ...names: string[]): string {
  const wanted = new Set(names.map(normalizedHeader))
  for (const [key, value] of Object.entries(row)) {
    if (wanted.has(normalizedHeader(key))) return String(value ?? '').trim()
  }
  return ''
}

function numberOf(value: string): number | null {
  if (!value) return null
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : null
}

function booleanOf(value: string): boolean {
  return ['1', 'true', 'yes', 'y'].includes(value.trim().toLowerCase())
}

function ratingOf(row: CsvRow): number | null {
  const tenPoint = numberOf(valueOf(row, 'Rating10', 'Rating 10'))
  if (tenPoint !== null) return Math.max(1, Math.min(10, tenPoint))
  const stars = Number(valueOf(row, 'Rating'))
  return Number.isFinite(stars) && stars > 0 ? Math.max(1, Math.min(10, Math.round(stars * 2))) : null
}

function tagsOf(row: CsvRow): string[] {
  const raw = valueOf(row, 'Tags')
  return raw ? raw.split(',').map((tag) => tag.trim()).filter(Boolean) : []
}

function csvKind(filename: string, headers: string[]): LetterboxdStagedRow['kind'] | null {
  const path = filename.replaceAll('\\', '/').toLowerCase()
  const base = path.split('/').at(-1) ?? path
  if (path.split('/').includes('deleted') || base.includes('likes')) return null
  if (base === 'profile.csv') return 'profile'
  if (base.includes('watched')) return 'watched'
  if (base.includes('diary')) return 'diary'
  if (base.includes('ratings')) return 'rating'
  if (base.includes('reviews')) return 'review'
  if (base.includes('watchlist')) return 'watchlist'
  if (base.includes('favorite')) return 'favorite'
  if (path.includes('/lists/') || path.startsWith('lists/')) return 'list_item'
  const normalized = new Set(headers.map(normalizedHeader))
  if (normalized.has('watcheddate') || normalized.has('rewatch')) return 'diary'
  if (normalized.has('review')) return 'review'
  if (normalized.has('rating') || normalized.has('rating10')) return 'rating'
  if (normalized.has('name') || normalized.has('title')) return 'watched'
  return null
}

function sourceKey(kind: LetterboxdStagedRow['kind'], titleIdentity: string, payload: LetterboxdStagedPayload): string {
  const stable = [kind, titleIdentity, payload.watchedOn ?? '', payload.listName ?? '', payload.position ?? ''].join('|')
  return createHash('sha256').update(stable).digest('hex')
}

function profileFromRow(row: CsvRow): LetterboxdProfileDraft {
  return {
    bio: valueOf(row, 'Bio', 'Biography') || null,
    displayName: valueOf(row, 'Name', 'Display Name') || null,
    location: valueOf(row, 'Location') || null,
  }
}

function stagedRow(filename: string, kind: LetterboxdStagedRow['kind'], row: CsvRow, rowNumber: number): LetterboxdStagedRow | null {
  const title = valueOf(row, 'Name', 'Title') || null
  if (kind !== 'profile' && !title) return null
  const year = numberOf(valueOf(row, 'Year', 'Release Year'))
  const tmdbId = numberOf(valueOf(row, 'tmdbID', 'TMDB ID'))
  const rawImdbId = valueOf(row, 'imdbID', 'IMDB ID')
  const imdbId = /^tt\d+$/i.test(rawImdbId) ? rawImdbId.toLowerCase() : null
  const uri = valueOf(row, 'Letterboxd URI', 'LetterboxdURI')
  const path = filename.replaceAll('\\', '/')
  const listName = kind === 'list_item'
    ? valueOf(row, 'List Name') || (path.split('/').at(-1) ?? '').replace(/\.csv$/i, '')
    : null
  const payload: LetterboxdStagedPayload = {
    listDescription: valueOf(row, 'Description') || null,
    listName,
    position: numberOf(valueOf(row, 'Position', 'Rank')),
    rating: ratingOf(row),
    review: valueOf(row, 'Review') || null,
    rewatch: booleanOf(valueOf(row, 'Rewatch')),
    tags: tagsOf(row),
    watchedOn: valueOf(row, 'Watched Date', 'WatchedDate', 'Date') || null,
  }
  const identity = uri || (tmdbId ? `tmdb:${tmdbId}` : '') || imdbId || `${normalizeLetterboxdTitle(title ?? 'profile')}:${year ?? ''}`
  return {
    imdbId,
    kind,
    matchStatus: kind === 'profile' ? 'skipped' : 'unmatched',
    normalizedTitle: title ? normalizeLetterboxdTitle(title) : null,
    payload,
    rowNumber,
    sourceFile: filename,
    sourceKey: kind === 'profile' ? 'profile' : sourceKey(kind, identity, payload),
    title,
    tmdbId,
    year,
  }
}

async function parseCsvStream(stream: NodeJS.ReadableStream, filename: string, result: LetterboxdParseResult): Promise<void> {
  const parser = parse({ bom: true, columns: true, max_record_size: CSV_RECORD_LIMIT, relax_column_count: true, skip_empty_lines: true, trim: true })
  stream.pipe(parser)
  let rowNumber = 1
  try {
    for await (const unknownRow of parser) {
      rowNumber += 1
      if (result.rows.length + result.skippedRows >= LETTERBOXD_ROW_LIMIT) throw limited('The Letterboxd export contains too many CSV rows.')
      const row = unknownRow as CsvRow
      const kind = csvKind(filename, Object.keys(row))
      if (!kind) {
        result.skippedRows += 1
        continue
      }
      if (kind === 'profile') {
        const profile = profileFromRow(row)
        result.profile = {
          bio: result.profile.bio ?? profile.bio,
          displayName: result.profile.displayName ?? profile.displayName,
          location: result.profile.location ?? profile.location,
        }
      }
      const staged = stagedRow(filename, kind, row, rowNumber)
      if (staged) result.rows.push(staged)
      else result.skippedRows += 1
    }
  } catch (error) {
    if (error instanceof LetterboxdImportError) throw error
    throw invalid(`Could not parse ${filename} as CSV.`, error)
  }
}

function openZip(buffer: Buffer): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.fromBuffer(buffer, { decodeStrings: true, lazyEntries: true, strictFileNames: true, validateEntrySizes: true }, (error, zip) => {
      if (error || !zip) reject(invalid('The uploaded ZIP is corrupt.', error))
      else resolve(zip)
    })
  })
}

function entryStream(zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<NodeJS.ReadableStream> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error || !stream) reject(invalid(`Could not read ${entry.fileName}.`, error))
      else resolve(stream)
    })
  })
}

async function parseZip(buffer: Buffer, result: LetterboxdParseResult): Promise<void> {
  const zip = await openZip(buffer)
  await new Promise<void>((resolve, reject) => {
    let entries = 0
    let expanded = 0
    let settled = false
    const fail = (error: unknown) => {
      if (settled) return
      settled = true
      zip.close()
      reject(error instanceof LetterboxdImportError ? error : invalid('The uploaded ZIP could not be read.', error))
    }
    zip.on('error', fail)
    zip.on('end', () => {
      if (!settled) {
        settled = true
        resolve()
      }
    })
    zip.on('entry', (entry: yauzl.Entry) => {
      void (async () => {
        entries += 1
        if (entries > LETTERBOXD_ENTRY_LIMIT) throw limited('The Letterboxd ZIP contains too many entries.')
        if (!isSafeZipPath(entry.fileName)) throw invalid('The Letterboxd ZIP contains an unsafe path.')
        expanded += entry.uncompressedSize
        if (expanded > LETTERBOXD_EXPANDED_LIMIT) throw limited('The expanded Letterboxd export is too large.')
        const isDirectory = entry.fileName.endsWith('/')
        const path = entry.fileName.replaceAll('\\', '/').toLowerCase()
        if (isDirectory || !path.endsWith('.csv') || path.split('/').includes('deleted') || (path.split('/').at(-1) ?? '').includes('likes')) {
          if (!isDirectory) result.ignoredEntries += 1
          zip.readEntry()
          return
        }
        await parseCsvStream(await entryStream(zip, entry), entry.fileName, result)
        zip.readEntry()
      })().catch(fail)
    })
    zip.readEntry()
  })
}

export async function parseLetterboxdUpload(filename: string, bytes: Buffer): Promise<LetterboxdParseResult> {
  if (bytes.byteLength > LETTERBOXD_UPLOAD_LIMIT) throw limited('The Letterboxd upload exceeds 25 MiB.')
  const result: LetterboxdParseResult = {
    ignoredEntries: 0,
    profile: { bio: null, displayName: null, location: null },
    rows: [],
    skippedRows: 0,
  }
  const zip = bytes[0] === 0x50 && bytes[1] === 0x4b
  if (zip || filename.toLowerCase().endsWith('.zip')) await parseZip(bytes, result)
  else if (filename.toLowerCase().endsWith('.csv')) await parseCsvStream(Readable.from(bytes), filename, result)
  else throw invalid('Upload an official Letterboxd ZIP or a compatible CSV file.')
  const seen = new Set<string>()
  result.rows = result.rows.filter((row) => {
    const key = `${row.kind}:${row.sourceKey}`
    if (seen.has(key)) {
      result.skippedRows += 1
      return false
    }
    seen.add(key)
    return true
  })
  if (result.rows.length === 0) throw invalid('No supported Letterboxd records were found.')
  return result
}
