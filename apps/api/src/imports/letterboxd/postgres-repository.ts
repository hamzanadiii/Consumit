import { createHash } from 'node:crypto'

import type { LetterboxdMatchSelection, LetterboxdMatchStatus, LetterboxdRowKind } from '@consumit/contracts'

import { Prisma, PrismaClient, type ImportBatch as DbImportBatch, type ImportStagedRecord as DbImportStagedRecord } from '../../../generated/prisma/client.js'
import type { LetterboxdProfileDraft, LetterboxdStagedPayload } from './types.ts'
import type { LetterboxdImportRepository, MatchCandidate, StoredImportBatch, StoredImportItem } from './repository.ts'

const batchInclude = { records: { orderBy: [{ sourceFile: 'asc' as const }, { rowNumber: 'asc' as const }] } } satisfies Prisma.ImportBatchInclude

function statusFromDb(status: string): StoredImportBatch['status'] {
  return status.toLowerCase() as StoredImportBatch['status']
}

function matchFromDb(status: string): LetterboxdMatchStatus {
  return status.toLowerCase() as LetterboxdMatchStatus
}

function kindFromDb(kind: string): LetterboxdRowKind {
  return kind.toLowerCase() as LetterboxdRowKind
}

function jsonObject(value: Prisma.JsonValue | null): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function profileDraft(value: Prisma.JsonValue | null): LetterboxdProfileDraft {
  const object = jsonObject(value)
  return {
    bio: typeof object.bio === 'string' ? object.bio : null,
    displayName: typeof object.displayName === 'string' ? object.displayName : null,
    location: typeof object.location === 'string' ? object.location : null,
  }
}

function payload(value: Prisma.JsonValue): LetterboxdStagedPayload {
  return jsonObject(value) as LetterboxdStagedPayload
}

function candidates(value: Prisma.JsonValue | null): MatchCandidate[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return []
    const item = candidate as Record<string, unknown>
    return typeof item.id === 'number' && typeof item.title === 'string'
      ? [{ id: item.id, posterUrl: typeof item.posterUrl === 'string' ? item.posterUrl : null, title: item.title, year: typeof item.year === 'number' ? item.year : null }]
      : []
  })
}

type BatchRow = DbImportBatch & { records: DbImportStagedRecord[] }
type ItemRow = DbImportStagedRecord

function itemRecord(row: ItemRow): StoredImportItem {
  return {
    candidates: candidates(row.candidates),
    id: row.id,
    imdbId: row.imdbId,
    kind: kindFromDb(row.rowKind),
    matchStatus: matchFromDb(row.matchStatus),
    normalizedTitle: row.normalizedTitle,
    payload: payload(row.payload),
    rowNumber: row.rowNumber,
    selectedTmdbId: row.selectedTmdbId,
    sourceFile: row.sourceFile,
    sourceKey: row.sourceKey,
    title: row.title,
    tmdbId: row.tmdbId,
    year: row.year,
  }
}

function batchRecord(row: DbImportBatch): StoredImportBatch {
  return {
    archiveSha256: row.archiveSha256,
    claimedAt: row.claimedAt,
    confirmedAt: row.confirmedAt,
    createdAt: row.createdAt,
    failedReason: row.failedReason,
    id: row.id,
    memberId: row.memberId,
    profile: profileDraft(row.profileDraft),
    progress: {
      confident: row.confidentCount,
      exact: row.exactCount,
      needsReview: row.reviewCount,
      skipped: row.skippedCount,
      total: row.totalCount,
      unmatched: row.unmatchedCount,
    },
    sourceFilename: row.sourceFilename,
    status: statusFromDb(row.status),
    updatedAt: row.updatedAt,
    workerId: row.workerId,
  }
}

function withItems(row: BatchRow): StoredImportBatch & { items: StoredImportItem[] } {
  return { ...batchRecord(row), items: row.records.map(itemRecord) }
}

function dbStatus(status: LetterboxdMatchStatus) {
  return status.toUpperCase() as 'EXACT' | 'CONFIDENT' | 'NEEDS_REVIEW' | 'UNMATCHED' | 'SKIPPED'
}

function slugPart(value: string) {
  return value.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'list'
}

function listSourceKey(name: string) {
  return `letterboxd-list:${createHash('sha256').update(name.trim().toLowerCase()).digest('hex')}`
}

