import type {
  CatalogKind,
  CatalogRef,
  CreateDiaryEntryRequest,
  CreateReviewRequest,
  DiaryEntry,
  MemberLibrary,
  MemberListDetail,
  MemberProfileData,
  MemberRating,
  MemberReview,
  MemberTitleRecord,
  PlaybackProgress,
  ProgressRef,
  ProgressWriteRequest,
  RecordOrigin,
  UpdateDiaryEntryRequest,
  UpdateMemberListRequest,
  UpdateMemberReviewRequest,
} from '@consumit/contracts'
import { avatarStyleSchema } from '@consumit/contracts'

import { PrismaClient } from '../../generated/prisma/client.js'
import type { MemberData } from './member-data.ts'

function kind(value: 'MOVIE' | 'SERIES'): CatalogKind {
  return value === 'SERIES' ? 'series' : 'movie'
}

function origin(value: 'NATIVE' | 'LETTERBOXD'): RecordOrigin {
  return value === 'LETTERBOXD' ? 'letterboxd' : 'native'
}

function day(value: Date): string {
  return value.toISOString().slice(0, 10)
}

// Backward moves within this window are coalesced into the stored position:
// periodic writers emit near-duplicate positions and only real seeks move back.
const BACKWARD_TOLERANCE_SECONDS = 5

function progressKey(memberId: string, ref: ProgressRef) {
  return {
    catalogKind: ref.kind === 'series' ? 'SERIES' : 'MOVIE',
    episode: ref.episode ?? 0,
    memberId,
    season: ref.season ?? 0,
    tmdbId: ref.id,
  } as const
}

function ratingKey(memberId: string, ref: CatalogRef) {
  return {
    catalogKind: ref.kind === 'series' ? 'SERIES' : 'MOVIE',
    memberId,
    tmdbId: ref.id,
  } as const
}

function ratingView(row: { catalogKind: 'MOVIE' | 'SERIES'; origin: 'NATIVE' | 'LETTERBOXD'; sourceKey: string | null; tmdbId: number; value: number }): MemberRating {
  return {
    id: row.tmdbId,
    kind: kind(row.catalogKind),
    origin: origin(row.origin),
    sourceKey: row.sourceKey,
    value: row.value,
  }
}

function likeKey(memberId: string, ref: CatalogRef) {
  return {
    catalogKind: ref.kind === 'series' ? 'SERIES' : 'MOVIE',
    memberId,
    tmdbId: ref.id,
  } as const
}

function likeView(row: { catalogKind: 'MOVIE' | 'SERIES'; origin: 'NATIVE' | 'LETTERBOXD'; sourceKey: string | null; tmdbId: number }): MemberTitleRecord {
  return {
    id: row.tmdbId,
    kind: kind(row.catalogKind),
    origin: origin(row.origin),
    sourceKey: row.sourceKey,
  }
}

