import type {
  LetterboxdImport,
  LetterboxdImportDetail,
  LetterboxdMatchSelection,
  LetterboxdMatchStatus,
} from '@consumit/contracts'

import type { LetterboxdParseResult, LetterboxdProfileDraft, LetterboxdStagedRow } from './types.ts'

export type MatchCandidate = { id: number; posterUrl: string | null; title: string; year: number | null }

export type StoredImportItem = LetterboxdStagedRow & {
  candidates: MatchCandidate[]
  id: string
  selectedTmdbId: number | null
}

export type StoredImportBatch = {
  archiveSha256: string
  confirmedAt: Date | null
  createdAt: Date
  failedReason: string | null
  id: string
  memberId: string
  claimedAt: Date | null
  profile: LetterboxdProfileDraft
  progress: LetterboxdImport['progress']
  sourceFilename: string
  status: LetterboxdImport['status']
  updatedAt: Date
  workerId: string | null
}

export interface LetterboxdImportRepository {
  claimNext(workerId: string, staleBefore: Date): Promise<(StoredImportBatch & { items: StoredImportItem[] }) | null>
  confirm(memberId: string, importId: string, confirmedAt: Date): Promise<void>
  create(memberId: string, filename: string, archiveSha256: string, parsed: LetterboxdParseResult, createdAt: Date): Promise<StoredImportBatch>
  discard(memberId: string, importId: string): Promise<boolean>
  fail(importId: string, workerId: string, message: string): Promise<boolean>
  find(memberId: string, importId: string): Promise<(StoredImportBatch & { items: StoredImportItem[] }) | null>
  list(memberId: string): Promise<StoredImportBatch[]>
  removeImportedData(memberId: string): Promise<void>
  renewClaim(importId: string, workerId: string, claimedAt: Date): Promise<boolean>
  retry(memberId: string, importId: string): Promise<boolean>
  saveMatches(importId: string, workerId: string, matches: Array<{ candidates: MatchCandidate[]; id: string; selectedTmdbId: number | null; status: LetterboxdMatchStatus }>): Promise<boolean>
  select(memberId: string, importId: string, itemId: string, selection: LetterboxdMatchSelection): Promise<boolean>
}

export function importView(batch: StoredImportBatch): LetterboxdImport {
  return {
    confirmedAt: batch.confirmedAt?.toISOString() ?? null,
    createdAt: batch.createdAt.toISOString(),
    failedReason: batch.failedReason,
    id: batch.id,
    progress: batch.progress,
    status: batch.status,
    updatedAt: batch.updatedAt.toISOString(),
  }
}

export function importDetailView(batch: StoredImportBatch & { items: StoredImportItem[] }): LetterboxdImportDetail {
  return {
    import: importView(batch),
    items: batch.items.map((item) => ({
      candidates: item.candidates,
      id: item.id,
      kind: item.kind,
      selected: item.selectedTmdbId ? { id: item.selectedTmdbId, kind: 'movie' } : null,
      sourceKey: item.sourceKey,
      status: item.matchStatus,
      title: item.title,
      year: item.year,
    })),
  }
}
