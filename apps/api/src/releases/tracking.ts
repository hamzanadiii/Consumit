import type { Prisma } from '../../generated/prisma/client.js'
import { ApiError } from '../http/errors.ts'

export async function requireActiveTrackingMember(tx: Prisma.TransactionClient, memberId: string) {
  if (!await tx.member.findFirst({ where: { id: memberId, status: 'ACTIVE' } })) throw new ApiError('UNAUTHENTICATED', 'Sign in to update saved titles.')
}

/** Runs in the same transaction and member lock as a Save/Favorites write. */
export async function syncReleaseTracking(tx: Prisma.TransactionClient, memberId: string, now = new Date()) {
  const [saved, favorites] = await Promise.all([
    tx.savedTitle.findMany({ where: { memberId, catalogKind: { in: ['SERIES', 'ANIME'] } }, select: { catalogKind: true, tmdbId: true } }),
    tx.favorite.findMany({ where: { memberId, catalogKind: { in: ['SERIES', 'ANIME'] } }, select: { catalogKind: true, tmdbId: true } }),
  ])
  const titles = [...new Map([...saved, ...favorites].map(ref => [`${ref.catalogKind}:${ref.tmdbId}`, ref])).values()]
  await tx.releaseTracking.deleteMany({ where: { memberId, ...(titles.length ? { NOT: { OR: titles } } : {}) } })
  for (const title of titles) {
    await tx.releaseTracking.upsert({ where: { memberId_catalogKind_tmdbId: { memberId, ...title } }, create: { memberId, ...title, trackedSince: now }, update: {} })
    await tx.releaseTitle.upsert({ where: { catalogKind_tmdbId: title }, create: { ...title, refreshAfter: now }, update: {} })
  }
}