async function ensureWatched(tx: Prisma.TransactionClient, memberId: string, tmdbId: number, sourceKey: string, importBatchId: string) {
  const source = await tx.watchedTitle.findUnique({ where: { memberId_origin_sourceKey: { memberId, origin: 'LETTERBOXD', sourceKey } } })
  const target = await tx.watchedTitle.findUnique({ where: { memberId_catalogKind_tmdbId: { catalogKind: 'MOVIE', memberId, tmdbId } } })
  if (source) {
    if (target && target.id !== source.id) {
      await tx.watchedTitle.delete({ where: { id: source.id } })
      if (target.origin === 'LETTERBOXD') await tx.watchedTitle.update({ data: { importBatchId }, where: { id: target.id } })
    } else {
      await tx.watchedTitle.update({ data: { importBatchId, tmdbId }, where: { id: source.id } })
    }
    return
  }
  if (target) {
    if (target.origin === 'LETTERBOXD') await tx.watchedTitle.update({ data: { importBatchId }, where: { id: target.id } })
    return
  }
  await tx.watchedTitle.create({ data: { catalogKind: 'MOVIE', importBatchId, memberId, origin: 'LETTERBOXD', sourceKey, tmdbId } })
}

async function writeRating(tx: Prisma.TransactionClient, memberId: string, tmdbId: number, value: number, sourceKey: string, importBatchId: string) {
  const source = await tx.rating.findUnique({ where: { memberId_origin_sourceKey: { memberId, origin: 'LETTERBOXD', sourceKey } } })
  const target = await tx.rating.findUnique({ where: { memberId_catalogKind_tmdbId: { catalogKind: 'MOVIE', memberId, tmdbId } } })
  if (source) {
    if (target && target.id !== source.id) {
      await tx.rating.delete({ where: { id: source.id } })
      if (target.origin === 'LETTERBOXD') await tx.rating.update({ data: { importBatchId, value }, where: { id: target.id } })
    } else {
      await tx.rating.update({ data: { importBatchId, tmdbId, value }, where: { id: source.id } })
    }
    return
  }
  if (target) {
    if (target.origin === 'LETTERBOXD') await tx.rating.update({ data: { importBatchId, value }, where: { id: target.id } })
    return
  }
  await tx.rating.create({ data: { catalogKind: 'MOVIE', importBatchId, memberId, origin: 'LETTERBOXD', sourceKey, tmdbId, value } })
}

async function writeSaved(tx: Prisma.TransactionClient, memberId: string, tmdbId: number, sourceKey: string, importBatchId: string) {
  const source = await tx.savedTitle.findUnique({ where: { memberId_origin_sourceKey: { memberId, origin: 'LETTERBOXD', sourceKey } } })
  const target = await tx.savedTitle.findUnique({ where: { memberId_catalogKind_tmdbId: { catalogKind: 'MOVIE', memberId, tmdbId } } })
  if (source) {
    if (target && target.id !== source.id) {
      await tx.savedTitle.delete({ where: { id: source.id } })
      if (target.origin === 'LETTERBOXD') await tx.savedTitle.update({ data: { importBatchId }, where: { id: target.id } })
    } else {
      await tx.savedTitle.update({ data: { importBatchId, tmdbId }, where: { id: source.id } })
    }
    return
  }
  if (target) {
    if (target.origin === 'LETTERBOXD') await tx.savedTitle.update({ data: { importBatchId }, where: { id: target.id } })
    return
  }
  await tx.savedTitle.create({ data: { catalogKind: 'MOVIE', importBatchId, memberId, origin: 'LETTERBOXD', sourceKey, tmdbId } })
}

