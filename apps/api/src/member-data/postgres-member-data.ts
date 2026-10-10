import type {
  CatalogKind,
  CatalogRef,
  CreateMemberListRequest,
  CreateDiaryEntryRequest,
  CreateReviewRequest,
  DiaryEntry,
  MemberLibraryCollection,
  MemberLibraryCollectionPage,
  MemberLibrarySnapshot,
  MemberListDetail,
  MemberProfileData,
  MemberProfileArchiveCursor,
  MemberProfileArchivePage,
  MemberRating,
  MemberRatingPage,
  MemberReview,
  MemberTitleRecord,
  MemberTitleState,
  PlaybackProgress,
  ProgressRef,
  ProgressWriteRequest,
  RecordOrigin,
  TitleReviewsPage,
  TitleReviewSort,
  UpdateDiaryEntryRequest,
  UpdateMemberListRequest,
  UpdateMemberListContentRequest,
  UpdateMemberReviewRequest,
  WatchHistoryPage,
} from '@consumit/contracts'
import { avatarStyleSchema, MAX_MEMBER_FAVORITES, memberRatingCursorSchema } from '@consumit/contracts'

import { PrismaClient } from '../../generated/prisma/client.js'
import { requireActiveTrackingMember, syncReleaseTracking } from '../releases/tracking.ts'
import type { MemberData } from './member-data.ts'

/** Stored CatalogKind rows. ANIME keeps AniList ids in their own namespace:
 *  an anime id and a TMDB movie id routinely share the same number, and the
 *  unique member-data keys must never collide across them. */
type StoredKind = 'MOVIE' | 'SERIES' | 'ANIME'

function kind(value: StoredKind): CatalogKind {
  if (value === 'SERIES') return 'series'
  if (value === 'ANIME') return 'anime'
  return 'movie'
}

function storedKind(value: CatalogKind): StoredKind {
  if (value === 'series') return 'SERIES'
  if (value === 'anime') return 'ANIME'
  return 'MOVIE'
}

function origin(value: 'NATIVE' | 'LETTERBOXD'): RecordOrigin {
  return value === 'LETTERBOXD' ? 'letterboxd' : 'native'
}

function day(value: Date): string {
  return value.toISOString().slice(0, 10)
}

function diaryEpisodeFields(row: { catalogKind: StoredKind; episode: number; season: number }) {
  if (row.episode <= 0) return {}
  return {
    ...(row.catalogKind === 'SERIES' || row.season > 0 ? { season: row.season } : {}),
    episode: row.episode,
  }
}

function listSlug(value: string): string {
  const base = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70)
  return base || 'list'
}

// Backward moves within this window are coalesced into the stored position:
// periodic writers emit near-duplicate positions and only real seeks move back.
const BACKWARD_TOLERANCE_SECONDS = 5

// One page of the public title-reviews feed. Only members with a public
// profile appear; private-profile reviews stay invisible to everyone else.
const TITLE_REVIEWS_PAGE_SIZE = 10

function progressKey(memberId: string, ref: ProgressRef) {
  return {
    catalogKind: storedKind(ref.kind),
    episode: ref.episode ?? 0,
    memberId,
    season: ref.season ?? 0,
    tmdbId: ref.id,
  } as const
}

function ratingKey(memberId: string, ref: CatalogRef) {
  return {
    catalogKind: storedKind(ref.kind),
    memberId,
    tmdbId: ref.id,
  } as const
}

function ratingView(row: { catalogKind: StoredKind; origin: 'NATIVE' | 'LETTERBOXD'; sourceKey: string | null; tmdbId: number; value: number }): MemberRating {
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
    catalogKind: storedKind(ref.kind),
    memberId,
    tmdbId: ref.id,
  } as const
}

function likeView(row: { catalogKind: StoredKind; origin: 'NATIVE' | 'LETTERBOXD'; sourceKey: string | null; tmdbId: number }): MemberTitleRecord {
  return {
    id: row.tmdbId,
    kind: kind(row.catalogKind),
    origin: origin(row.origin),
    sourceKey: row.sourceKey,
  }
}

function reviewView(row: { body: string; catalogKind: StoredKind; origin: 'NATIVE' | 'LETTERBOXD'; reviewedOn: Date | null; sourceKey: string | null; tags: string[]; tmdbId: number; id: string }): MemberReview {
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
}

