import { randomUUID } from 'node:crypto'

import type { LetterboxdImportRepository, StoredImportBatch, StoredImportItem } from './repository.ts'

function copyBatch(batch: StoredImportBatch): StoredImportBatch {
  return { ...batch, profile: { ...batch.profile }, progress: { ...batch.progress } }
}

function copyItem(item: StoredImportItem): StoredImportItem {
  return { ...item, candidates: item.candidates.map((candidate) => ({ ...candidate })), payload: { ...item.payload } }
}

export function createMemoryLetterboxdImportRepository(): LetterboxdImportRepository {
  const batches = new Map<string, StoredImportBatch>()
  const items = new Map<string, StoredImportItem[]>()

  function owned(memberId: string, importId: string) {
    const batch = batches.get(importId)
    return batch?.memberId === memberId ? batch : null
  }

  function updateStatus(batch: StoredImportBatch, records: StoredImportItem[]) {
    const baseSkipped = Math.max(0, batch.progress.total - records.length)
    const count = (status: StoredImportItem['matchStatus']) => records.filter((item) => item.matchStatus === status).length
    batch.progress = {
      confident: count('confident'),
      exact: count('exact'),
      needsReview: count('needs_review'),
      skipped: baseSkipped + count('skipped'),
      total: batch.progress.total,
      unmatched: count('unmatched'),
    }
    batch.status = records.some((item) => item.matchStatus === 'needs_review' || item.matchStatus === 'unmatched') ? 'needs_review' : 'ready'
    batch.updatedAt = new Date()
    batch.workerId = null
    batch.claimedAt = null
  }

  return {
    async claimNext(workerId, staleBefore) {
      const batch = [...batches.values()].find((candidate) => candidate.status === 'uploaded' || (candidate.status === 'processing' && candidate.updatedAt < staleBefore))
      if (!batch) return null
      batch.status = 'processing'
      batch.claimedAt = new Date()
      batch.updatedAt = batch.claimedAt
      batch.workerId = workerId
      return { ...copyBatch(batch), items: (items.get(batch.id) ?? []).map(copyItem) }
    },
    async confirm(memberId, importId, confirmedAt) {
      const batch = owned(memberId, importId)
      if (!batch) return
      batch.status = 'confirmed'
      batch.confirmedAt = confirmedAt
      batch.updatedAt = confirmedAt
    },
    async create(memberId, filename, archiveSha256, parsed, createdAt) {
      const id = randomUUID()
      const stagedSkipped = parsed.rows.filter((row) => row.matchStatus === 'skipped').length
      const extraSkipped = parsed.skippedRows + parsed.ignoredEntries
      const batch: StoredImportBatch = {
        archiveSha256,
        claimedAt: null,
        confirmedAt: null,
        createdAt,
        failedReason: null,
        id,
        memberId,
        profile: parsed.profile,
        progress: { confident: 0, exact: 0, needsReview: 0, skipped: extraSkipped + stagedSkipped, total: parsed.rows.length + extraSkipped, unmatched: parsed.rows.length - stagedSkipped },
        sourceFilename: filename,
        status: 'uploaded',
        updatedAt: createdAt,
        workerId: null,
      }
      batches.set(id, batch)
      items.set(id, parsed.rows.map((row) => ({ ...row, candidates: [], id: randomUUID(), selectedTmdbId: null })))
      return copyBatch(batch)
    },
    async discard(memberId, importId) {
      const batch = owned(memberId, importId)
      if (!batch || batch.status === 'confirmed') return false
      batches.delete(importId)
      items.delete(importId)
      return true
    },
    async fail(importId, workerId, message) {
      const batch = batches.get(importId)
      if (!batch || batch.status !== 'processing' || batch.workerId !== workerId) return false
      batch.failedReason = message
      batch.status = 'failed'
      batch.updatedAt = new Date()
      batch.claimedAt = null
      batch.workerId = null
      return true
    },
    async find(memberId, importId) {
      const batch = owned(memberId, importId)
      return batch ? { ...copyBatch(batch), items: (items.get(importId) ?? []).map(copyItem) } : null
    },
    async list(memberId) {
      return [...batches.values()].filter((batch) => batch.memberId === memberId).sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime()).map(copyBatch)
    },
    async removeImportedData() {},
    async renewClaim(importId, workerId, claimedAt) {
      const batch = batches.get(importId)
      if (!batch || batch.status !== 'processing' || batch.workerId !== workerId) return false
      batch.claimedAt = claimedAt
      batch.updatedAt = claimedAt
      return true
    },
    async retry(memberId, importId) {
      const batch = owned(memberId, importId)
      if (!batch || batch.status === 'confirmed') return false
      batch.status = 'uploaded'
      batch.failedReason = null
      batch.claimedAt = null
      batch.workerId = null
      return true
    },
    async saveMatches(importId, workerId, matches) {
      const batch = batches.get(importId)
      const records = items.get(importId)
      if (!batch || !records || batch.status !== 'processing' || batch.workerId !== workerId) return false
      for (const match of matches) {
        const item = records.find((candidate) => candidate.id === match.id)
        if (!item) continue
        item.candidates = match.candidates
        item.selectedTmdbId = match.selectedTmdbId
        item.matchStatus = match.status
      }
      batch.failedReason = null
      updateStatus(batch, records)
      return true
    },
    async select(memberId, importId, itemId, selection) {
      const batch = owned(memberId, importId)
      const records = items.get(importId)
      const item = records?.find((candidate) => candidate.id === itemId)
      if (!batch || !records || !item || batch.status === 'confirmed') return false
      item.matchStatus = selection.skip ? 'skipped' : 'exact'
      item.selectedTmdbId = selection.skip ? null : selection.tmdbId ?? null
      if (selection.tmdbId && !item.candidates.some((candidate) => candidate.id === selection.tmdbId)) {
        item.candidates.push({ id: selection.tmdbId, posterUrl: null, title: item.title ?? `Movie ${selection.tmdbId}`, year: item.year })
      }
      updateStatus(batch, records)
      return true
    },
  }
}
