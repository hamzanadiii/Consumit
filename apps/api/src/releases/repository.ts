import { randomUUID } from 'node:crypto'
import type { NotificationPage, NotificationPreferences, NotificationQuery, ReleaseEpisode as EpisodeView, ReleaseShelf, ReleaseProbeJob, ReleaseProbeSource, ReleaseProbeEvidence } from '@consumit/contracts'
import type { PrismaClient, ReleaseEpisode, ReleaseCheck, Prisma } from '../../generated/prisma/client.js'
import { CHECK_FRESH_MS, WEEK_MS } from './policy.ts'
import { ApiError } from '../http/errors.ts'

export function episodeView(row: ReleaseEpisode, checkedAt: Date | null): EpisodeView {
  return { ref: { kind: row.catalogKind === 'SERIES' ? 'series' : 'anime', id: row.tmdbId, season: row.season, episode: row.episode },
    title: row.title, episodeTitle: row.episodeTitle, imageUrl: row.imageUrl, releasedAt: row.releasedAt.toISOString(),
    datePrecision: row.datePrecision === 'date' ? 'date' : 'instant', checkedAt: checkedAt?.toISOString() ?? null }
}

export function createReleaseRepository(prisma: PrismaClient, evidenceCurrent: (row: ReleaseEpisode) => boolean, clock = () => new Date()) {
  function checked(row: ReleaseEpisode) {
    const at = row.checkedAt
    return at && at.getTime() > clock().getTime() - CHECK_FRESH_MS && evidenceCurrent(row) ? at : null
  }
  async function lock(tx: Prisma.TransactionClient, name: string) { await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${name}))` }
  async function job(tx: Prisma.TransactionClient, id: string, token: string) {
    const row = await tx.releaseCheck.findFirst({ where: { id, leaseToken: token, finishedAt: null, leaseUntil: { gt: clock() } }, include: { episode: true } })
    if (!row) throw new ApiError('NOT_FOUND', 'This playback check has expired.')
    return row
  }
  return {
    async queueStats() {
      const now = clock()
      const [titles, episodes] = await Promise.all([
        prisma.$queryRaw<{ count: number; oldest: Date | null }[]>`SELECT COUNT(*)::int AS count,MIN(r."refreshAfter") AS oldest FROM "ReleaseTitle" r WHERE r."refreshAfter"<=${now} AND EXISTS (SELECT 1 FROM "ReleaseTracking" t WHERE t."catalogKind"=r."catalogKind" AND t."tmdbId"=r."tmdbId")`,
        prisma.$queryRaw<{ count: number; oldest: Date | null }[]>`SELECT COUNT(*)::int AS count,MIN(e."verifyAfter") AS oldest FROM "ReleaseEpisode" e WHERE e."catalogCurrent"=TRUE AND e."verifyAfter"<=${now} AND e."releasedAt">=${new Date(now.getTime() - WEEK_MS)} AND e."releasedAt"<=${now} AND EXISTS (SELECT 1 FROM "ReleaseTracking" t WHERE t."catalogKind"=e."catalogKind" AND t."tmdbId"=e."tmdbId")`,
      ])
      return { catalogDue: titles[0]?.count ?? 0, verificationDue: episodes[0]?.count ?? 0, queueAgeSeconds: Math.max(0, (now.getTime() - Math.min(titles[0]?.oldest?.getTime() ?? now.getTime(), episodes[0]?.oldest?.getTime() ?? now.getTime())) / 1000) }
    },
    async authorizeJob(id: string, token: string) {
      return Boolean(await prisma.releaseCheck.findFirst({ where: { id, leaseToken: token, finishedAt: null, leaseUntil: { gt: clock() } } }))
    },
    async shelf(memberId: string): Promise<ReleaseShelf> {
      const now = clock(), since = new Date(now.getTime() - WEEK_MS)
      const [ids, trackedCount, failures] = await Promise.all([
        prisma.$queryRaw<{ id: string }[]>`SELECT e."id" FROM "ReleaseEpisode" e
          JOIN "ReleaseTracking" t ON t."catalogKind"=e."catalogKind" AND t."tmdbId"=e."tmdbId" AND t."memberId"=${memberId}
          WHERE e."catalogCurrent"=TRUE AND e."releasedAt">=${since} AND e."releasedAt"<=${now}
          AND NOT EXISTS (SELECT 1 FROM "PlaybackProgress" p WHERE p."memberId"=${memberId} AND p."catalogKind"=e."catalogKind" AND p."tmdbId"=e."tmdbId" AND p."season"=e."season" AND p."episode"=e."episode" AND p."completed"=TRUE)
          AND NOT EXISTS (SELECT 1 FROM "WatchHistoryEntry" h WHERE h."memberId"=${memberId} AND h."catalogKind"=e."catalogKind" AND h."tmdbId"=e."tmdbId" AND h."season"=e."season" AND h."episode"=e."episode")
          ORDER BY e."releasedAt" DESC, e."id" DESC LIMIT 12`,
        prisma.releaseTracking.count({ where: { memberId } }),
        prisma.$queryRaw<{ failed: boolean }[]>`SELECT r."failed" FROM "ReleaseTitle" r JOIN "ReleaseTracking" t
          ON t."catalogKind"=r."catalogKind" AND t."tmdbId"=r."tmdbId" WHERE t."memberId"=${memberId} AND r."failed"=TRUE LIMIT 1`,
      ])
      const rows = await prisma.releaseEpisode.findMany({ where: { id: { in: ids.map(value => value.id) } } })
      const byId = new Map(rows.map(row => [row.id, row]))
      return { items: ids.flatMap(({ id }) => { const row = byId.get(id); return row ? [episodeView(row, checked(row))] : [] }), trackedCount, partial: failures.length > 0 }
    },
    async preferences(memberId: string): Promise<NotificationPreferences> {
      return { newEpisodes: Boolean((await prisma.notificationPreference.findUnique({ where: { memberId } }))?.enabledAt) }
    },
    async setPreferences(memberId: string, newEpisodes: boolean): Promise<NotificationPreferences> {
      return prisma.$transaction(async tx => {
        await lock(tx, memberId)
        if (!await tx.member.findFirst({ where: { id: memberId, status: 'ACTIVE' } })) throw new ApiError('UNAUTHENTICATED', 'Sign in to update notifications.')
        const existing = await tx.notificationPreference.findUnique({ where: { memberId } })
        const enabledAt = newEpisodes ? existing?.enabledAt ?? clock() : null
        await tx.notificationPreference.upsert({ where: { memberId }, create: { memberId, enabledAt }, update: { enabledAt } })
        return { newEpisodes }
      })
    },
    async notifications(memberId: string, query: NotificationQuery): Promise<NotificationPage> {
      const unreadCount = await prisma.releaseNotification.count({ where: { memberId, readAt: null } })
      const cursor = query.cursor ? await prisma.releaseNotification.findFirst({ where: { memberId, id: query.cursor } }) : null
      if (query.cursor && !cursor) return { items: [], nextCursor: null, unreadCount }
      const rows = await prisma.releaseNotification.findMany({ where: { memberId, ...(query.filter === 'unread' ? { readAt: null } : {}),
        ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}) },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: query.limit + 1, include: { episode: true } })
      const page = rows.slice(0, query.limit)
      return { items: page.map(row => ({ id: row.id, episode: episodeView(row.episode, row.checkedAt), createdAt: row.createdAt.toISOString(), readAt: row.readAt?.toISOString() ?? null })), unreadCount,
        nextCursor: rows.length > query.limit ? page.at(-1)!.id : null }
    },
    async markRead(memberId: string, id?: string) {
      const result = await prisma.releaseNotification.updateMany({ where: { memberId, ...(id ? { id } : {}), readAt: null }, data: { readAt: clock() } })
      if (id && result.count === 0 && !await prisma.releaseNotification.findFirst({ where: { memberId, id } })) throw new ApiError('NOT_FOUND', 'Notification not found.')
    },
    async claimTitle() {
      return prisma.$transaction(async tx => {
        await lock(tx, 'release-catalog')
        const now = clock()
        const rows = await tx.$queryRaw<{ catalogKind: 'SERIES' | 'ANIME'; tmdbId: number }[]>`SELECT r."catalogKind",r."tmdbId" FROM "ReleaseTitle" r
          WHERE r."refreshAfter"<=${now} AND (r."leaseUntil" IS NULL OR r."leaseUntil"<=${now})
          AND EXISTS (SELECT 1 FROM "ReleaseTracking" t WHERE t."catalogKind"=r."catalogKind" AND t."tmdbId"=r."tmdbId")
          ORDER BY r."refreshAfter",r."catalogKind",r."tmdbId" LIMIT 1`
        const ref = rows[0]
        if (!ref) return null
        const leaseToken = randomUUID()
        await tx.releaseTitle.update({ where: { catalogKind_tmdbId: ref }, data: { leaseToken, leaseUntil: new Date(now.getTime() + 120_000) } })
        return { ...ref, leaseToken }
      })
    },
    async refreshTitle(ref: { catalogKind: 'SERIES' | 'ANIME'; tmdbId: number; leaseToken: string }, episodes: EpisodeView[] | null) {
      await prisma.$transaction(async tx => {
        await lock(tx, 'release-catalog')
        const now = clock()
        const held = await tx.releaseTitle.findFirst({ where: { ...ref, leaseUntil: { gt: now } } })
        if (!held) return
        if (episodes) await tx.releaseEpisode.updateMany({ where: { catalogKind: ref.catalogKind, tmdbId: ref.tmdbId,
          ...(episodes.length ? { NOT: { OR: episodes.map(value => ({ season: value.ref.season, episode: value.ref.episode })) } } : {}) }, data: { catalogCurrent: false, checkedAt: null } })
        if (episodes) for (const value of episodes) {
          const key = { catalogKind: ref.catalogKind, tmdbId: ref.tmdbId, season: value.ref.season, episode: value.ref.episode }
          const metadata = { title: value.title, episodeTitle: value.episodeTitle, imageUrl: value.imageUrl, releasedAt: new Date(value.releasedAt), datePrecision: value.datePrecision, catalogCurrent: true }
          await tx.releaseEpisode.upsert({ where: { catalogKind_tmdbId_season_episode: key }, create: { ...key, ...metadata, verifyAfter: now }, update: metadata })
        }
        await tx.releaseTitle.update({ where: { catalogKind_tmdbId: { catalogKind: ref.catalogKind, tmdbId: ref.tmdbId } },
          data: { leaseToken: null, leaseUntil: null, failed: !episodes, refreshAfter: new Date(now.getTime() + 30 * 60_000) } })
      })
    },
    async claimCheck(): Promise<ReleaseProbeJob | null> {
      return prisma.$transaction(async tx => {
        await lock(tx, 'release-browser')
        const now = clock()
        await tx.releaseCheck.updateMany({ where: { finishedAt: null, leaseUntil: { lte: now } }, data: { finishedAt: now, failure: 'timeout' } })
        if (await tx.releaseCheck.count({ where: { finishedAt: null } }) || await tx.releaseCheck.count({ where: { startedAt: { gt: new Date(now.getTime() - 60 * 60_000) } } }) >= 30) return null
        const ids = await tx.$queryRaw<{ id: string }[]>`SELECT e."id" FROM "ReleaseEpisode" e WHERE e."catalogCurrent"=TRUE AND e."verifyAfter"<=${now}
          AND e."releasedAt">=${new Date(now.getTime() - WEEK_MS)} AND e."releasedAt"<=${now}
          AND EXISTS (SELECT 1 FROM "ReleaseTracking" t WHERE t."catalogKind"=e."catalogKind" AND t."tmdbId"=e."tmdbId")
          ORDER BY e."verifyAfter", e."releasedAt" DESC, e."id" LIMIT 1`
        if (!ids[0]) return null
        const episode = await tx.releaseEpisode.findUniqueOrThrow({ where: { id: ids[0].id } })
        const leaseToken = randomUUID(), leaseUntil = new Date(now.getTime() + 90_000)
        const run = await tx.releaseCheck.create({ data: { episodeId: episode.id, leaseToken, leaseUntil, startedAt: now } })
        // A crash cannot keep retrying immediately or preserve unverified freshness.
        await tx.releaseEpisode.update({ where: { id: episode.id }, data: { verifyAfter: new Date(now.getTime() + 60 * 60_000), checkedAt: null } })
        return { id: run.id, leaseToken, expiresAt: leaseUntil.toISOString(), ref: episodeView(episode, null).ref }
      })
    },
    async nextAttempt(id: string, token: string, candidates: readonly string[]) {
      return prisma.$transaction(async tx => {
        await lock(tx, 'release-browser')
        const run = await job(tx, id, token)
        if (run.attempts >= 2 || !candidates.length) return null
        const providerId = candidates[run.episode.providerCursor % candidates.length]!
        await tx.releaseCheck.update({ where: { id }, data: { attempts: { increment: 1 }, providerId, revision: null } })
        await tx.releaseEpisode.update({ where: { id: run.episodeId }, data: { providerCursor: { increment: 1 } } })
        return { providerId, ref: episodeView(run.episode, null).ref }
      })
    },
    async setSource(id: string, token: string, source: ReleaseProbeSource) {
      await prisma.$transaction(async tx => {
        await lock(tx, 'release-browser')
        const run = await job(tx, id, token)
        if (run.providerId !== source.providerId) throw new ApiError('CONFLICT', 'Playback check changed.')
        await tx.releaseCheck.update({ where: { id }, data: { revision: source.revision, region: source.region, audioLanguage: source.audioLanguage } })
      })
    },
    async finish(id: string, token: string, passed: boolean, sourceCurrent: (run: ReleaseCheck) => boolean, failure?: string, evidence?: ReleaseProbeEvidence) {
      return prisma.$transaction(async tx => {
        await lock(tx, 'release-browser')
        await lock(tx, 'release-catalog')
        const run = await job(tx, id, token), now = clock()
        const success = passed && run.episode.catalogCurrent && run.episode.releasedAt <= now
          && run.episode.releasedAt.getTime() >= now.getTime() - WEEK_MS && Boolean(run.revision) && sourceCurrent(run)
        await tx.releaseCheck.update({ where: { id }, data: { finishedAt: now, passed: success, failure: success ? null : failure ?? 'media', ...(evidence ? { evidence } : {}) } })
        await tx.releaseEpisode.update({ where: { id: run.episodeId }, data: { checkedAt: success ? now : null,
          ...(success ? { providerId: run.providerId, revision: run.revision, region: run.region, audioLanguage: run.audioLanguage } : {}),
          verifyAfter: new Date(now.getTime() + (success ? CHECK_FRESH_MS : 60 * 60_000)) } })
        if (!success) return { passed: false, notificationsInserted: 0 }
        // Serialize with opt-out, save/removal and tombstoning. The following
        // INSERT takes a fresh READ COMMITTED snapshot after these locks.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(t."memberId")) FROM "ReleaseTracking" t
          JOIN "NotificationPreference" p ON p."memberId"=t."memberId" AND p."enabledAt" IS NOT NULL
          WHERE t."catalogKind"=${run.episode.catalogKind}::"CatalogKind" AND t."tmdbId"=${run.episode.tmdbId} ORDER BY t."memberId"`
        if (clock() >= run.leaseUntil) throw new ApiError('NOT_FOUND', 'This playback check has expired.')
        // One insert statement rechecks current tracking, preferences and completion.
        const notificationsInserted = await tx.$executeRaw`INSERT INTO "ReleaseNotification" ("id","memberId","episodeId","createdAt","checkedAt")
          SELECT gen_random_uuid()::text,t."memberId",${run.episodeId},${now},${now} FROM "ReleaseTracking" t
          JOIN "NotificationPreference" p ON p."memberId"=t."memberId" JOIN "Member" m ON m."id"=t."memberId" AND m."status"='ACTIVE'
          WHERE t."catalogKind"=${run.episode.catalogKind}::"CatalogKind" AND t."tmdbId"=${run.episode.tmdbId}
          AND p."enabledAt" IS NOT NULL AND ${run.episode.releasedAt}>=p."enabledAt" AND ${run.episode.releasedAt}>=t."trackedSince"
          AND NOT EXISTS (SELECT 1 FROM "PlaybackProgress" w WHERE w."memberId"=t."memberId" AND w."catalogKind"=t."catalogKind" AND w."tmdbId"=t."tmdbId" AND w."season"=${run.episode.season} AND w."episode"=${run.episode.episode} AND w."completed"=TRUE)
          AND NOT EXISTS (SELECT 1 FROM "WatchHistoryEntry" h WHERE h."memberId"=t."memberId" AND h."catalogKind"=t."catalogKind" AND h."tmdbId"=t."tmdbId" AND h."season"=${run.episode.season} AND h."episode"=${run.episode.episode})
          ON CONFLICT ("memberId","episodeId") DO NOTHING`
        return { passed: true, notificationsInserted }
      })
    },
  }
}
export type ReleaseRepository = ReturnType<typeof createReleaseRepository>