function progressView(row: { catalogKind: StoredKind; completed: boolean; durationSeconds: number | null; episode: number; positionSeconds: number; season: number; tmdbId: number; updatedAt: Date }): PlaybackProgress {
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
  async function activeMemberId(username: string): Promise<string | null> {
    const current = await prisma.profile.findUnique({ select: { memberId: true }, where: { username } })
    const alias = current ? null : await prisma.usernameAlias.findUnique({ select: { memberId: true }, where: { username } })
    const memberId = current?.memberId ?? alias?.memberId
    if (!memberId) return null
    const active = await prisma.member.findUnique({ select: { id: true }, where: { id: memberId, status: 'ACTIVE' } })
    return active?.id ?? null
  }

  type LibraryCursor = { collection: MemberLibraryCollection; createdAt?: string; id: string; updatedAt?: string; watchedOn?: string }
  function parseLibraryCursor(value: string | undefined): LibraryCursor | undefined {
    if (!value) return undefined
    try {
      const parsed: unknown = JSON.parse(value)
      if (!parsed || typeof parsed !== 'object' || typeof (parsed as { id?: unknown }).id !== 'string') return undefined
      return parsed as LibraryCursor
    } catch {
      return undefined
    }
  }
  function libraryCursor(collection: MemberLibraryCollection, value: Omit<LibraryCursor, 'collection'>): string {
    return JSON.stringify({ collection, ...value })
  }
  function cursorDate(value: string | undefined): Date | undefined {
    if (!value) return undefined
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? undefined : date
  }

  async function libraryPage(memberId: string, collection: MemberLibraryCollection, cursorValue: string | undefined, limit: number): Promise<MemberLibraryCollectionPage> {
    const cursor = parseLibraryCursor(cursorValue)
    const take = Math.min(50, Math.max(1, limit)) + 1
    const empty = () => ({ collection, items: [], nextCursor: null }) as MemberLibraryCollectionPage

    if (cursorValue && (!cursor || cursor.collection !== collection)) return empty()
    if (cursor) {
      const exists = collection === 'diary'
        ? await prisma.diaryEntry.findFirst({ select: { id: true }, where: { id: cursor.id, memberId } })
        : collection === 'lists'
          ? await prisma.memberList.findFirst({ select: { id: true }, where: { id: cursor.id, memberId } })
          : await prisma.savedTitle.findFirst({ select: { id: true }, where: { id: cursor.id, memberId } })
      if (!exists) return empty()
    }

    if (collection === 'saved') {
      const createdAt = cursorDate(cursor?.createdAt)
      if (cursor && !createdAt) return empty()
      const rows = await prisma.savedTitle.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
        where: { memberId, ...(cursor && createdAt ? { OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: cursor.id } }] } : {}) },
      })
      const page = rows.slice(0, limit)
      const last = page.at(-1)
      return { collection, items: page.map((item) => ({ id: item.tmdbId, kind: kind(item.catalogKind), origin: origin(item.origin), sourceKey: item.sourceKey })), nextCursor: rows.length > limit && last ? libraryCursor(collection, { createdAt: last.createdAt.toISOString(), id: last.id }) : null }
    }
    if (collection === 'diary') {
      const watchedOn = cursorDate(cursor?.watchedOn)
      const createdAt = cursorDate(cursor?.createdAt)
      if (cursor && (!watchedOn || !createdAt)) return empty()
      const rows = await prisma.diaryEntry.findMany({
        orderBy: [{ watchedOn: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
        take,
        where: { memberId, ...(cursor && watchedOn && createdAt ? { OR: [{ watchedOn: { lt: watchedOn } }, { watchedOn, createdAt: { lt: createdAt } }, { watchedOn, createdAt, id: { lt: cursor.id } }] } : {}) },
      })
      const page = rows.slice(0, limit)
      const last = page.at(-1)
      return { collection, items: page.map((item) => ({ ...diaryEpisodeFields(item), entryId: item.id, id: item.tmdbId, kind: kind(item.catalogKind), origin: origin(item.origin), rewatch: item.rewatch, sourceKey: item.sourceKey, tags: item.tags, watchedOn: day(item.watchedOn) })), nextCursor: rows.length > limit && last ? libraryCursor(collection, { createdAt: last.createdAt.toISOString(), id: last.id, watchedOn: last.watchedOn.toISOString() }) : null }
    }
    if (collection === 'lists') {
      const updatedAt = cursorDate(cursor?.updatedAt)
      if (cursor && !updatedAt) return empty()
      const rows = await prisma.memberList.findMany({
        include: { _count: { select: { items: true } } },
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take,
        where: { memberId, ...(cursor && updatedAt ? { OR: [{ updatedAt: { lt: updatedAt } }, { updatedAt, id: { lt: cursor.id } }] } : {}) },
      })
      const page = rows.slice(0, limit)
      const last = page.at(-1)
      return { collection, items: page.map((list) => ({ description: list.description, id: list.id, itemCount: list._count.items, name: list.name, origin: origin(list.origin), slug: list.slug, visibility: list.visibility === 'public' ? 'public' as const : 'private' as const })), nextCursor: rows.length > limit && last ? libraryCursor(collection, { id: last.id, updatedAt: last.updatedAt.toISOString() }) : null }
    }

    return empty()
  }

  async function librarySnapshot(memberId: string): Promise<MemberLibrarySnapshot> {
    const [diary, favorites, lists, saved] = await Promise.all([
      libraryPage(memberId, 'diary', undefined, 30),
      prisma.favorite.findMany({ orderBy: { position: 'asc' }, take: MAX_MEMBER_FAVORITES, where: { memberId } }),
      libraryPage(memberId, 'lists', undefined, 30),
      libraryPage(memberId, 'saved', undefined, 30),
    ])
    if (diary.collection !== 'diary' || lists.collection !== 'lists' || saved.collection !== 'saved') throw new Error('LIBRARY_SNAPSHOT_COLLECTION_MISMATCH')
    return {
      diary: { items: diary.items, nextCursor: diary.nextCursor },
      favorites: favorites.map((item, index) => ({ id: item.tmdbId, kind: kind(item.catalogKind), origin: origin(item.origin), position: index + 1, sourceKey: item.sourceKey })),
      lists: { items: lists.items, nextCursor: lists.nextCursor },
      saved: { items: saved.items, nextCursor: saved.nextCursor },
    }
  }
  

  

  async function readList(slug: string, viewerMemberId?: string): Promise<MemberListDetail | null> {
    const row = await prisma.memberList.findUnique({
      include: { items: { orderBy: { position: 'asc' } }, member: { include: { profile: true } } },
      where: { slug },
    })
    if (!row || row.member.status !== 'ACTIVE' || !row.member.profile) return null
    const viewerIsOwner = row.memberId === viewerMemberId
    if (!viewerIsOwner && (row.visibility !== 'public' || row.member.profile.visibility !== 'public')) return null
    return {
      items: row.items.map((item) => ({ id: item.tmdbId, kind: kind(item.catalogKind), note: item.note, origin: origin(item.origin), position: item.position, sourceKey: item.sourceKey })),
      list: { description: row.description, id: row.id, itemCount: row.items.length, name: row.name, origin: origin(row.origin), slug: row.slug, visibility: row.visibility === 'public' ? 'public' as const : 'private' as const },
      owner: { displayName: row.member.profile.displayName, username: row.member.profile.username },

      viewerIsOwner,
    }
  }

  

  return {
    
    libraryPage,
    librarySnapshot,
    list: readList,
    
    async createList(memberId: string, input: CreateMemberListRequest): Promise<MemberListDetail> {
      const suffix = input.idempotencyKey.replaceAll('-', '')
      const slug = `${listSlug(input.name)}-${suffix}`
      const row = await prisma.memberList.upsert({
        create: { description: input.description ?? null, idempotencyKey: input.idempotencyKey, memberId, name: input.name, origin: 'NATIVE', slug, visibility: input.visibility },
        update: {},
        where: { memberId_idempotencyKey: { idempotencyKey: input.idempotencyKey, memberId } },
        select: { slug: true },
      })
      const detail = await readList(row.slug, memberId)
      if (!detail) throw new Error('CREATED_LIST_UNAVAILABLE')
      return detail
    },
    async updateListContent(memberId, listId, changes: UpdateMemberListContentRequest) {
      return prisma.$transaction(async (tx) => {
        const owned = await tx.memberList.findFirst({ select: { id: true }, where: { id: listId, memberId } })
        if (!owned) return false
        await tx.listItem.deleteMany({ where: { listId } })
        if (changes.items.length) await tx.listItem.createMany({
          data: changes.items.map((item, index) => ({ catalogKind: storedKind(item.kind), importBatchId: null, listId, note: item.note ?? null, origin: 'NATIVE', position: index + 1, sourceKey: null, tmdbId: item.id })),
        })
        await tx.memberList.update({
          data: { description: changes.description, importBatchId: null, name: changes.name, origin: 'NATIVE', sourceKey: null, visibility: changes.visibility },
          where: { id: listId },
        })
        return true
      })
    },
    async deleteList(memberId, listId) {
      const result = await prisma.memberList.deleteMany({ where: { id: listId, memberId } })
      return result.count === 1
    },
    
    async profile(username, viewerMemberId): Promise<MemberProfileData | null> {
      const current = await prisma.profile.findUnique({ select: { memberId: true }, where: { username } })
      const alias = current ? null : await prisma.usernameAlias.findUnique({ select: { memberId: true }, where: { username } })
      const memberId = current?.memberId ?? alias?.memberId
      if (!memberId || memberId !== viewerMemberId) return null
      const [member, ratingCounts, followers, following] = await Promise.all([
        prisma.member.findFirst({
          include: {
            diaryEntries: { orderBy: [{ watchedOn: 'desc' }, { createdAt: 'desc' }], take: 30 },
            favorites: { orderBy: { position: 'asc' }, take: MAX_MEMBER_FAVORITES },
            lists: { include: { _count: { select: { items: true } } }, orderBy: { updatedAt: 'desc' }, take: 30 },
            profile: true,
            reviews: { orderBy: [{ reviewedOn: 'desc' }, { createdAt: 'desc' }], take: 30 },
            _count: { select: { diaryEntries: true, followers: true, following: true, lists: true, reviews: true, watchedTitles: true } },
          },
          where: { id: memberId, status: 'ACTIVE' },
        }),
        prisma.rating.groupBy({ by: ['value'], _count: { _all: true }, where: { memberId } }),
        prisma.follow.count({ where: { followingId: memberId, follower: { status: 'ACTIVE', profile: { is: { visibility: 'public' } } } } }),
        prisma.follow.count({ where: { followerId: memberId, following: { status: 'ACTIVE', profile: { is: { visibility: 'public' } } } } }),
      ])
      if (!member?.profile) return null
      return {
        canonicalUsername: member.profile.username,
        diary: member.diaryEntries.map((item) => ({ ...diaryEpisodeFields(item), entryId: item.id, id: item.tmdbId, kind: kind(item.catalogKind), origin: origin(item.origin), rewatch: item.rewatch, sourceKey: item.sourceKey, tags: item.tags, watchedOn: day(item.watchedOn) })),
        favorites: member.favorites.map((item, index) => ({ id: item.tmdbId, kind: kind(item.catalogKind), origin: origin(item.origin), position: index + 1, sourceKey: item.sourceKey })),
        lists: member.lists.map((list) => ({ description: list.description, id: list.id, itemCount: list._count.items, name: list.name, origin: origin(list.origin), slug: list.slug, visibility: list.visibility === 'public' ? 'public' as const : 'private' as const })),
        profile: profileView(member.profile, member.createdAt),
        reviews: member.reviews.map((item) => ({ body: item.body, id: item.tmdbId, kind: kind(item.catalogKind), origin: origin(item.origin), reviewedOn: item.reviewedOn ? day(item.reviewedOn) : null, reviewId: item.id, sourceKey: item.sourceKey, tags: item.tags })),
        ratingDistribution: Array.from({ length: 10 }, (_, index) => {
          const value = index + 1
          return { count: ratingCounts.find((row) => row.value === value)?._count._all ?? 0, value }
        }),

        social: { followers, following },
        statistics: { diaryEntries: member._count.diaryEntries, lists: member._count.lists, reviews: member._count.reviews, watched: member._count.watchedTitles },
      }
    },
    async profileArchive(username, collection, viewerMemberId, cursor, limit = 30): Promise<MemberProfileArchivePage | null> {
      const memberId = await activeMemberId(username)
      if (!memberId || memberId !== viewerMemberId || (cursor && cursor.collection !== collection)) return null
      const owner = await prisma.member.findFirst({
        select: { id: true, profile: { select: { visibility: true } } },
        where: { id: memberId, status: 'ACTIVE' },
      })
      if (!owner?.profile) return null

      const pageSize = Math.min(50, Math.max(1, limit))
      const take = pageSize + 1
      const encode = (value: Omit<MemberProfileArchiveCursor, 'collection'>) => JSON.stringify({ collection, ...value })
      const createdAt = cursor?.createdAt ? new Date(cursor.createdAt) : undefined
      const updatedAt = cursor?.updatedAt ? new Date(cursor.updatedAt) : undefined
      const watchedOn = cursor?.watchedOn ? new Date(cursor.watchedOn) : undefined
      const validDate = (value: Date | undefined) => value === undefined || !Number.isNaN(value.getTime())
      if (!validDate(createdAt) || !validDate(updatedAt) || !validDate(watchedOn)) return null
      const next = (hasMore: boolean, value: Omit<MemberProfileArchiveCursor, 'collection'> | null): string | null => hasMore && value ? encode(value) : null

      if (collection === 'films' || collection === 'likes') {
        if (cursor && !updatedAt) return null
        const where = {
          memberId,
          ...(cursor && updatedAt ? { OR: [{ updatedAt: { lt: updatedAt } }, { updatedAt, id: { lt: cursor.id } }] } : {}),
        }
        const rows = collection === 'films'
          ? await prisma.watchedTitle.findMany({ orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take, where })
          : await prisma.titleLike.findMany({ orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take, where })
        const hasMore = rows.length > pageSize
        const page = rows.slice(0, pageSize)
        const items = page.map((row) => ({ id: row.tmdbId, kind: kind(row.catalogKind), origin: origin(row.origin), sourceKey: row.sourceKey }))
        const last = page.at(-1)
        const nextCursor = next(hasMore, last ? { id: last.id, updatedAt: last.updatedAt.toISOString() } : null)
        return collection === 'films'
          ? { collection, items, nextCursor }
          : { collection, items, nextCursor }
      }

      if (collection === 'diary') {
        if (cursor && (!createdAt || !watchedOn)) return null
        const rows = await prisma.diaryEntry.findMany({
          orderBy: [{ watchedOn: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
          take,
          where: {
            memberId,
            ...(cursor && createdAt && watchedOn ? { OR: [
              { watchedOn: { lt: watchedOn } },
              { watchedOn, createdAt: { lt: createdAt } },
              { watchedOn, createdAt, id: { lt: cursor.id } },
            ] } : {}),
          },
        })
        const hasMore = rows.length > pageSize
        const page = rows.slice(0, pageSize)
        const items = page.map((item) => ({ ...diaryEpisodeFields(item), entryId: item.id, id: item.tmdbId, kind: kind(item.catalogKind), origin: origin(item.origin), rewatch: item.rewatch, sourceKey: item.sourceKey, tags: item.tags, watchedOn: day(item.watchedOn) }))
        const last = page.at(-1)
        return { collection, items, nextCursor: next(hasMore, last ? { createdAt: last.createdAt.toISOString(), id: last.id, watchedOn: last.watchedOn.toISOString() } : null) }
      }

      if (collection === 'reviews') {
        if (cursor && !createdAt) return null
        const rows = await prisma.review.findMany({
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take,
          where: { memberId, ...(cursor && createdAt ? { OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: cursor.id } }] } : {}) },
        })
        const hasMore = rows.length > pageSize
        const page = rows.slice(0, pageSize)
        const items = page.map((row) => reviewView(row))
        const last = page.at(-1)
        return { collection, items, nextCursor: next(hasMore, last ? { createdAt: last.createdAt.toISOString(), id: last.id } : null) }
      }

      if (collection === 'lists') {
        if (cursor && !updatedAt) return null
        const rows = await prisma.memberList.findMany({
          include: { _count: { select: { items: true } } },
          orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
          take,
          where: {
            memberId,
            ...(cursor && updatedAt ? { OR: [{ updatedAt: { lt: updatedAt } }, { updatedAt, id: { lt: cursor.id } }] } : {}),
          },
        })
        const hasMore = rows.length > pageSize
        const page = rows.slice(0, pageSize)
        const items = page.map((list) => ({ description: list.description, id: list.id, itemCount: list._count.items, name: list.name, origin: origin(list.origin), slug: list.slug, visibility: list.visibility === 'public' ? 'public' as const : 'private' as const }))
        const last = page.at(-1)
        return { collection, items, nextCursor: next(hasMore, last ? { id: last.id, updatedAt: last.updatedAt.toISOString() } : null) }
      }

      

      if (collection === 'tags') {
        const rows = await prisma.$queryRaw<Array<{ count: number; tag: string }>>`
          SELECT "tag", COUNT(*)::int AS "count"
          FROM (
            SELECT unnest("tags") AS "tag" FROM "DiaryEntry" WHERE "memberId" = ${memberId}
            UNION ALL
            SELECT unnest("tags") AS "tag" FROM "Review" WHERE "memberId" = ${memberId}
          ) AS "tag_uses"
          WHERE "tag" <> ''
          GROUP BY "tag"
          ORDER BY "count" DESC, "tag" ASC
          LIMIT 100
        `
        return { collection, items: rows.map(({ count, tag }) => ({ count: Number(count), tag })), nextCursor: null }
      }

      if (cursor && (!createdAt || (cursor.kind !== 'diary' && cursor.kind !== 'review'))) return null
      const eventFilter = (kind: 'diary' | 'review') => {
        if (!cursor || !createdAt || !cursor.kind) return {}
        const tieIsAfter = kind > cursor.kind
        const tieIsSame = kind === cursor.kind
        return { OR: [
          { createdAt: { lt: createdAt } },
          ...(tieIsAfter ? [{ createdAt }] : []),
          ...(tieIsSame ? [{ createdAt, id: { gt: cursor.id } }] : []),
        ] }
      }
      const [diaryRows, reviewRows] = await Promise.all([
        prisma.diaryEntry.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take, where: { memberId, ...eventFilter('diary') } }),
        prisma.review.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take, where: { memberId, ...eventFilter('review') } }),
      ])
      type ActivityItem = Extract<MemberProfileArchivePage, { collection: 'activity' }>['items'][number]
      const events: (ActivityItem & { cursorId: string })[] = [
        ...diaryRows.map((item) => ({ kind: 'diary' as const, item: { ...diaryEpisodeFields(item), entryId: item.id, id: item.tmdbId, kind: kind(item.catalogKind), origin: origin(item.origin), rewatch: item.rewatch, sourceKey: item.sourceKey, tags: item.tags, watchedOn: day(item.watchedOn) }, occurredAt: item.createdAt.toISOString(), cursorId: item.id })),
        ...reviewRows.map((item) => ({ kind: 'review' as const, item: reviewView(item), occurredAt: item.createdAt.toISOString(), cursorId: item.id })),
      ].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || a.kind.localeCompare(b.kind) || a.cursorId.localeCompare(b.cursorId))
      const page = events.slice(0, pageSize)
      const last = page.at(-1)
      const nextCursor = next(events.length > pageSize || diaryRows.length > pageSize || reviewRows.length > pageSize, last ? {
        createdAt: last.occurredAt,
        id: last.cursorId,
        kind: last.kind,
      } : null)
      const activityItems: ActivityItem[] = page.map((event): ActivityItem => event.kind === 'diary'
        ? { kind: 'diary', occurredAt: event.occurredAt, item: event.item }
        : { kind: 'review', occurredAt: event.occurredAt, item: event.item })
      return { collection: 'activity', items: activityItems, nextCursor }
    },
    
    async setFavorites(memberId, favorites): Promise<void> {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${memberId}))`
        await requireActiveTrackingMember(tx, memberId)
        await tx.favorite.deleteMany({ where: { memberId } })
        if (favorites.length) await tx.favorite.createMany({ data: favorites.map((favorite, index) => ({ catalogKind: storedKind(favorite.kind), memberId, origin: 'NATIVE', position: index + 1, tmdbId: favorite.id })) })
        await syncReleaseTracking(tx, memberId)
      })
    },
    
    
    async rating(memberId: string, ref): Promise<MemberRating | null> {
      const row = await prisma.rating.findUnique({ where: { memberId_catalogKind_tmdbId: ratingKey(memberId, ref) } })
      return row ? ratingView(row) : null
    },
    async ratingsByValue(memberId, value, cursor, limit): Promise<MemberRatingPage> {
      const pageSize = Math.min(50, Math.max(1, limit))
      const pageWhere = { memberId, value }
      const totalCount = await prisma.rating.count({ where: pageWhere })
      let cursorRow: { id: string; updatedAt: Date } | null = null
      if (cursor) {
        let decoded: unknown
        try { decoded = JSON.parse(cursor) } catch { return { items: [], nextCursor: null, totalCount } }
        const parsed = memberRatingCursorSchema.safeParse(decoded)
        if (!parsed.success || parsed.data.value !== value) return { items: [], nextCursor: null, totalCount }
        cursorRow = await prisma.rating.findFirst({ select: { id: true, updatedAt: true }, where: { id: parsed.data.id, memberId, value } })
        if (!cursorRow || cursorRow.updatedAt.toISOString() !== parsed.data.updatedAt) return { items: [], nextCursor: null, totalCount }
      }
      const rows = await prisma.rating.findMany({
        orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
        take: pageSize + 1,
        where: {
          ...pageWhere,
          ...(cursorRow ? { OR: [{ updatedAt: { lt: cursorRow.updatedAt } }, { updatedAt: cursorRow.updatedAt, id: { lt: cursorRow.id } }] } : {}),
        },
      })
      const items = rows.slice(0, pageSize).map(ratingView)
      const last = rows[pageSize - 1]
      return {
        items,
        nextCursor: rows.length > pageSize && last ? JSON.stringify({ id: last.id, updatedAt: last.updatedAt.toISOString(), value }) : null,
        totalCount,
      }
    },
    async ratingsForTitles(memberId, titles): Promise<MemberRating[]> {
      if (!titles.length) return []
      const rows = await prisma.rating.findMany({
        where: { memberId, OR: titles.map((title) => ratingKey(memberId, title)) },
      })
      return rows.map(ratingView)
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
    
    async review(memberId: string, ref: CatalogRef): Promise<MemberReview | null> {
      const row = await prisma.review.findFirst({
        orderBy: { createdAt: 'desc' },
        where: { catalogKind: storedKind(ref.kind), memberId, tmdbId: ref.id },
      })
      return row ? reviewView(row) : null
    },
    async titleReviews(ref: CatalogRef, page: number, _sort: TitleReviewSort, viewerMemberId: string): Promise<TitleReviewsPage> {
      const catalogKind = storedKind(ref.kind)
      if (!viewerMemberId) return { items: [], page, totalPages: 0, totalResults: 0 }
      const where = { catalogKind, memberId: viewerMemberId, member: { status: 'ACTIVE' as const }, tmdbId: ref.id }
      const [totalResults, rows] = await Promise.all([
        prisma.review.count({ where }),
        prisma.review.findMany({
          include: { member: { select: { id: true, profile: { select: { avatarStyle: true, avatarUrl: true, displayName: true, username: true } } } } },
          orderBy: { createdAt: 'desc' },
          skip: (page - 1) * TITLE_REVIEWS_PAGE_SIZE,
          take: TITLE_REVIEWS_PAGE_SIZE,
          where,
        }),
      ])
      const ratings = await prisma.rating.findMany({ where: { catalogKind, memberId: { in: rows.map((row) => row.memberId) }, tmdbId: ref.id } })
      const ratingByMember = new Map(ratings.map((item) => [item.memberId, item.value]))
      
      return {
        items: rows.flatMap((row) => {
          const profile = row.member.profile
          if (!profile) return []
          return [{
            author: {
              avatarStyle: avatarStyleSchema.catch('dusk').parse(profile.avatarStyle),
              avatarUrl: profile.avatarUrl,
              displayName: profile.displayName,
              username: profile.username,
            },
            body: row.body,


            rating: ratingByMember.get(row.memberId) ?? null,
            reviewId: row.id,
            reviewedOn: row.reviewedOn ? day(row.reviewedOn) : null,
          }]
        }),
        page,
        totalPages: Math.ceil(totalResults / TITLE_REVIEWS_PAGE_SIZE),
        totalResults,
      }
    },
    async setSaved(memberId, title, saved): Promise<void> {
      const catalogKind = storedKind(title.kind)
      const key = { catalogKind, memberId, tmdbId: title.id } as const
      await prisma.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${memberId}))`
        if (saved) {
          await requireActiveTrackingMember(tx, memberId)
          await tx.savedTitle.upsert({
            create: { ...key, origin: 'NATIVE' },
            update: { importBatchId: null, origin: 'NATIVE', sourceKey: null },
            where: { memberId_catalogKind_tmdbId: key },
          })
        } else {
          await tx.savedTitle.deleteMany({ where: key })
        }
        await syncReleaseTracking(tx, memberId)
      })
    },
    async setWatched(memberId, title, watched): Promise<void> {
      const catalogKind = storedKind(title.kind)
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
    },
    async titleState(memberId, ref): Promise<MemberTitleState> {
      const key = ratingKey(memberId, ref)
      const [rating, like, review, saved, watched] = await Promise.all([
        prisma.rating.findUnique({ where: { memberId_catalogKind_tmdbId: key } }),
        prisma.titleLike.findUnique({ where: { memberId_catalogKind_tmdbId: likeKey(memberId, ref) } }),
        prisma.review.findFirst({ orderBy: { createdAt: 'desc' }, where: key }),
        prisma.savedTitle.findUnique({ where: { memberId_catalogKind_tmdbId: key } }),
        prisma.watchedTitle.findUnique({ where: { memberId_catalogKind_tmdbId: key } }),
      ])
      return {
        like: like ? likeView(like) : null,
        rating: rating ? ratingView(rating) : null,
        review: review ? reviewView(review) : null,
        saved: Boolean(saved),
        watched: Boolean(watched),
      }
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
      const catalogKind = storedKind(input.kind)
      const key = { catalogKind, memberId, tmdbId: input.id } as const
      const watchedOn = new Date(`${input.watchedOn}T00:00:00.000Z`)
      const row = await prisma.$transaction(async (tx) => {
        await tx.watchedTitle.upsert({
          create: { ...key, origin: 'NATIVE' },
          update: { importBatchId: null, origin: 'NATIVE', sourceKey: null },
          where: { memberId_catalogKind_tmdbId: key },
        })
        const data = {
          catalogKind,
          idempotencyKey: input.idempotencyKey,
          importBatchId: null,
          memberId,
          origin: 'NATIVE' as const,
          rewatch: input.rewatch ?? false,
          season: input.season ?? 0,
          episode: input.episode ?? 0,
          sourceKey: null,
          tags: [...(input.tags ?? [])],
          tmdbId: input.id,
          watchedOn,
        }
        return tx.diaryEntry.upsert({
          create: data,
          update: {},
          where: { memberId_origin_idempotencyKey: { idempotencyKey: input.idempotencyKey, memberId, origin: 'NATIVE' } },
        })
      })
      return {
        ...diaryEpisodeFields(row),
        entryId: row.id,
        id: row.tmdbId,
        kind: kind(row.catalogKind),
        origin: origin(row.origin),
        rewatch: row.rewatch,
        sourceKey: row.sourceKey,
        tags: row.tags,
        watchedOn: day(row.watchedOn),
      }
    },
    async createReview(memberId: string, input: CreateReviewRequest): Promise<MemberReview> {
      const row = await prisma.review.create({
        data: {
          body: input.body,
          catalogKind: storedKind(input.kind),
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
      // A title-only read resumes its latest episode; exact Watch reads retain
      // their composite key and never borrow a neighboring episode's position.
      const row = ref.kind !== 'movie' && ref.season === undefined && ref.episode === undefined
        ? await prisma.playbackProgress.findFirst({ where: { memberId, catalogKind: ref.kind === 'anime' ? 'ANIME' : 'SERIES', tmdbId: ref.id, episode: { gt: 0 } }, orderBy: [{ updatedAt: 'desc' }, { season: 'desc' }, { episode: 'desc' }] })
        : await prisma.playbackProgress.findUnique({ where: { memberId_catalogKind_tmdbId_season_episode: progressKey(memberId, ref) } })
      return row ? progressView(row) : null
    },
    async watchHistory(memberId: string, cursor: string | undefined, limit: number): Promise<WatchHistoryPage> {
      if (cursor && !(await prisma.watchHistoryEntry.findFirst({ select: { id: true }, where: { id: cursor, memberId } }))) {
        return { items: [], nextCursor: null }
      }
      const rows = await prisma.watchHistoryEntry.findMany({
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
        take: limit + 1,
        where: { memberId },
      })
      return {
        items: rows.slice(0, limit).map((row) => ({
          completedAt: row.completedAt.toISOString(),
          entryId: row.id,
          id: row.tmdbId,
          kind: kind(row.catalogKind),
          ...(row.catalogKind === 'SERIES' || row.season > 0 ? { season: row.season } : {}),
          ...(row.episode > 0 ? { episode: row.episode } : {}),
        })),
        nextCursor: rows.length > limit ? rows[limit - 1]!.id : null,
      }
    },
    async setProgress(memberId: string, input: ProgressWriteRequest): Promise<PlaybackProgress> {
      const key = progressKey(memberId, input)
      const current = await prisma.playbackProgress.findUnique({ where: { memberId_catalogKind_tmdbId_season_episode: key } })
      const completed = input.completed ?? current?.completed ?? false
      let positionSeconds = input.positionSeconds
      if (current && !completed && positionSeconds < current.positionSeconds && current.positionSeconds - positionSeconds <= BACKWARD_TOLERANCE_SECONDS) {
        positionSeconds = current.positionSeconds
      }
      const upsert = {
        create: { ...key, completed, durationSeconds: input.durationSeconds ?? null, positionSeconds },
        update: { completed, ...(input.durationSeconds !== undefined ? { durationSeconds: input.durationSeconds } : {}), positionSeconds },
        where: { memberId_catalogKind_tmdbId_season_episode: key },
      } as const
      if (input.completed && input.completionId) {
        const row = await prisma.$transaction(async (tx) => {
          const saved = await tx.playbackProgress.upsert(upsert)
          const inserted = await tx.watchHistoryEntry.createMany({
            data: [{ ...key, completionId: input.completionId! }],
            skipDuplicates: true,
          })
          if (inserted.count && input.kind === 'movie') {
            const titleKey = { catalogKind: key.catalogKind, memberId, tmdbId: key.tmdbId }
            await tx.watchedTitle.upsert({
              create: { ...titleKey, origin: 'NATIVE' },
              update: {},
              where: { memberId_catalogKind_tmdbId: titleKey },
            })
          }
          return saved
        })
        return progressView(row)
      }
      const row = await prisma.playbackProgress.upsert(upsert)
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
    async deleteDiary(memberId: string, entryId: string) {
      const result = await prisma.diaryEntry.deleteMany({ where: { id: entryId, memberId } })
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