async function applyItem(tx: Prisma.TransactionClient, batch: BatchRow, item: ItemRow) {
  const tmdbId = item.selectedTmdbId
  if (!tmdbId || item.matchStatus === 'SKIPPED' || item.rowKind === 'PROFILE') return
  const row = payload(item.payload)
  const memberId = batch.memberId
  if (['WATCHED', 'DIARY', 'RATING', 'REVIEW'].includes(item.rowKind)) await ensureWatched(tx, memberId, tmdbId, item.sourceKey, batch.id)

  if (item.rowKind === 'DIARY' && row.watchedOn) {
    const watchedOn = new Date(`${row.watchedOn}T00:00:00.000Z`)
    if (!Number.isNaN(watchedOn.getTime())) {
      await tx.diaryEntry.upsert({
        create: { catalogKind: 'MOVIE', importBatchId: batch.id, memberId, origin: 'LETTERBOXD', rewatch: row.rewatch ?? false, sourceKey: item.sourceKey, tags: row.tags ?? [], tmdbId, watchedOn },
        update: { importBatchId: batch.id, rewatch: row.rewatch ?? false, tags: row.tags ?? [], tmdbId, watchedOn },
        where: { memberId_origin_sourceKey: { memberId, origin: 'LETTERBOXD', sourceKey: item.sourceKey } },
      })
    }
  }
  if ((item.rowKind === 'RATING' || item.rowKind === 'DIARY' || item.rowKind === 'REVIEW') && row.rating) {
    await writeRating(tx, memberId, tmdbId, row.rating, item.sourceKey, batch.id)
  }
  if ((item.rowKind === 'REVIEW' || item.rowKind === 'DIARY') && row.review) {
    const reviewedOn = row.watchedOn ? new Date(`${row.watchedOn}T00:00:00.000Z`) : null
    await tx.review.upsert({
      create: { body: row.review, catalogKind: 'MOVIE', importBatchId: batch.id, memberId, origin: 'LETTERBOXD', reviewedOn, sourceKey: item.sourceKey, tags: row.tags ?? [], tmdbId },
      update: { body: row.review, importBatchId: batch.id, reviewedOn, tags: row.tags ?? [], tmdbId },
      where: { memberId_origin_sourceKey: { memberId, origin: 'LETTERBOXD', sourceKey: item.sourceKey } },
    })
  }
  if (item.rowKind === 'WATCHLIST') {
    await writeSaved(tx, memberId, tmdbId, item.sourceKey, batch.id)
  }
  if (item.rowKind === 'FAVORITE') {
    const position = Math.max(1, Math.min(4, row.position ?? item.rowNumber - 1))
    const existingTitle = await tx.favorite.findUnique({ where: { memberId_catalogKind_tmdbId: { catalogKind: 'MOVIE', memberId, tmdbId } } })
    const occupying = await tx.favorite.findUnique({ where: { memberId_position: { memberId, position } } })
    if (!existingTitle && !occupying) {
      await tx.favorite.create({ data: { catalogKind: 'MOVIE', importBatchId: batch.id, memberId, origin: 'LETTERBOXD', position, sourceKey: item.sourceKey, tmdbId } })
    } else if (occupying?.origin === 'LETTERBOXD' && (!existingTitle || existingTitle.id === occupying.id)) {
      await tx.favorite.update({ data: { importBatchId: batch.id, sourceKey: item.sourceKey, tmdbId }, where: { id: occupying.id } })
    }
  }
  if (item.rowKind === 'LIST_ITEM' && row.listName) {
    const sourceKey = listSourceKey(row.listName)
    let list = await tx.memberList.findUnique({ where: { memberId_origin_sourceKey: { memberId, origin: 'LETTERBOXD', sourceKey } } })
    if (!list) {
      const suffix = createHash('sha256').update(`${memberId}:${sourceKey}`).digest('hex').slice(0, 8)
      list = await tx.memberList.create({ data: { description: row.listDescription ?? null, importBatchId: batch.id, memberId, name: row.listName, origin: 'LETTERBOXD', slug: `${slugPart(row.listName)}-${suffix}`, sourceKey, visibility: 'private' } })
    }
    let position = Math.max(1, row.position ?? item.rowNumber - 1)
    const occupying = await tx.listItem.findUnique({ where: { listId_position: { listId: list.id, position } } })
    if (occupying && !(occupying.origin === 'LETTERBOXD' && occupying.sourceKey === item.sourceKey)) {
      const last = await tx.listItem.findFirst({ orderBy: { position: 'desc' }, select: { position: true }, where: { listId: list.id } })
      position = (last?.position ?? position) + 1
    }
    await tx.listItem.upsert({
      create: { catalogKind: 'MOVIE', listId: list.id, origin: 'LETTERBOXD', position, sourceKey: item.sourceKey, tmdbId },
      update: { position, tmdbId },
      where: { listId_origin_sourceKey: { listId: list.id, origin: 'LETTERBOXD', sourceKey: item.sourceKey } },
    })
  }
}