function progressView(row: { catalogKind: 'MOVIE' | 'SERIES'; completed: boolean; durationSeconds: number | null; episode: number; positionSeconds: number; season: number; tmdbId: number; updatedAt: Date }): PlaybackProgress {
  return {
    completed: row.completed,
    durationSeconds: row.durationSeconds,
    ...(row.episode ? { episode: row.episode } : {}),
    id: row.tmdbId,
    kind: kind(row.catalogKind),
    positionSeconds: row.positionSeconds,
    ...(row.season ? { season: row.season } : {}),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function profileView(profile: { avatarStyle: string; avatarUrl: string | null; bannerUrl: string | null; bio: string | null; displayName: string | null; location: string | null; username: string; usernameChangedAt: Date | null; visibility: string }, createdAt: Date) {
  const next = profile.usernameChangedAt ? new Date(profile.usernameChangedAt.getTime() + 30 * 24 * 60 * 60 * 1000) : null
  return {
    avatarStyle: avatarStyleSchema.catch('dusk').parse(profile.avatarStyle),
    avatarUrl: profile.avatarUrl,
    bannerUrl: profile.bannerUrl,
    bio: profile.bio,
    createdAt: createdAt.toISOString(),
    displayName: profile.displayName,
    location: profile.location,
    nextUsernameChangeAt: next && next > new Date() ? next.toISOString() : null,
    username: profile.username,
    usernameChangedAt: profile.usernameChangedAt?.toISOString() ?? null,
    visibility: profile.visibility === 'public' ? 'public' as const : 'private' as const,
  }
}

export function createPostgresMemberData(prisma: PrismaClient): MemberData {
  async function library(memberId: string): Promise<MemberLibrary> {
      const [watched, diary, saved, favorites, lists] = await Promise.all([
        prisma.watchedTitle.findMany({ orderBy: { updatedAt: 'desc' }, take: 5_000, where: { memberId } }),
        prisma.diaryEntry.findMany({ orderBy: [{ watchedOn: 'desc' }, { createdAt: 'desc' }], take: 5_000, where: { memberId } }),
        prisma.savedTitle.findMany({ orderBy: { createdAt: 'desc' }, take: 5_000, where: { memberId } }),
        prisma.favorite.findMany({ orderBy: { position: 'asc' }, take: 6, where: { memberId } }),
        prisma.memberList.findMany({ include: { _count: { select: { items: true } } }, orderBy: { updatedAt: 'desc' }, take: 1_000, where: { memberId } }),
      ])
      return {
        diary: diary.map((item) => ({ entryId: item.id, id: item.tmdbId, kind: kind(item.catalogKind), origin: origin(item.origin), rewatch: item.rewatch, sourceKey: item.sourceKey, tags: item.tags, watchedOn: day(item.watchedOn) })),
        favorites: favorites.map((item) => ({ id: item.tmdbId, kind: kind(item.catalogKind), origin: origin(item.origin), position: item.position, sourceKey: item.sourceKey })),
        lists: lists.map((list) => ({ description: list.description, id: list.id, itemCount: list._count.items, name: list.name, origin: origin(list.origin), slug: list.slug, visibility: list.visibility === 'public' ? 'public' : 'private' })),
        saved: saved.map((item) => ({ id: item.tmdbId, kind: kind(item.catalogKind), origin: origin(item.origin), sourceKey: item.sourceKey })),
        watched: watched.map((item) => ({ id: item.tmdbId, kind: kind(item.catalogKind), origin: origin(item.origin), sourceKey: item.sourceKey })),
      }
  }
  return {
    library,
    async list(slug, viewerMemberId): Promise<MemberListDetail | null> {
      const list = await prisma.memberList.findUnique({ include: { items: { orderBy: { position: 'asc' } }, member: { include: { profile: true } } }, where: { slug } })
      if (!list || !list.member.profile || (list.visibility !== 'public' && list.memberId !== viewerMemberId)) return null
      return {
        items: list.items.map((item) => ({ id: item.tmdbId, kind: kind(item.catalogKind), note: item.note, origin: origin(item.origin), position: item.position, sourceKey: item.sourceKey })),
        list: { description: list.description, id: list.id, itemCount: list.items.length, name: list.name, origin: origin(list.origin), slug: list.slug, visibility: list.visibility === 'public' ? 'public' : 'private' },
        owner: { displayName: list.member.profile.displayName, username: list.member.profile.username },
      }
    },
    async profile(username, viewerMemberId): Promise<MemberProfileData | null> {
      const current = await prisma.profile.findUnique({ select: { memberId: true }, where: { username } })
      const alias = current ? null : await prisma.usernameAlias.findUnique({ select: { memberId: true }, where: { username } })
      const memberId = current?.memberId ?? alias?.memberId
      if (!memberId) return null
      const visibleLists = memberId === viewerMemberId ? {} : { visibility: 'public' }
      const member = await prisma.member.findFirst({
        include: {
          diaryEntries: { orderBy: [{ watchedOn: 'desc' }, { createdAt: 'desc' }], take: 30 },
          favorites: { orderBy: { position: 'asc' }, take: 6 },
          lists: { include: { _count: { select: { items: true } } }, orderBy: { updatedAt: 'desc' }, take: 30, where: visibleLists },
          profile: true,
          reviews: { orderBy: [{ reviewedOn: 'desc' }, { createdAt: 'desc' }], take: 30 },
          _count: { select: { diaryEntries: true, lists: { where: visibleLists }, reviews: true, watchedTitles: true } },
        },
        where: { id: memberId, status: 'ACTIVE' },
      })
      if (!member?.profile || (member.profile.visibility !== 'public' && member.id !== viewerMemberId)) return null
      return {
        canonicalUsername: member.profile.username,
        diary: member.diaryEntries.map((item) => ({ entryId: item.id, id: item.tmdbId, kind: kind(item.catalogKind), origin: origin(item.origin), rewatch: item.rewatch, sourceKey: item.sourceKey, tags: item.tags, watchedOn: day(item.watchedOn) })),
        favorites: member.favorites.map((item) => ({ id: item.tmdbId, kind: kind(item.catalogKind), origin: origin(item.origin), position: item.position, sourceKey: item.sourceKey })),
        lists: member.lists.map((list) => ({ description: list.description, id: list.id, itemCount: list._count.items, name: list.name, origin: origin(list.origin), slug: list.slug, visibility: list.visibility === 'public' ? 'public' : 'private' })),
        profile: profileView(member.profile, member.createdAt),
        reviews: member.reviews.map((item) => ({ body: item.body, id: item.tmdbId, kind: kind(item.catalogKind), origin: origin(item.origin), reviewedOn: item.reviewedOn ? day(item.reviewedOn) : null, reviewId: item.id, sourceKey: item.sourceKey, tags: item.tags })),
        social: { followers: 0, following: 0 },
        statistics: { diaryEntries: member._count.diaryEntries, lists: member._count.lists, reviews: member._count.reviews, watched: member._count.watchedTitles },
      }
    },
    async setFavorites(memberId, favorites) {
      await prisma.$transaction(async (tx) => {
        await tx.favorite.deleteMany({ where: { memberId } })
        if (favorites.length) await tx.favorite.createMany({ data: favorites.map((favorite, index) => ({ catalogKind: favorite.kind === 'series' ? 'SERIES' : 'MOVIE', memberId, origin: 'NATIVE', position: index + 1, tmdbId: favorite.id })) })
      })
      return library(memberId)
    },
    async rating(memberId: string, ref): Promise<MemberRating | null> {
      const row = await prisma.rating.findUnique({ where: { memberId_catalogKind_tmdbId: ratingKey(memberId, ref) } })
      return row ? ratingView(row) : null
    },
    async setRating(memberId: string, ref, value: number): Promise<MemberRating> {
      const key = ratingKey(memberId, ref)
      const row = await prisma.rating.upsert({
        create: { ...key, importBatchId: null, origin: 'NATIVE', sourceKey: null, value },
        update: { importBatchId: null, origin: 'NATIVE', sourceKey: null, value },
        where: { memberId_catalogKind_tmdbId: key },
      })
      return ratingView(row)
    },
    async removeRating(memberId: string, ref): Promise<boolean> {
      const result = await prisma.rating.deleteMany({ where: { ...ratingKey(memberId, ref), origin: 'NATIVE' } })
      return result.count === 1
    },
    async setSaved(memberId, title, saved) {
      const catalogKind = title.kind === 'series' ? 'SERIES' : 'MOVIE'
      const key = { catalogKind, memberId, tmdbId: title.id } as const
      if (saved) {
        await prisma.savedTitle.upsert({
          create: { ...key, origin: 'NATIVE' },
          update: { importBatchId: null, origin: 'NATIVE', sourceKey: null },
          where: { memberId_catalogKind_tmdbId: key },
        })
      } else {
        await prisma.savedTitle.deleteMany({ where: key })
      }
      return library(memberId)
    },
    async setWatched(memberId, title, watched) {
      const catalogKind = title.kind === 'series' ? 'SERIES' : 'MOVIE'
      const key = { catalogKind, memberId, tmdbId: title.id } as const
      if (watched) {
        await prisma.watchedTitle.upsert({
          create: { ...key, origin: 'NATIVE' },
          update: { importBatchId: null, origin: 'NATIVE', sourceKey: null },
          where: { memberId_catalogKind_tmdbId: key },
        })
      } else {
        await prisma.watchedTitle.deleteMany({ where: key })
      }
      return library(memberId)
    },
    async like(memberId: string, ref: CatalogRef): Promise<MemberTitleRecord | null> {
      const row = await prisma.titleLike.findUnique({ where: { memberId_catalogKind_tmdbId: likeKey(memberId, ref) } })
      return row ? likeView(row) : null
    },
    async setLiked(memberId: string, ref: CatalogRef, liked: boolean): Promise<MemberTitleRecord | null> {
      const key = likeKey(memberId, ref)
      if (!liked) {
        await prisma.titleLike.deleteMany({ where: key })
        return null
      }
      const row = await prisma.titleLike.upsert({
        create: { ...key, importBatchId: null, origin: 'NATIVE', sourceKey: null },
        update: { importBatchId: null, origin: 'NATIVE', sourceKey: null },
        where: { memberId_catalogKind_tmdbId: key },
      })
      return likeView(row)
    },
    async removeLike(memberId: string, ref: CatalogRef): Promise<boolean> {
      const result = await prisma.titleLike.deleteMany({ where: likeKey(memberId, ref) })
      return result.count === 1
    },
    async createDiaryEntry(memberId: string, input: CreateDiaryEntryRequest): Promise<DiaryEntry> {
      const catalogKind = input.kind === 'series' ? 'SERIES' : 'MOVIE'
      const key = { catalogKind, memberId, tmdbId: input.id } as const
      const watchedOn = new Date(`${input.watchedOn}T00:00:00.000Z`)
      const row = await prisma.$transaction(async (tx) => {
        await tx.watchedTitle.upsert({
          create: { ...key, origin: 'NATIVE' },
          update: { importBatchId: null, origin: 'NATIVE', sourceKey: null },
          where: { memberId_catalogKind_tmdbId: key },
        })
        return tx.diaryEntry.create({
          data: {
            catalogKind,
            importBatchId: null,
            memberId,
            origin: 'NATIVE',
            rewatch: input.rewatch ?? false,
            sourceKey: null,
            tags: input.tags ?? [],
            tmdbId: input.id,
            watchedOn,
          },
        })
      })
      return {
        entryId: row.id,
        id: row.tmdbId,
        kind: kind(row.catalogKind),
        origin: origin(row.origin),
        rewatch: row.rewatch,
        sourceKey: row.sourceKey,
        tags: row.tags,
        watchedOn: input.watchedOn,
      }
    },
    async createReview(memberId: string, input: CreateReviewRequest): Promise<MemberReview> {
      const row = await prisma.review.create({
        data: {
          body: input.body,
          catalogKind: input.kind === 'series' ? 'SERIES' : 'MOVIE',
          importBatchId: null,
          memberId,
          origin: 'NATIVE',
          reviewedOn: input.reviewedOn ? new Date(`${input.reviewedOn}T00:00:00.000Z`) : null,
          sourceKey: null,
          tags: [],
          tmdbId: input.id,
        },
      })
      return {
        body: row.body,
        id: row.tmdbId,
        kind: kind(row.catalogKind),
        origin: origin(row.origin),
        reviewId: row.id,
        reviewedOn: row.reviewedOn ? day(row.reviewedOn) : null,
        sourceKey: row.sourceKey,
        tags: row.tags,
      }
    },
    async progress(memberId: string, ref: ProgressRef): Promise<PlaybackProgress | null> {
      const row = await prisma.playbackProgress.findUnique({ where: { memberId_catalogKind_tmdbId_season_episode: progressKey(memberId, ref) } })
      return row ? progressView(row) : null
    },
    async setProgress(memberId: string, input: ProgressWriteRequest): Promise<PlaybackProgress> {
      const key = progressKey(memberId, input)
      const current = await prisma.playbackProgress.findUnique({ where: { memberId_catalogKind_tmdbId_season_episode: key } })
      const completed = input.completed ?? current?.completed ?? false
      let positionSeconds = input.positionSeconds
      if (current && !completed && positionSeconds < current.positionSeconds && current.positionSeconds - positionSeconds <= BACKWARD_TOLERANCE_SECONDS) {
        positionSeconds = current.positionSeconds
      }
      const row = await prisma.playbackProgress.upsert({
        create: { ...key, completed, durationSeconds: input.durationSeconds ?? null, positionSeconds },
        update: { completed, ...(input.durationSeconds !== undefined ? { durationSeconds: input.durationSeconds } : {}), positionSeconds },
        where: { memberId_catalogKind_tmdbId_season_episode: key },
      })
      return progressView(row)
    },
    async updateDiary(memberId: string, entryId: string, changes: UpdateDiaryEntryRequest) {
      const result = await prisma.diaryEntry.updateMany({
        data: {
          importBatchId: null,
          origin: 'NATIVE',
          ...(changes.rewatch !== undefined ? { rewatch: changes.rewatch } : {}),
          sourceKey: null,
          ...(changes.tags !== undefined ? { tags: changes.tags } : {}),
          ...(changes.watchedOn ? { watchedOn: new Date(`${changes.watchedOn}T00:00:00.000Z`) } : {}),
        },
        where: { id: entryId, memberId },
      })
      return result.count === 1
    },
    async updateList(memberId: string, listId: string, changes: UpdateMemberListRequest) {
      return prisma.$transaction(async (tx) => {
        const current = await tx.memberList.findFirst({ select: { id: true }, where: { id: listId, memberId } })
        if (!current) return false
        await tx.memberList.update({
          data: {
            ...(changes.description !== undefined ? { description: changes.description } : {}),
            importBatchId: null,
            ...(changes.name !== undefined ? { name: changes.name } : {}),
            origin: 'NATIVE',
            sourceKey: null,
            ...(changes.visibility !== undefined ? { visibility: changes.visibility } : {}),
          },
          where: { id: listId },
        })
        await tx.listItem.updateMany({
          data: { origin: 'NATIVE', sourceKey: null },
          where: { listId },
        })
        return true
      })
    },
    async updateReview(memberId: string, reviewId: string, changes: UpdateMemberReviewRequest) {
      const result = await prisma.review.updateMany({
        data: {
          ...(changes.body !== undefined ? { body: changes.body } : {}),
          importBatchId: null,
          origin: 'NATIVE',
          ...(changes.reviewedOn === undefined ? {} : { reviewedOn: changes.reviewedOn === null ? null : new Date(`${changes.reviewedOn}T00:00:00.000Z`) }),
          sourceKey: null,
          ...(changes.tags !== undefined ? { tags: changes.tags } : {}),
        },
        where: { id: reviewId, memberId },
      })
      return result.count === 1
    },
  }
}
