import { createHash } from 'node:crypto'

import type { CatalogTitleSummary, LetterboxdImport, LetterboxdImportDetail, LetterboxdMatchSelection } from '@consumit/contracts'

import type { Catalog } from '../../catalog/catalog.ts'
import { CatalogError } from '../../catalog/errors.ts'
import { LetterboxdImportError } from './errors.ts'
import { normalizeLetterboxdTitle, parseLetterboxdUpload } from './parser.ts'
import { importDetailView, importView, type LetterboxdImportRepository, type MatchCandidate, type StoredImportItem } from './repository.ts'

export interface LetterboxdImporter {
  confirm(memberId: string, importId: string): Promise<void>
  detail(memberId: string, importId: string): Promise<LetterboxdImportDetail>
  discard(memberId: string, importId: string): Promise<void>
  history(memberId: string): Promise<LetterboxdImport[]>
  removeImportedData(memberId: string): Promise<void>
  retry(memberId: string, importId: string): Promise<void>
  select(memberId: string, importId: string, itemId: string, selection: LetterboxdMatchSelection): Promise<void>
  upload(memberId: string, filename: string, bytes: Buffer): Promise<LetterboxdImport>
}

function notFound(): LetterboxdImportError {
  return new LetterboxdImportError('IMPORT_NOT_FOUND', 'Letterboxd import not found.')
}

function candidate(title: CatalogTitleSummary): MatchCandidate {
  return { id: title.id, posterUrl: title.posterUrl, title: title.title, year: title.year }
}

async function mapConcurrent<T, R>(items: readonly T[], concurrency: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const index = next
      next += 1
      results[index] = await work(items[index]!)
    }
  }))
  return results
}

async function matchItem(catalog: Catalog, item: StoredImportItem) {
  if (item.kind === 'profile') return { candidates: [], id: item.id, selectedTmdbId: null, status: 'skipped' as const }
  if (item.tmdbId) {
    try {
      const title = await catalog.title('movie', item.tmdbId)
      return { candidates: [candidate(title.item)], id: item.id, selectedTmdbId: title.item.id, status: 'exact' as const }
    } catch (error) {
      if (!(error instanceof CatalogError && error.code === 'CATALOG_NOT_FOUND')) throw error
    }
  }
  if (item.imdbId) {
    const title = await catalog.movieByExternalId(item.imdbId)
    if (title) return { candidates: [candidate(title)], id: item.id, selectedTmdbId: title.id, status: 'exact' as const }
  }
  if (!item.title) return { candidates: [], id: item.id, selectedTmdbId: null, status: 'skipped' as const }
  const page = await catalog.search({ kind: 'movie', page: 1, query: item.title })
  const exact = page.items.filter((title) => normalizeLetterboxdTitle(title.title) === item.normalizedTitle && (item.year === null || title.year === item.year))
  if (exact.length === 1) return { candidates: [candidate(exact[0]!)], id: item.id, selectedTmdbId: exact[0]!.id, status: 'confident' as const }
  const candidates = page.items.slice(0, 5).map(candidate)
  return candidates.length
    ? { candidates, id: item.id, selectedTmdbId: null, status: 'needs_review' as const }
    : { candidates: [], id: item.id, selectedTmdbId: null, status: 'unmatched' as const }
}

type MatchResult = Awaited<ReturnType<typeof matchItem>>

export function createLetterboxdImporter(options: { catalog: Catalog; clock?: () => Date; repository: LetterboxdImportRepository }): LetterboxdImporter & { processNext(workerId: string): Promise<boolean> } {
  const clock = options.clock ?? (() => new Date())
  const { catalog, repository } = options

  return {
    async confirm(memberId, importId) {
      const detail = await repository.find(memberId, importId)
      if (!detail) throw notFound()
      if (detail.status === 'confirmed') return
      if (detail.items.some((item) => !['exact', 'confident', 'skipped'].includes(item.matchStatus))) {
        throw new LetterboxdImportError('IMPORT_NOT_READY', 'Review or skip every uncertain title before confirming.')
      }
      await repository.confirm(memberId, importId, clock())
    },
    async detail(memberId, importId) {
      const detail = await repository.find(memberId, importId)
      if (!detail) throw notFound()
      return importDetailView(detail)
    },
    async discard(memberId, importId) {
      if (!await repository.discard(memberId, importId)) throw notFound()
    },
    async history(memberId) {
      const batches = await repository.list(memberId)
      return batches.map(importView)
    },
    async processNext(workerId) {
      const staleBefore = new Date(clock().getTime() - 10 * 60 * 1000)
      const batch = await repository.claimNext(workerId, staleBefore)
      if (!batch) return false
      try {
        const matches: MatchResult[] = []
        for (let offset = 0; offset < batch.items.length; offset += 40) {
          if (!await repository.renewClaim(batch.id, workerId, clock())) return true
          matches.push(...await mapConcurrent(batch.items.slice(offset, offset + 40), 4, (item) => matchItem(catalog, item)))
        }
        await repository.saveMatches(batch.id, workerId, matches)
      } catch (error) {
        const retryable = error instanceof CatalogError && error.retryable
        await repository.fail(batch.id, workerId, retryable ? 'TMDB is temporarily unavailable. Retry this import.' : 'Matching failed. Retry this import.')
      }
      return true
    },
    async removeImportedData(memberId) {
      await repository.removeImportedData(memberId)
    },
    async retry(memberId, importId) {
      if (!await repository.retry(memberId, importId)) throw notFound()
    },
    async select(memberId, importId, itemId, selection) {
      if (selection.tmdbId) await catalog.title('movie', selection.tmdbId)
      if (!await repository.select(memberId, importId, itemId, selection)) throw notFound()
    },
    async upload(memberId, filename, bytes) {
      const parsed = await parseLetterboxdUpload(filename, bytes)
      const batch = await repository.create(memberId, filename, createHash('sha256').update(bytes).digest('hex'), parsed, clock())
      return importView(batch)
    },
  }
}
