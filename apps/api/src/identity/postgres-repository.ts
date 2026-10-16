import { PrismaClient, type Prisma } from '../../generated/prisma/client.js'
import { episodeView } from '../releases/repository.ts'
import { avatarStyleSchema, MAX_MEMBER_FAVORITES, experiencePreferencesSchema } from '@consumit/contracts'

import type { IdentityRepository, IdentityRecord } from './repository.ts'

type IdentityRow = Prisma.MemberGetPayload<{ include: { credential: true; profile: true } }>

const includeIdentity = { credential: true, profile: true } as const

function isUniqueFailure(error: unknown): boolean {
  return error instanceof Error && 'code' in error && (error as { code?: string }).code === 'P2002'
}

const catalogKind = (value: 'MOVIE' | 'SERIES' | 'ANIME') => value === 'SERIES' ? 'series' as const : value === 'ANIME' ? 'anime' as const : 'movie' as const
const dataOrigin = (value: 'NATIVE' | 'LETTERBOXD') => value === 'LETTERBOXD' ? 'letterboxd' as const : 'native' as const
const calendarDay = (value: Date) => value.toISOString().slice(0, 10)

function toRecord(row: IdentityRow): IdentityRecord {
  if (!row.profile) throw new Error(`Member ${row.id} is missing its profile.`)
  return {
    authVersion: row.authVersion,
    createdAt: row.createdAt,
    email: row.email,
    emailVerifiedAt: row.emailVerifiedAt,
    id: row.id,
    passwordHash: row.credential?.passwordHash ?? null,
    profile: {
      avatarStyle: avatarStyleSchema.catch('dusk').parse(row.profile.avatarStyle),
      avatarUrl: row.profile.avatarUrl,
      bannerUrl: row.profile.bannerUrl,
      bio: row.profile.bio,
      displayName: row.profile.displayName,
      location: row.profile.location,
      username: row.profile.username,
      usernameChangedAt: row.profile.usernameChangedAt,
      visibility: row.profile.visibility === 'public' ? 'public' : 'private',
    },
    role: row.role === 'ADMIN' ? 'ADMIN' : 'MEMBER',
    status: row.status,
  }
}