async function refreshCounts(tx: Prisma.TransactionClient, importId: string) {
  const [grouped, batch, stagedTotal] = await Promise.all([
    tx.importStagedRecord.groupBy({ by: ['matchStatus'], _count: true, where: { importBatchId: importId } }),
    tx.importBatch.findUniqueOrThrow({ select: { totalCount: true }, where: { id: importId } }),
    tx.importStagedRecord.count({ where: { importBatchId: importId } }),
  ])
  const count = (status: string) => grouped.find((group) => group.matchStatus === status)?._count ?? 0
  const skippedOutsideStaging = Math.max(0, batch.totalCount - stagedTotal)
  const unresolved = count('NEEDS_REVIEW') + count('UNMATCHED')
  await tx.importBatch.update({
    data: {
      confidentCount: count('CONFIDENT'), exactCount: count('EXACT'), reviewCount: count('NEEDS_REVIEW'),
      claimedAt: null, failedReason: null, skippedCount: skippedOutsideStaging + count('SKIPPED'),
      status: unresolved ? 'NEEDS_REVIEW' : 'READY', unmatchedCount: count('UNMATCHED'), workerId: null,
    },
    where: { id: importId },
  })
}

export function createPostgresLetterboxdImportRepository(prisma: PrismaClient): LetterboxdImportRepository {
  return {
    async claimNext(workerId, staleBefore) {
      return prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<Array<{ id: string }>>`
          SELECT "id" FROM "ImportBatch"
          WHERE "status" = 'UPLOADED'::"ImportBatchStatus"
             OR ("status" = 'PROCESSING'::"ImportBatchStatus" AND "claimedAt" < ${staleBefore})
          ORDER BY "createdAt" ASC LIMIT 1 FOR UPDATE SKIP LOCKED
        `
        const selected = rows[0]
        if (!selected) return null
        await tx.importBatch.update({ data: { attempts: { increment: 1 }, claimedAt: new Date(), status: 'PROCESSING', workerId }, where: { id: selected.id } })
        return withItems(await tx.importBatch.findUniqueOrThrow({ include: batchInclude, where: { id: selected.id } }))
      })
    },
    async confirm(memberId, importId, confirmedAt) {
      await prisma.$transaction(async (tx) => {
        const batch = await tx.importBatch.findFirst({ include: batchInclude, where: { id: importId, memberId } })
        if (!batch) return
        if (batch.status === 'CONFIRMED') return
        if (batch.records.some((item) => !['EXACT', 'CONFIDENT', 'SKIPPED'].includes(item.matchStatus))) return
        const draft = profileDraft(batch.profileDraft)
        if (draft.displayName) await tx.profile.updateMany({ data: { displayName: draft.displayName, displayNameOrigin: 'LETTERBOXD' }, where: { displayName: null, memberId } })
        if (draft.bio) await tx.profile.updateMany({ data: { bio: draft.bio, bioOrigin: 'LETTERBOXD' }, where: { bio: null, memberId } })
        if (draft.location) await tx.profile.updateMany({ data: { location: draft.location, locationOrigin: 'LETTERBOXD' }, where: { location: null, memberId } })

        if (batch.records.some((item) => item.rowKind === 'FAVORITE')) {
          await tx.favorite.deleteMany({ where: { memberId, origin: 'LETTERBOXD' } })
        }
        const importedListNames = new Set(batch.records.flatMap((item) => {
          if (item.rowKind !== 'LIST_ITEM') return []
          const listName = payload(item.payload).listName
          return listName ? [listName] : []
        }))
        for (const name of importedListNames) {
          const list = await tx.memberList.findUnique({
            where: { memberId_origin_sourceKey: { memberId, origin: 'LETTERBOXD', sourceKey: listSourceKey(name) } },
          })
          if (list) await tx.listItem.deleteMany({ where: { listId: list.id, origin: 'LETTERBOXD' } })
        }
        for (const item of batch.records) await applyItem(tx, batch, item)
        await tx.importBatch.update({ data: { confirmedAt, status: 'CONFIRMED', workerId: null }, where: { id: importId } })
      })
    },
    async create(memberId, filename, archiveSha256, parsed, createdAt) {
      const stagedSkipped = parsed.rows.filter((row) => row.matchStatus === 'skipped').length
      const skippedOutsideStaging = parsed.skippedRows + parsed.ignoredEntries
      const batch = await prisma.importBatch.create({
        data: {
          archiveSha256,
          createdAt,
          memberId,
          profileDraft: parsed.profile as Prisma.InputJsonValue,
          records: {
            create: parsed.rows.map((row) => ({
              imdbId: row.imdbId, matchStatus: dbStatus(row.matchStatus), normalizedTitle: row.normalizedTitle,
              payload: row.payload as Prisma.InputJsonValue, rowKind: row.kind.toUpperCase() as never, rowNumber: row.rowNumber,
              sourceFile: row.sourceFile, sourceKey: row.sourceKey, title: row.title, tmdbId: row.tmdbId, year: row.year,
            })),
          },
          skippedCount: skippedOutsideStaging + stagedSkipped,
          sourceFilename: filename,
          totalCount: parsed.rows.length + skippedOutsideStaging,
          unmatchedCount: parsed.rows.length - stagedSkipped,
        },
        include: batchInclude,
      })
      return batchRecord(batch)
    },
    async discard(memberId, importId) {
      return (await prisma.importBatch.deleteMany({ where: { id: importId, memberId, status: { not: 'CONFIRMED' } } })).count === 1
    },
    async fail(importId, workerId, message) {
      return (await prisma.importBatch.updateMany({
        data: { claimedAt: null, failedReason: message, status: 'FAILED', workerId: null },
        where: { id: importId, status: 'PROCESSING', workerId },
      })).count === 1
    },
    async find(memberId, importId) {
      const batch = await prisma.importBatch.findFirst({ include: batchInclude, where: { id: importId, memberId } })
      return batch ? withItems(batch) : null
    },
    async list(memberId) {
      const batches = await prisma.importBatch.findMany({ include: batchInclude, orderBy: { createdAt: 'desc' }, where: { memberId } })
      return batches.map(batchRecord)
    },
    async removeImportedData(memberId) {
      await prisma.$transaction(async (tx) => {
        await tx.listItem.deleteMany({ where: { list: { memberId }, origin: 'LETTERBOXD' } })
        await tx.memberList.deleteMany({ where: { items: { none: {} }, memberId, origin: 'LETTERBOXD' } })
        await tx.favorite.deleteMany({ where: { memberId, origin: 'LETTERBOXD' } })
        await tx.review.deleteMany({ where: { memberId, origin: 'LETTERBOXD' } })
        await tx.rating.deleteMany({ where: { memberId, origin: 'LETTERBOXD' } })
        await tx.diaryEntry.deleteMany({ where: { memberId, origin: 'LETTERBOXD' } })
        await tx.savedTitle.deleteMany({ where: { memberId, origin: 'LETTERBOXD' } })
        await tx.watchedTitle.deleteMany({ where: { memberId, origin: 'LETTERBOXD' } })
        await tx.profile.updateMany({ data: { displayName: null, displayNameOrigin: 'NATIVE' }, where: { displayNameOrigin: 'LETTERBOXD', memberId } })
        await tx.profile.updateMany({ data: { bio: null, bioOrigin: 'NATIVE' }, where: { bioOrigin: 'LETTERBOXD', memberId } })
        await tx.profile.updateMany({ data: { location: null, locationOrigin: 'NATIVE' }, where: { locationOrigin: 'LETTERBOXD', memberId } })
      })
    },
    async renewClaim(importId, workerId, claimedAt) {
      return (await prisma.importBatch.updateMany({
        data: { claimedAt },
        where: { id: importId, status: 'PROCESSING', workerId },
      })).count === 1
    },
    async retry(memberId, importId) {
      return (await prisma.importBatch.updateMany({ data: { claimedAt: null, failedReason: null, status: 'UPLOADED', workerId: null }, where: { id: importId, memberId, status: { not: 'CONFIRMED' } } })).count === 1
    },
    async saveMatches(importId, workerId, matches) {
      return prisma.$transaction(async (tx) => {
        const owned = await tx.importBatch.updateMany({
          data: { claimedAt: new Date() },
          where: { id: importId, status: 'PROCESSING', workerId },
        })
        if (owned.count !== 1) return false
        for (const match of matches) {
          await tx.importStagedRecord.updateMany({
            data: { candidates: match.candidates as Prisma.InputJsonValue, matchStatus: dbStatus(match.status), matchedAt: new Date(), selectedTmdbId: match.selectedTmdbId },
            where: { id: match.id, importBatchId: importId },
          })
        }
        await refreshCounts(tx, importId)
        return true
      })
    },
    async select(memberId, importId, itemId, selection: LetterboxdMatchSelection) {
      return prisma.$transaction(async (tx) => {
        const item = await tx.importStagedRecord.findFirst({ where: { id: itemId, importBatch: { id: importId, memberId, status: { not: 'CONFIRMED' } } } })
        if (!item) return false
        await tx.importStagedRecord.update({ data: { matchStatus: selection.skip ? 'SKIPPED' : 'EXACT', selectedTmdbId: selection.skip ? null : selection.tmdbId ?? null }, where: { id: item.id } })
        await refreshCounts(tx, importId)
        return true
      })
    },
  }
}
