import type {
  CatalogKind,
  CatalogRef,
  AddMemberListCollaboratorRequest,
  CreateMemberListRequest,
  CreateDiaryEntryRequest,
  CreateReviewRequest,
  DiaryEntry,
  MemberLibraryCollection,
  MemberLibraryCollectionPage,
  MemberLibrarySnapshot,
  MemberListDetail,
  MemberListVisibility,
  MemberProfileData,
  MemberProfileArchiveCursor,
  MemberProfileArchivePage,
  MemberRating,
  MemberRatingPage,
  MemberReview,
  MemberTitleRecord,
  MemberTitleState,
  DuplicateMemberListRequest,
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
import { avatarStyleSchema, defaultProfileSectionVisibility, MAX_MEMBER_FAVORITES, memberRatingCursorSchema, profileSectionVisibilitySchema } from '@consumit/contracts'

import { Prisma, PrismaClient } from '../../generated/prisma/client.js'
import { requireActiveTrackingMember, syncReleaseTracking } from '../releases/tracking.ts'
import { ApiError } from '../http/errors.ts'
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

function listVisibility(value: string): MemberListVisibility {
  return value === 'public' || value === 'unlisted' ? value : 'private'
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

function reviewView(row: { spoiler?: boolean; body: string; catalogKind: StoredKind; origin: 'NATIVE' | 'LETTERBOXD'; reviewedOn: Date | null; sourceKey: string | null; tags: string[]; tmdbId: number; id: string }): MemberReview {
  return {
    body: row.spoiler ? 'Contains spoilers. Open the review to read.' : row.body,
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

function profileView(profile: { avatarStyle: string; avatarUrl: string | null; bannerUrl: string | null; bio: string | null; displayName: string | null; sectionVisibility: unknown; username: string; usernameChangedAt: Date | null }, createdAt: Date) {
  const next = profile.usernameChangedAt ? new Date(profile.usernameChangedAt.getTime() + 30 * 24 * 60 * 60 * 1000) : null
  return {
    avatarStyle: avatarStyleSchema.catch('dusk').parse(profile.avatarStyle),
    avatarUrl: profile.avatarUrl,
    bannerUrl: profile.bannerUrl,
    bio: profile.bio,
    createdAt: createdAt.toISOString(),
    displayName: profile.displayName,
    nextUsernameChangeAt: next && next > new Date() ? next.toISOString() : null,
    sectionVisibility: profileSectionVisibilitySchema.catch(defaultProfileSectionVisibility()).parse(profile.sectionVisibility),
    username: profile.username,
    usernameChangedAt: profile.usernameChangedAt?.toISOString() ?? null,
  }
}





export function createPostgresMemberData(prisma: PrismaClient, outboxEnabled = false): MemberData {
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
          : collection === 'savedLists'
            ? await prisma.savedMemberList.findFirst({ select: { id: true }, where: { id: cursor.id, memberId } })
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
      return { collection, items: page.map((list) => ({ description: list.description, id: list.id, itemCount: list._count.items, name: list.name, origin: origin(list.origin), slug: list.slug, visibility: listVisibility(list.visibility) })), nextCursor: rows.length > limit && last ? libraryCursor(collection, { id: last.id, updatedAt: last.updatedAt.toISOString() }) : null }
    }

    if (collection === 'savedLists') {
      const createdAt = cursorDate(cursor?.createdAt)
      if (cursor && !createdAt) return empty()
      const rows = await prisma.savedMemberList.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take,
        where: { memberId, ...(cursor && createdAt ? { OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: cursor.id } }] } : {}) },
      })
      const currentLists = rows.length ? await prisma.memberList.findMany({
        include: { _count: { select: { items: true } }, member: { include: { profile: true } } },
        where: { id: { in: rows.map((row) => row.listId) } },
      }) : []
      const currentById = new Map(currentLists.map((list) => [list.id, list]))
      const page = rows.slice(0, limit)
      const last = page.at(-1)
      const items = page.map((bookmark) => {
        const list = currentById.get(bookmark.listId)
        const visible = list?.member.status === 'ACTIVE' && list.member.profile?.sectionVisibility
          ? profileSectionVisibilitySchema.catch(defaultProfileSectionVisibility()).parse(list.member.profile.sectionVisibility).lists
          : false
        const visibility = list ? listVisibility(list.visibility) : 'private'
        const available = Boolean(list && list.member.status === 'ACTIVE' && (visibility === 'unlisted' || (visibility === 'public' && visible)))
        return {
          available,
          itemCount: available ? list!._count.items : null,
          listId: bookmark.listId,
          listName: available ? list!.name : bookmark.listName,
          listSlug: available ? list!.slug : bookmark.listSlug,
          ownerDisplayName: available ? list!.member.profile!.displayName : bookmark.ownerDisplayName,
          ownerUsername: available ? list!.member.profile!.username : bookmark.ownerUsername,
          savedAt: bookmark.createdAt.toISOString(),
        }
      })
      return { collection, items, nextCursor: rows.length > limit && last ? libraryCursor(collection, { createdAt: last.createdAt.toISOString(), id: last.id }) : null }
    }

    return empty()
  }

  async function librarySnapshot(memberId: string): Promise<MemberLibrarySnapshot> {
    const [diary, favorites, lists, savedLists, saved] = await Promise.all([
      libraryPage(memberId, 'diary', undefined, 30),
      prisma.favorite.findMany({ orderBy: { position: 'asc' }, take: MAX_MEMBER_FAVORITES, where: { memberId } }),
      libraryPage(memberId, 'lists', undefined, 30),
      libraryPage(memberId, 'savedLists', undefined, 30),
      libraryPage(memberId, 'saved', undefined, 30),
    ])
    if (diary.collection !== 'diary' || lists.collection !== 'lists' || savedLists.collection !== 'savedLists' || saved.collection !== 'saved') throw new Error('LIBRARY_SNAPSHOT_COLLECTION_MISMATCH')
    return {
      diary: { items: diary.items, nextCursor: diary.nextCursor },
      favorites: favorites.map((item, index) => ({ id: item.tmdbId, kind: kind(item.catalogKind), origin: origin(item.origin), position: index + 1, sourceKey: item.sourceKey })),
      lists: { items: lists.items, nextCursor: lists.nextCursor },
      savedLists: { items: savedLists.items, nextCursor: savedLists.nextCursor },
      saved: { items: saved.items, nextCursor: saved.nextCursor },
    }
  }
  

  

  async function readList(slug: string, viewerMemberId?: string): Promise<MemberListDetail | null> {
    const row = await prisma.memberList.findUnique({
      include: {
        collaborators: { include: { member: { include: { profile: true } } } },
        items: { orderBy: { position: 'asc' } },
        member: { include: { profile: true } },
      },
      where: { slug },
    })
    if (!row || row.removedAt || row.member.status !== 'ACTIVE' || !row.member.profile) return null
    const viewerIsOwner = row.memberId === viewerMemberId
    const viewerIsCollaborator = Boolean(viewerMemberId && row.collaborators.some((collaborator) => collaborator.memberId === viewerMemberId && collaborator.member.status === 'ACTIVE'))
    const viewerCanEdit = viewerIsOwner || viewerIsCollaborator
    const ownerSections = profileSectionVisibilitySchema.catch(defaultProfileSectionVisibility()).parse(row.member.profile.sectionVisibility)
    const visibility = listVisibility(row.visibility)
    if (!viewerCanEdit && (visibility === 'private' || (visibility === 'public' && !ownerSections.lists))) return null
    const viewerHasSaved = Boolean(viewerMemberId && !viewerIsOwner && await prisma.savedMemberList.findUnique({ where: { memberId_listId: { memberId: viewerMemberId, listId: row.id } }, select: { id: true } }))
    return {
      collaborators: viewerCanEdit ? row.collaborators.flatMap(({ member }) => member.profile ? [{ displayName: member.profile.displayName, memberId: member.id, username: member.profile.username }] : []) : [],
      items: row.items.map((item) => ({ id: item.tmdbId, kind: kind(item.catalogKind), note: item.note, origin: origin(item.origin), position: item.position, sourceKey: item.sourceKey })),
      list: { description: row.description, id: row.id, itemCount: row.items.length, name: row.name, origin: origin(row.origin), slug: row.slug, visibility },
      owner: { displayName: row.member.profile.displayName, username: row.member.profile.username },
      viewerCanEdit,
      viewerIsCollaborator,
      viewerIsOwner,
      viewerHasSaved,
    }
  }

  

  return {

    async publicMemberTrends(): Promise<CatalogRef[]> {
      const rows = await prisma.$queryRaw<Array<{ catalogKind: StoredKind; tmdbId: number }>>`
        WITH distinct_member_titles AS (
          SELECT progress."memberId", progress."catalogKind", progress."tmdbId", MAX(progress."updatedAt") AS "updatedAt"
          FROM "PlaybackProgress" progress
          JOIN "ExperiencePreference" preference ON preference."memberId" = progress."memberId"
          JOIN "Member" member ON member."id" = progress."memberId" AND member."status" = 'ACTIVE'
          WHERE preference."preferences" ->> 'shareViewingTrends' = 'true'
            AND progress."updatedAt" >= NOW() - INTERVAL '7 days'
            AND progress."positionSeconds" > 0
          GROUP BY progress."memberId", progress."catalogKind", progress."tmdbId"
        )
        SELECT "catalogKind", "tmdbId"
        FROM distinct_member_titles
        GROUP BY "catalogKind", "tmdbId"
        HAVING COUNT(*) >= 5
        ORDER BY COUNT(*) DESC, MAX("updatedAt") DESC, "catalogKind" ASC, "tmdbId" ASC
        LIMIT 20
      `
      return rows.map((row) => ({ id: row.tmdbId, kind: kind(row.catalogKind) }))
    },
    
    libraryPage,
    librarySnapshot,
    list: readList,
    
    async createList(memberId: string, input: CreateMemberListRequest): Promise<MemberListDetail> {
      const suffix = input.idempotencyKey.replaceAll('-', '')
      const slug = `${listSlug(input.name)}-${suffix}`
      const seededTitle = input.title
      const row = await prisma.$transaction(async (tx) => {
        const created = await tx.memberList.upsert({
          create: { description: input.description ?? null, idempotencyKey: input.idempotencyKey, memberId, name: input.name, origin: 'NATIVE', slug, visibility: input.visibility },
          update: {},
          where: { memberId_idempotencyKey: { idempotencyKey: input.idempotencyKey, memberId } },
          select: { id: true, slug: true },
        })
        if (seededTitle) {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`consumit:list:${created.id}`}))`
          const titleKind = storedKind(seededTitle.kind)
          const exists = await tx.listItem.findFirst({ select: { id: true }, where: { listId: created.id, catalogKind: titleKind, tmdbId: seededTitle.id } })
          if (!exists) {
            const tail = await tx.listItem.aggregate({ _max: { position: true }, where: { listId: created.id } })
            await tx.listItem.create({ data: { catalogKind: titleKind, listId: created.id, origin: 'NATIVE', position: (tail._max.position ?? 0) + 1, tmdbId: seededTitle.id } })
          }
        }
        return created
      })
      const detail = await readList(row.slug, memberId)
      if (!detail) throw new Error('CREATED_LIST_UNAVAILABLE')
      return detail
    },
    async duplicateList(memberId: string, slug: string, input: DuplicateMemberListRequest) {
      const source = await prisma.memberList.findFirst({
        include: { items: { orderBy: { position: 'asc' } }, member: { include: { profile: true } } },
        where: { slug, visibility: 'public', removedAt: null, member: { status: 'ACTIVE' } },
      })
      if (!source?.member.profile || !profileSectionVisibilitySchema.catch(defaultProfileSectionVisibility()).parse(source.member.profile.sectionVisibility).lists) return null
      const existing = await prisma.memberList.findUnique({ select: { slug: true }, where: { memberId_idempotencyKey: { memberId, idempotencyKey: input.idempotencyKey } } })
      if (existing) return readList(existing.slug, memberId)
      const name = input.name ?? `${source.name} (copy)`
      const suffix = input.idempotencyKey.replaceAll('-', '')
      const duplicate = await prisma.$transaction(async (tx) => {
        const list = await tx.memberList.create({
          data: { description: source.description, genres: source.genres, idempotencyKey: input.idempotencyKey, memberId, name, origin: 'NATIVE', slug: `${listSlug(name)}-${suffix}`, visibility: input.visibility },
          select: { id: true, slug: true },
        })
        if (source.items.length) await tx.listItem.createMany({ data: source.items.map((item, index) => ({ catalogKind: item.catalogKind, listId: list.id, note: item.note, origin: 'NATIVE', position: index + 1, tmdbId: item.tmdbId })) })
        const layout = await tx.tasteDocument.findUnique({ where: { memberId_kind_key: { memberId: source.memberId, kind: 'list', key: source.id } } })
        if (layout) await tx.tasteDocument.create({ data: { memberId, kind: 'list', key: list.id, data: layout.data as Prisma.InputJsonValue, revision: 1 } })
        return list
      })
      return readList(duplicate.slug, memberId)
    },
    async addListCollaborator(ownerId: string, listId: string, input: AddMemberListCollaboratorRequest) {
      const [list, invitee] = await Promise.all([
        prisma.memberList.findFirst({ select: { id: true, memberId: true }, where: { id: listId, memberId: ownerId } }),
        prisma.profile.findUnique({ select: { memberId: true }, where: { username: input.username } }),
      ])
      if (!list || !invitee || invitee.memberId === ownerId) return false
      const active = await prisma.member.findFirst({ select: { id: true }, where: { id: invitee.memberId, status: 'ACTIVE' } })
      if (!active) return false
      await prisma.memberListCollaborator.createMany({ data: [{ listId, memberId: active.id }], skipDuplicates: true })
      return true
    },
    async removeListCollaborator(ownerId: string, listId: string, username: string) {
      const [list, invitee] = await Promise.all([
        prisma.memberList.findFirst({ select: { id: true }, where: { id: listId, memberId: ownerId } }),
        prisma.profile.findUnique({ select: { memberId: true }, where: { username } }),
      ])
      if (!list || !invitee) return false
      const removed = await prisma.memberListCollaborator.deleteMany({ where: { listId, memberId: invitee.memberId } })
      return removed.count === 1
    },
    async appendListTitle(memberId, listId, title) {
      return prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`consumit:list:${listId}`}))`
        const editable = await tx.memberList.findFirst({ select: { id: true }, where: { id: listId, member: { status: 'ACTIVE' }, OR: [{ memberId }, { collaborators: { some: { memberId } } }] } })
        if (!editable) return false
        const catalogKind = storedKind(title.kind)
        const existing = await tx.listItem.findFirst({ select: { id: true }, where: { listId, catalogKind, tmdbId: title.id } })
        if (existing) return true
        const tail = await tx.listItem.aggregate({ _max: { position: true }, where: { listId } })
        await tx.listItem.create({ data: { catalogKind, listId, position: (tail._max.position ?? 0) + 1, tmdbId: title.id, origin: 'NATIVE' } })
        return true
      })
    },
    async saveList(memberId, slug) {
      const list = await prisma.memberList.findFirst({
        include: { member: { include: { profile: true } } },
        where: { slug, visibility: { in: ['public', 'unlisted'] }, member: { status: 'ACTIVE' } },
      })
      if (!list || list.memberId === memberId || !list.member.profile || (list.visibility === 'public' && !profileSectionVisibilitySchema.catch(defaultProfileSectionVisibility()).parse(list.member.profile.sectionVisibility).lists)) return false
      await prisma.savedMemberList.upsert({
        create: { listId: list.id, listName: list.name, listSlug: list.slug, memberId, ownerDisplayName: list.member.profile.displayName, ownerUsername: list.member.profile.username },
        update: {},
        where: { memberId_listId: { listId: list.id, memberId } },
      })
      return true
    },
    async removeSavedList(memberId, listId) {
      await prisma.savedMemberList.deleteMany({ where: { listId, memberId } })
      return true
    },
    async updateListContent(memberId, listId, changes: UpdateMemberListContentRequest) {
      return prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`consumit:list:${listId}`}))`
        const current = await tx.memberList.findFirst({
          select: { id: true, memberId: true },
          where: { id: listId, member: { status: 'ACTIVE' }, OR: [{ memberId }, { collaborators: { some: { memberId } } }] },
        })
        if (!current || (current.memberId !== memberId && changes.visibility !== undefined)) return false
        await tx.listItem.deleteMany({ where: { listId } })
        if (changes.items.length) await tx.listItem.createMany({
          data: changes.items.map((item, index) => ({ catalogKind: storedKind(item.kind), listId, note: item.note ?? null, origin: 'NATIVE', position: index + 1, sourceKey: null, tmdbId: item.id })),
        })
        await tx.memberList.update({
          data: { description: changes.description, name: changes.name, origin: 'NATIVE', sourceKey: null, ...(changes.visibility ? { visibility: changes.visibility } : {}) },
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
            reviews: { where: { removedAt: null }, orderBy: [{ reviewedOn: 'desc' }, { createdAt: 'desc' }], take: 30 },
            _count: { select: { diaryEntries: true, followers: true, following: true, lists: true, reviews: true, savedTitles: true, watchHistory: true, watchedTitles: true } },
          },
          where: { id: memberId, status: 'ACTIVE' },
        }),
        prisma.rating.groupBy({ by: ['value'], _count: { _all: true }, where: { memberId } }),
        prisma.follow.count({ where: { followingId: memberId, follower: { status: 'ACTIVE' } } }),
        prisma.follow.count({ where: { followerId: memberId, following: { status: 'ACTIVE' } } }),
      ])
      if (!member?.profile) return null
      return {
        canonicalUsername: member.profile.username,
        diary: member.diaryEntries.map((item) => ({ ...diaryEpisodeFields(item), entryId: item.id, id: item.tmdbId, kind: kind(item.catalogKind), origin: origin(item.origin), rewatch: item.rewatch, sourceKey: item.sourceKey, tags: item.tags, watchedOn: day(item.watchedOn) })),
        favorites: member.favorites.map((item, index) => ({ id: item.tmdbId, kind: kind(item.catalogKind), origin: origin(item.origin), position: index + 1, sourceKey: item.sourceKey })),
        lists: member.lists.map((list) => ({ description: list.description, id: list.id, itemCount: list._count.items, name: list.name, origin: origin(list.origin), slug: list.slug, visibility: listVisibility(list.visibility) })),
        profile: profileView(member.profile, member.createdAt),
        reviews: member.reviews.map((item) => ({ body: item.spoiler ? 'Contains spoilers. Open the review to read.' : item.body, id: item.tmdbId, kind: kind(item.catalogKind), origin: origin(item.origin), reviewedOn: item.reviewedOn ? day(item.reviewedOn) : null, reviewId: item.id, sourceKey: item.sourceKey, tags: item.tags })),
        ratingDistribution: Array.from({ length: 10 }, (_, index) => {
          const value = index + 1
          return { count: ratingCounts.find((row) => row.value === value)?._count._all ?? 0, value }
        }),

        social: { followers, following },
        statistics: {
          activity: member._count.diaryEntries + member._count.reviews,
          diaryEntries: member._count.diaryEntries,
          history: member._count.watchHistory,
          lists: member._count.lists,
          reviews: member._count.reviews,
          watchlist: member._count.savedTitles,
          watched: member._count.watchedTitles,
        },
      }
    },
    async profileArchive(username, collection, viewerMemberId, cursor, limit = 30): Promise<MemberProfileArchivePage | null> {
      const memberId = await activeMemberId(username)
      if (!memberId || (cursor && cursor.collection !== collection)) return null
      const owner = await prisma.member.findFirst({
        select: { id: true, profile: { select: { sectionVisibility: true } } },
        where: { id: memberId, status: 'ACTIVE' },
      })
      if (!owner?.profile) return null
      const isOwner = memberId === viewerMemberId
      const visibleSections = profileSectionVisibilitySchema.catch(defaultProfileSectionVisibility()).parse(owner.profile.sectionVisibility)
      const publicSection = collection === 'reviews' ? 'reviews'
        : collection === 'lists' ? 'lists'
          : collection === 'likes' ? 'likes'
            : collection === 'tags' ? 'tags'
              : collection === 'watchlist' ? 'watchlist'
                : collection === 'films' ? 'watched'
                  : collection === 'diary' ? 'diary'
                    : collection === 'history' ? 'history'
                      : collection === 'activity' ? 'activity' : null
      if (!isOwner && (!publicSection || !visibleSections[publicSection] || (collection === 'tags' && !visibleSections.reviews))) return null

      const pageSize = Math.min(50, Math.max(1, limit))
      const take = pageSize + 1
      const encode = (value: Omit<MemberProfileArchiveCursor, 'collection'>) => JSON.stringify({ collection, ...value })
      const createdAt = cursor?.createdAt ? new Date(cursor.createdAt) : undefined
      const updatedAt = cursor?.updatedAt ? new Date(cursor.updatedAt) : undefined
      const watchedOn = cursor?.watchedOn ? new Date(cursor.watchedOn) : undefined
      const completedAt = cursor?.completedAt ? new Date(cursor.completedAt) : undefined
      const validDate = (value: Date | undefined) => value === undefined || !Number.isNaN(value.getTime())
      if (!validDate(createdAt) || !validDate(updatedAt) || !validDate(watchedOn) || !validDate(completedAt)) return null
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

      if (collection === 'history') {
        if (cursor && !completedAt) return null
        const rows = await prisma.watchHistoryEntry.findMany({
          orderBy: [{ completedAt: 'desc' }, { id: 'desc' }],
          take,
          where: { memberId, ...(cursor && completedAt ? { OR: [{ completedAt: { lt: completedAt } }, { completedAt, id: { lt: cursor.id } }] } : {}) },
        })
        const page = rows.slice(0, pageSize)
        const items = page.map((row) => ({ completedAt: row.completedAt.toISOString(), entryId: row.id, id: row.tmdbId, kind: kind(row.catalogKind), ...(row.catalogKind === 'SERIES' || row.season > 0 ? { season: row.season } : {}), ...(row.episode > 0 ? { episode: row.episode } : {}) }))
        const last = page.at(-1)
        return { collection, items, nextCursor: next(rows.length > pageSize, last ? { completedAt: last.completedAt.toISOString(), id: last.id } : null) }
      }

      if (collection === 'reviews') {
        if (cursor && !createdAt) return null
        const rows = await prisma.review.findMany({
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take,
          where: { memberId, removedAt: null, ...(cursor && createdAt ? { OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: cursor.id } }] } : {}) },
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
            ...(!isOwner ? { visibility: 'public' } : {}),
            ...(cursor && updatedAt ? { OR: [{ updatedAt: { lt: updatedAt } }, { updatedAt, id: { lt: cursor.id } }] } : {}),
          },
        })
        const hasMore = rows.length > pageSize
        const page = rows.slice(0, pageSize)
        const items = page.map((list) => ({ description: list.description, id: list.id, itemCount: list._count.items, name: list.name, origin: origin(list.origin), slug: list.slug, visibility: listVisibility(list.visibility) }))
        const last = page.at(-1)
        return { collection, items, nextCursor: next(hasMore, last ? { id: last.id, updatedAt: last.updatedAt.toISOString() } : null) }
      }

      

      if (collection === 'tags') {
        const rows = await prisma.$queryRaw<Array<{ count: number; tag: string }>>`
          SELECT "tag", COUNT(*)::int AS "count"
          FROM (
            SELECT unnest("tags") AS "tag" FROM "Review" WHERE "memberId" = ${memberId}
          ) AS "tag_uses"
          WHERE "tag" <> ''
          GROUP BY "tag"
          ORDER BY "count" DESC, "tag" ASC
          LIMIT 100
        `
        return { collection, items: rows.map(({ count, tag }) => ({ count: Number(count), tag })), nextCursor: null }
      }

      if (collection === 'watchlist') {
        if (cursor && !createdAt) return null
        const rows = await prisma.savedTitle.findMany({
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take,
          where: { memberId, removedAt: null, ...(cursor && createdAt ? { OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: cursor.id } }] } : {}) },
        })
        const page = rows.slice(0, pageSize)
        const last = page.at(-1)
        return { collection, items: page.map((row) => ({ id: row.tmdbId, kind: kind(row.catalogKind) })), nextCursor: next(rows.length > pageSize, last ? { createdAt: last.createdAt.toISOString(), id: last.id } : null) }
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
        isOwner || visibleSections.diary
          ? prisma.diaryEntry.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take, where: { memberId, ...eventFilter('diary') } })
          : Promise.resolve([]),
        isOwner || visibleSections.reviews
          ? prisma.review.findMany({ orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take, where: { memberId, ...eventFilter('review') } })
          : Promise.resolve([]),
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
        await syncReleaseTracking(tx, memberId, undefined, outboxEnabled)
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
    async titleReviews(ref: CatalogRef, page: number, _sort: TitleReviewSort, viewerMemberId?: string): Promise<TitleReviewsPage> {
      const catalogKind = storedKind(ref.kind)
      const viewerBlockFilter = viewerMemberId ? Prisma.sql`
        AND NOT EXISTS (
          SELECT 1 FROM "TasteBlock" block
          WHERE (block."actorId" = ${viewerMemberId} AND block."targetId" = r."memberId")
             OR (block."actorId" = r."memberId" AND block."targetId" = ${viewerMemberId})
        )
      ` : Prisma.empty
      const fromWhere = Prisma.sql`
        FROM "Review" r
        JOIN "Member" m ON m."id" = r."memberId" AND m."status" = 'ACTIVE'
        JOIN "Profile" p ON p."memberId" = m."id"
        LEFT JOIN "Rating" rating ON rating."memberId" = r."memberId"
          AND rating."catalogKind" = r."catalogKind"
          AND rating."tmdbId" = r."tmdbId"
        WHERE r."catalogKind" = ${catalogKind}::"CatalogKind"
          AND r."tmdbId" = ${ref.id}
          AND r."removedAt" IS NULL
          AND p."sectionVisibility"->'reviews' IS DISTINCT FROM 'false'::jsonb
          ${viewerBlockFilter}
      `
      const [counts, rows] = await Promise.all([
        prisma.$queryRaw<Array<{ totalResults: number }>>(Prisma.sql`SELECT COUNT(*)::int AS "totalResults" ${fromWhere}`),
        prisma.$queryRaw<Array<{
          avatarStyle: string
          avatarUrl: string | null
          body: string
          displayName: string | null
          rating: number | null
          reviewId: string
          reviewedOn: Date | null
          spoiler: boolean
          username: string
        }>>(Prisma.sql`
          SELECT
            p."avatarStyle",
            p."avatarUrl",
            r."body",
            p."displayName",
            rating."value" AS "rating",
            r."id" AS "reviewId",
            r."reviewedOn",
            r."spoiler",
            p."username"
          ${fromWhere}
          ORDER BY r."createdAt" DESC, r."id" DESC
          LIMIT ${TITLE_REVIEWS_PAGE_SIZE}
          OFFSET ${(page - 1) * TITLE_REVIEWS_PAGE_SIZE}
        `),
      ])
      const totalResults = counts[0]?.totalResults ?? 0

      return {
        items: rows.map((row) => ({
          author: {
            avatarStyle: avatarStyleSchema.catch('dusk').parse(row.avatarStyle),
            avatarUrl: row.avatarUrl,
            displayName: row.displayName,
            username: row.username,
          },
          body: row.spoiler ? 'Contains spoilers. Open the review to read.' : row.body,
          rating: row.rating,
          reviewId: row.reviewId,
          reviewedOn: row.reviewedOn ? day(row.reviewedOn) : null,
        })),
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
        await syncReleaseTracking(tx, memberId, undefined, outboxEnabled)
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
        body: row.spoiler ? 'Contains spoilers. Open the review to read.' : row.body,
        id: row.tmdbId,
        kind: kind(row.catalogKind),
        origin: origin(row.origin),
        reviewId: row.id,
        reviewedOn: row.reviewedOn ? day(row.reviewedOn) : null,
        sourceKey: row.sourceKey,
        tags: row.tags,
      }
    },
    async continueWatching(memberId, cursor, limit) {
      const after: { at: string; id: string } = cursor ? JSON.parse(cursor) : { at: '9999-01-01T00:00:00.000Z', id: 'zzzz' }
      const rows = await prisma.$queryRaw<(Parameters<typeof progressView>[0] & { id: string; hiddenFromContinueAt: Date | null })[]>`
        WITH latest AS (
          SELECT DISTINCT ON ("catalogKind", "tmdbId") * FROM "PlaybackProgress"
          WHERE "memberId" = ${memberId}
          ORDER BY "catalogKind", "tmdbId", "updatedAt" DESC, "id" DESC
        ) SELECT * FROM latest WHERE ("updatedAt", "id") < (${new Date(after.at)}, ${after.id})
        ORDER BY "updatedAt" DESC, "id" DESC LIMIT ${limit + 1}`
      return { items: rows.slice(0, limit).map(row => ({ ...progressView(row), hiddenAt: row.hiddenFromContinueAt?.toISOString() ?? null })), nextCursor: rows.length > limit ? JSON.stringify({ at: rows[limit - 1]!.updatedAt.toISOString(), id: rows[limit - 1]!.id }) : null }
    },
    async hideContinueWatching(memberId, ref) {
      const key = progressKey(memberId, ref)
      await prisma.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${memberId}))`
        await requireActiveTrackingMember(tx, memberId)
        await tx.$executeRaw`UPDATE "PlaybackProgress" SET "hiddenFromContinueAt" = NOW() WHERE "memberId" = ${memberId} AND "catalogKind" = ${key.catalogKind}::"CatalogKind" AND "tmdbId" = ${ref.id}`
      })
    },
    async recommendationDismissals(memberId) {
      return (await prisma.recommendationDismissal.findMany({ where: { memberId }, orderBy: { createdAt: 'desc' }, take: 2000 })).map(row => ({ kind: kind(row.catalogKind), id: row.tmdbId }))
    },
    async filterRecommendations(memberId, refs) {
      if (!refs.length) return []
      const OR = refs.map(ref => ({ catalogKind: progressKey(memberId, ref).catalogKind, tmdbId: ref.id }))
      const [history, watched, dismissed] = await Promise.all([
        prisma.watchHistoryEntry.findMany({ where: { memberId, OR }, distinct: ['catalogKind', 'tmdbId'], select: { catalogKind: true, tmdbId: true } }),
        prisma.watchedTitle.findMany({ where: { memberId, OR }, select: { catalogKind: true, tmdbId: true } }),
        prisma.recommendationDismissal.findMany({ where: { memberId, OR }, select: { catalogKind: true, tmdbId: true } }),
      ])
      const excluded = new Set([...history, ...watched, ...dismissed].map(row => `${kind(row.catalogKind)}:${row.tmdbId}`))
      return refs.filter(ref => !excluded.has(`${ref.kind}:${ref.id}`))
    },
    async dismissRecommendation(memberId, ref, dismissed) {
      const key = progressKey(memberId, ref), where = { memberId, catalogKind: key.catalogKind, tmdbId: ref.id }
      await prisma.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${memberId}))`
        await requireActiveTrackingMember(tx, memberId)
        if (dismissed) {
          if (await tx.recommendationDismissal.count({ where: { memberId } }) >= 2000 && !await tx.recommendationDismissal.findUnique({ where: { memberId_catalogKind_tmdbId: where } })) throw new ApiError('CONFLICT', 'Reset some recommendations before hiding more titles.')
          await tx.recommendationDismissal.upsert({ where: { memberId_catalogKind_tmdbId: where }, create: where, update: {} })
        }
        else await tx.recommendationDismissal.deleteMany({ where })
      })
    },
    async resetRecommendationDismissals(memberId) { await prisma.$transaction(async tx => { await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${memberId}))`; await requireActiveTrackingMember(tx, memberId); await tx.recommendationDismissal.deleteMany({ where: { memberId } }) }) },
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
        update: { hiddenFromContinueAt: null, completed, ...(input.durationSeconds !== undefined ? { durationSeconds: input.durationSeconds } : {}), positionSeconds },
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
        const current = await tx.memberList.findFirst({ select: { id: true, memberId: true }, where: { id: listId, member: { status: 'ACTIVE' }, OR: [{ memberId }, { collaborators: { some: { memberId } } }] } })
        if (!current || (current.memberId !== memberId && changes.visibility !== undefined)) return false
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
          revision: { increment: 1 },
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