export function createPostgresIdentityRepository(prisma: PrismaClient): IdentityRepository {
  return {
    async bumpAuthVersion(memberId) {
      const member = await prisma.member.findFirst({ where: { id: memberId, status: 'ACTIVE' } })
      if (!member) return null
      return toRecord(await prisma.member.update({
        data: { authVersion: { increment: 1 } },
        include: includeIdentity,
        where: { id: memberId },
      }))
    },
    async changePassword(memberId, passwordHash) {
      const member = await prisma.member.findFirst({ where: { id: memberId, status: 'ACTIVE' } })
      if (!member) return null
      return prisma.$transaction(async (tx) => {
        await tx.credential.update({ data: { passwordHash }, where: { memberId } })
        return toRecord(await tx.member.update({
          data: { authVersion: { increment: 1 } },
          include: includeIdentity,
          where: { id: memberId },
        }))
      })
    },
    async createVerifiedAccount(input) {
      try {
        return await prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`consumit:username:${input.username}`}))`
          const alias = await tx.usernameAlias.findUnique({ where: { username: input.username } })
          const profile = await tx.profile.findUnique({ where: { username: input.username } })
          if (alias || profile) throw new Error('IDENTITY_USERNAME_CONFLICT')
          return toRecord(await tx.member.create({
            data: {
              credential: { create: { passwordHash: input.passwordHash } },
              createdAt: input.createdAt,
              email: input.email,
              emailVerifiedAt: input.createdAt,
              profile: { create: { username: input.username, usernameChangedAt: input.createdAt } },
            },
            include: includeIdentity,
          }))
        })
      } catch (error) {
        if (error instanceof Error && error.message === 'IDENTITY_USERNAME_CONFLICT') throw error
        if (isUniqueFailure(error)) throw new Error('IDENTITY_EMAIL_CONFLICT', { cause: error })
        throw error
      }
    },
    async exportMember(memberId, exportedAt) {
      const [preference, notifications, experience] = await Promise.all([
        prisma.notificationPreference.findUnique({ where: { memberId } }),
        prisma.releaseNotification.findMany({ where: { memberId }, include: { episode: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }),
        prisma.$queryRaw<{ preferences: unknown }[]>`SELECT "preferences" FROM "ExperiencePreference" WHERE "memberId"=${memberId}`,
      ])
      const [row, watched, diary, saved, favorites, lists, ratings, reviews, watchHistory, hiddenContinue, recommendationDismissals] = await Promise.all([
        prisma.member.findFirst({ include: includeIdentity, where: { id: memberId, status: 'ACTIVE' } }),
        prisma.watchedTitle.findMany({ where: { memberId } }),
        prisma.diaryEntry.findMany({ orderBy: { watchedOn: 'desc' }, where: { memberId } }),
        prisma.savedTitle.findMany({ where: { memberId } }),
        prisma.favorite.findMany({ orderBy: { position: 'asc' }, take: MAX_MEMBER_FAVORITES, where: { memberId } }),
        prisma.memberList.findMany({ include: { _count: { select: { items: true } } }, where: { memberId } }),
        prisma.rating.findMany({ where: { memberId } }),
        prisma.review.findMany({ orderBy: { reviewedOn: 'desc' }, where: { memberId } }),
        prisma.watchHistoryEntry.findMany({ orderBy: [{ completedAt: 'desc' }, { id: 'desc' }], where: { memberId } }),
        prisma.playbackProgress.findMany({ where: { memberId, hiddenFromContinueAt: { not: null } }, distinct: ['catalogKind', 'tmdbId'], orderBy: { hiddenFromContinueAt: 'desc' } }),
        prisma.recommendationDismissal.findMany({ where: { memberId }, orderBy: { createdAt: 'desc' } }),
      ])
      if (!row) return null
      const member = toRecord(row)
      return {
        exportedAt: exportedAt.toISOString(),
        continueWatchingDismissals: hiddenContinue.map(item => ({ kind: catalogKind(item.catalogKind), id: item.tmdbId, hiddenAt: item.hiddenFromContinueAt!.toISOString() })),
        recommendationDismissals: recommendationDismissals.map(item => ({ kind: catalogKind(item.catalogKind), id: item.tmdbId })),
        experiencePreferences: experience[0] ? experiencePreferencesSchema.parse(experience[0].preferences) : null,
        notificationPreferences: { newEpisodes: Boolean(preference?.enabledAt) },
        notifications: notifications.map(row => ({ id: row.id, episode: episodeView(row.episode, row.checkedAt), createdAt: row.createdAt.toISOString(), readAt: row.readAt?.toISOString() ?? null })),
        library: {
          diary: diary.map((item) => ({ ...(item.episode > 0 ? { ...(item.catalogKind === 'SERIES' || item.season > 0 ? { season: item.season } : {}), episode: item.episode } : {}), entryId: item.id, id: item.tmdbId, kind: catalogKind(item.catalogKind), origin: dataOrigin(item.origin), rewatch: item.rewatch, sourceKey: item.sourceKey, tags: item.tags, watchedOn: calendarDay(item.watchedOn) })),
          favorites: favorites.map((item, index) => ({ id: item.tmdbId, kind: catalogKind(item.catalogKind), origin: dataOrigin(item.origin), position: index + 1, sourceKey: item.sourceKey })),
          lists: lists.map((item) => ({ description: item.description, id: item.id, itemCount: item._count.items, name: item.name, origin: dataOrigin(item.origin), slug: item.slug, visibility: item.visibility === 'public' ? 'public' as const : 'private' as const })),
          saved: saved.map((item) => ({ id: item.tmdbId, kind: catalogKind(item.catalogKind), origin: dataOrigin(item.origin), sourceKey: item.sourceKey })),
          watched: watched.map((item) => ({ id: item.tmdbId, kind: catalogKind(item.catalogKind), origin: dataOrigin(item.origin), sourceKey: item.sourceKey })),
        },
        watchHistory: watchHistory.map((item) => ({
          completedAt: item.completedAt.toISOString(),
          entryId: item.id,
          id: item.tmdbId,
          kind: catalogKind(item.catalogKind),
          ...(item.catalogKind === 'SERIES' || item.season > 0 ? { season: item.season } : {}),
          ...(item.episode > 0 ? { episode: item.episode } : {}),
        })),
        member: {
          createdAt: member.createdAt.toISOString(),
          displayName: member.profile.displayName,
          email: member.email,
          emailVerified: member.emailVerifiedAt !== null,
          username: member.profile.username,
          avatarStyle: member.profile.avatarStyle,
          avatarUrl: member.profile.avatarUrl,
          id: member.id,
          role: member.role === 'ADMIN' ? 'admin' as const : 'member' as const,
        },
        profile: {
          avatarStyle: member.profile.avatarStyle,
          avatarUrl: member.profile.avatarUrl,
          bannerUrl: member.profile.bannerUrl,
          bio: member.profile.bio,
          displayName: member.profile.displayName,
          location: member.profile.location,
          username: member.profile.username,
          usernameChangedAt: member.profile.usernameChangedAt?.toISOString() ?? null,
          visibility: member.profile.visibility,
        },
        ratings: ratings.map((item) => ({ id: item.tmdbId, kind: catalogKind(item.catalogKind), origin: dataOrigin(item.origin), sourceKey: item.sourceKey, value: item.value })),
        reviews: reviews.map((item) => ({ body: item.body, id: item.tmdbId, kind: catalogKind(item.catalogKind), origin: dataOrigin(item.origin), reviewedOn: item.reviewedOn ? calendarDay(item.reviewedOn) : null, reviewId: item.id, sourceKey: item.sourceKey, tags: item.tags })),
      }
    },
    async findByEmail(email) {
      const row = await prisma.member.findUnique({ include: includeIdentity, where: { email } })
      return row ? toRecord(row) : null
    },
    async findById(memberId) {
      const row = await prisma.member.findUnique({ include: includeIdentity, where: { id: memberId } })
      return row ? toRecord(row) : null
    },
    async findByUsername(username) {
      const current = await prisma.member.findFirst({
        include: includeIdentity,
        where: { profile: { is: { username } }, status: 'ACTIVE' },
      })
      if (current) return { canonical: true, record: toRecord(current) }
      const alias = await prisma.usernameAlias.findUnique({
        include: { member: { include: includeIdentity } },
        where: { username },
      })
      return alias?.member.status === 'ACTIVE'
        ? { canonical: false, record: toRecord(alias.member) }
        : null
    },
    async isUsernameAvailable(username) {
      const [profile, alias] = await Promise.all([
        prisma.profile.findUnique({ select: { memberId: true }, where: { username } }),
        prisma.usernameAlias.findUnique({ select: { memberId: true }, where: { username } }),
      ])
      return !profile && !alias
    },
    async listAll(limit = 50, offset = 0) {
      const [rows, total] = await Promise.all([
        prisma.member.findMany({ include: includeIdentity, where: { status: 'ACTIVE' }, orderBy: { createdAt: 'desc' }, skip: offset, take: limit }),
        prisma.member.count({ where: { status: 'ACTIVE' } }),
      ])
      return { members: rows.map(toRecord), total }
    },
    async setRole(memberId, role) {
      const member = await prisma.member.findFirst({ where: { id: memberId, status: 'ACTIVE' } })
      if (!member) return null
      return toRecord(await prisma.member.update({
        data: { role },
        include: includeIdentity,
        where: { id: memberId },
      }))
    },
    async tombstone(memberId) {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${memberId}))`
        const member = await tx.member.findFirst({ where: { id: memberId, status: 'ACTIVE' } })
        if (!member) return
        const profile = await tx.profile.findUnique({ where: { memberId } })
        if (profile) {
          await tx.usernameAlias.upsert({
            create: { memberId, username: profile.username },
            update: {},
            where: { username: profile.username },
          })
        }
        // Keep only the anonymized member tombstone and permanent username
        // aliases. Updating Member does not trigger its on-delete cascades, so
        // every member-owned record must be removed explicitly here.
        await tx.importBatch.deleteMany({ where: { memberId } })
        await tx.releaseNotification.deleteMany({ where: { memberId } })
        await tx.notificationPreference.deleteMany({ where: { memberId } })
        await tx.$executeRaw`DELETE FROM "ExperiencePreference" WHERE "memberId"=${memberId}`
        await tx.releaseTracking.deleteMany({ where: { memberId } })
        await tx.memberList.deleteMany({ where: { memberId } })
        await tx.favorite.deleteMany({ where: { memberId } })
        await tx.review.deleteMany({ where: { memberId } })
        await tx.rating.deleteMany({ where: { memberId } })
        await tx.diaryEntry.deleteMany({ where: { memberId } })
        await tx.savedTitle.deleteMany({ where: { memberId } })
        await tx.watchedTitle.deleteMany({ where: { memberId } })
        await tx.watchHistoryEntry.deleteMany({ where: { memberId } })
        await tx.playbackProgress.deleteMany({ where: { memberId } })
        await tx.recommendationDismissal.deleteMany({ where: { memberId } })
        await tx.credential.deleteMany({ where: { memberId } })
        await tx.profile.deleteMany({ where: { memberId } })
        await tx.member.update({
          data: {
            authVersion: { increment: 1 },
            deletedAt: new Date(),
            email: `deleted+${memberId}@invalid.consumit`,
            emailVerifiedAt: null,
            status: 'DELETED',
          },
          where: { id: memberId },
        })
      })
    },
    async updateProfile(memberId, input, changedAt) {
      try {
        return await prisma.$transaction(async (tx) => {
          const current = await tx.profile.findUnique({ where: { memberId } })
          if (!current) return null
          if (input.username && input.username !== current.username) {
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`consumit:username:${input.username}`}))`
            const [profile, alias] = await Promise.all([
              tx.profile.findUnique({ select: { memberId: true }, where: { username: input.username } }),
              tx.usernameAlias.findUnique({ select: { memberId: true }, where: { username: input.username } }),
            ])
            if (profile || alias) throw new Error('IDENTITY_USERNAME_CONFLICT')
            await tx.usernameAlias.create({ data: { memberId, username: current.username } })
          }
          const row = await tx.member.update({
            data: {
              profile: {
                update: {
                  ...(input.avatarStyle !== undefined ? { avatarStyle: input.avatarStyle } : {}),
                  ...(input.avatarUrl !== undefined ? { avatarUrl: input.avatarUrl } : {}),
                  ...(input.bannerUrl !== undefined ? { bannerUrl: input.bannerUrl } : {}),
                  ...(input.bio !== undefined ? { bio: input.bio, bioOrigin: 'NATIVE' as const } : {}),
                  ...(input.displayName !== undefined ? { displayName: input.displayName, displayNameOrigin: 'NATIVE' as const } : {}),
                  ...(input.location !== undefined ? { location: input.location, locationOrigin: 'NATIVE' as const } : {}),
                  ...(input.username && input.username !== current.username ? { username: input.username, usernameChangedAt: changedAt } : {}),
                  ...(input.visibility !== undefined ? { visibility: input.visibility } : {}),
                },
              },
            },
            include: includeIdentity,
            where: { id: memberId },
          })
          return toRecord(row)
        })
      } catch (error) {
        if (error instanceof Error && error.message === 'IDENTITY_USERNAME_CONFLICT') throw error
        if (isUniqueFailure(error)) throw new Error('IDENTITY_USERNAME_CONFLICT', { cause: error })
        throw error
      }
    },
  }
}
