import { createHash } from 'node:crypto'
import {
  defaultProfileSectionVisibility, profileSectionVisibilitySchema, tastePresentationSchema,
  tasteEditionSchema, tasteListLayoutSchema,
  tasteRecommendationResponseSchema,
  type CatalogRef, type TastePresentation, type TasteReviewWrite, type TasteListWrite,
  type TasteRecommendationResponse,
  type TasteTarget, type TasteEdition, type TasteProfile,
} from '@consumit/contracts'
import { Prisma, type PrismaClient } from '../../generated/prisma/client.js'
import { ApiError } from '../http/errors.ts'

type Tx = Prisma.TransactionClient
const json = (data: unknown) => JSON.parse(JSON.stringify(data)) as Prisma.InputJsonValue
const catalogKind = (kind: string) => kind === 'anime' ? 'ANIME' as const : kind === 'series' ? 'SERIES' as const : 'MOVIE' as const
const ref = (row: { catalogKind: string; tmdbId: number }) => ({ kind: row.catalogKind.toLowerCase() as 'movie' | 'series' | 'anime', id: row.tmdbId })
const profileSelect = { id: true, status: true, tasteRestricted: true, profile: true } as const
type Person = Prisma.MemberGetPayload<{ select: typeof profileSelect }>
const author = (person: Person) => ({ id: person.id, username: person.profile!.username, name: person.profile!.displayName ?? person.profile!.username, avatarUrl: person.profile!.avatarUrl })
const visible = (person: Person) => profileSectionVisibilitySchema.catch(defaultProfileSectionVisibility()).parse(person.profile?.sectionVisibility)
const missing = () => new ApiError('NOT_FOUND', 'This publication is unavailable.')
const conflict = () => new ApiError('CONFLICT', 'This changed in another window. Your draft is safe; reload the latest version before saving.')
const recommendationResponses = {
  saved: 'SAVED',
  'already-seen': 'ALREADY_SEEN',
  'not-interested': 'NOT_INTERESTED',
} as const
const recommendationResponse = (value: string | null): TasteRecommendationResponse | null => {
  if (value === null) return null
  const parsed = tasteRecommendationResponseSchema.safeParse(value.toLowerCase().replaceAll('_', '-'))
  return parsed.success ? parsed.data : null
}

export function createTasteRepository(db: PrismaClient) {
  async function person(id: string, tx: Tx = db) {
    const row = await tx.member.findUnique({ where: { id }, select: profileSelect })
    if (!row?.profile || row.status !== 'ACTIVE') throw missing()
    return row
  }
  async function username(name: string) {
    const p = await db.profile.findUnique({ where: { username: name } })
    const alias = p ? null : await db.usernameAlias.findUnique({ where: { username: name } })
    return person(p?.memberId ?? alias?.memberId ?? '')
  }
  async function blocked(a: string | undefined, b: string, tx: Tx = db) {
    return Boolean(a && a !== b && await tx.tasteBlock.findFirst({ where: { OR: [{ actorId: a, targetId: b }, { actorId: b, targetId: a }] } }))
  }
  async function writable(memberId: string, tx: Tx) {
    await tx.$queryRaw`SELECT id FROM "Member" WHERE id = ${memberId} FOR UPDATE`
    const member = await person(memberId, tx)
    if (member.tasteRestricted) throw new ApiError('FORBIDDEN', 'Publishing is restricted for this member.')
    return member
  }
  async function document(memberId: string, kind: string, key: string, tx: Tx = db) {
    return tx.tasteDocument.findUnique({ where: { memberId_kind_key: { memberId, kind, key } } })
  }
  async function writeDocument(tx: Tx, memberId: string, kind: string, key: string, data: unknown, revision: number, publish = false) {
    const old = await document(memberId, kind, key, tx)
    if ((old?.revision ?? 0) !== revision) throw conflict()
    return tx.tasteDocument.upsert({ where: { memberId_kind_key: { memberId, kind, key } },
      create: { memberId, kind, key, data: json(data), revision: 1, ...(publish ? { published: json(data), publishedAt: new Date() } : {}) },
      update: { data: json(data), revision: { increment: 1 }, ...(publish ? { published: json(data), publishedAt: new Date() } : {}) },
    })
  }
  async function target(input: TasteTarget, viewer?: string, tx: Tx = db) {
    let memberId: string, href: string, title: string
    if (input.kind === 'review') {
      const row = await tx.review.findUnique({ where: { id: input.id } })
      if (!row || row.removedAt) throw missing()
      memberId = row.memberId; href = `/reviews/${row.id}`; title = 'review'
    } else if (input.kind === 'list') {
      const row = await tx.memberList.findUnique({ where: { id: input.id } })
      if (!row || row.removedAt) throw missing()
      const editor = viewer ? await tx.memberListCollaborator.findUnique({ where: { listId_memberId: { listId: row.id, memberId: viewer } } }) : null
      if (row.visibility === 'private' && row.memberId !== viewer && !editor) throw missing()
      memberId = row.memberId; href = `/lists/${row.slug}`; title = row.name
    } else if (input.kind === 'edition') {
      const row = await tx.tasteDocument.findFirst({ where: { id: input.id, kind: 'edition', removedAt: null } })
      if (!row || (!row.published && viewer !== row.memberId)) throw missing()
      memberId = row.memberId; href = ''; title = 'monthly edition'
    } else { memberId = input.id; href = ''; title = 'profile' }
    const owner = await person(memberId, tx)
    if (await blocked(viewer, memberId, tx)) throw missing()
    if (memberId !== viewer) {
      const sections = visible(owner)
      if (input.kind === 'review' && !sections.reviews) throw missing()
      if (input.kind === 'list') {
        const list = await tx.memberList.findUniqueOrThrow({ where: { id: input.id } })
        if (list.visibility === 'public' && !sections.lists) throw missing()
      }
    }
    if (input.kind === 'edition') href = `/profile/${owner.profile!.username}/editions/${(await tx.tasteDocument.findUniqueOrThrow({ where: { id: input.id } })).key}`
    if (input.kind === 'member') href = `/profile/${owner.profile!.username}`
    return { owner, href, title }
  }
  async function review(reviewId: string, viewer?: string) {
    const { owner } = await target({ kind: 'review', id: reviewId }, viewer)
    const row = await db.review.findUniqueOrThrow({ where: { id: reviewId }, include: { _count: { select: { likes: true } } } })
    return { ...ref(row), reviewId, body: row.body, spoiler: row.spoiler, season: row.season, episode: row.episode,
      rating: row.ratingAtPublication, revision: row.revision, createdAt: row.createdAt.toISOString(), author: author(owner),
      likes: row._count.likes, liked: Boolean(viewer && await db.reviewLike.findUnique({ where: { reviewId_memberId: { reviewId, memberId: viewer } } })), owner: viewer === owner.id }
  }
  async function projectEdition(row: NonNullable<Awaited<ReturnType<typeof document>>>, owner: Person, draft = false) {
    const data = tasteEditionSchema.parse(draft ? row.data : row.published)
    // Features reference live sources: hiding a section cannot leak its old excerpt.
    const sections = visible(owner)
    if (!draft && (!sections.reviews || !await db.review.findFirst({ where: { id: data.reviewId ?? '', memberId: owner.id, removedAt: null } }))) data.reviewId = null
    const list = await db.memberList.findFirst({ where: { id: data.listId ?? '', memberId: owner.id, visibility: 'public', removedAt: null } })
    if (!draft && (!sections.lists || !list)) data.listId = null
    return { id: row.id, data, revision: row.revision, publishedAt: row.publishedAt?.toISOString() ?? null, author: author(owner), listHref: data.listId && list ? `/lists/${list.slug}` : null }
  }
  async function emit(tx: Tx, memberId: string, item: TasteTarget) {
    const now = new Date()
    await tx.tasteEvent.upsert({ where: { targetKind_targetId: { targetKind: item.kind, targetId: item.id } }, create: { memberId, targetKind: item.kind, targetId: item.id }, update: { createdAt: now } })
    const subscribers = await tx.tasteSubscription.findMany({ where: { updates: true, OR: [{ targetKind: item.kind, targetId: item.id }, { targetKind: 'member', targetId: memberId }] } })
    for (const sub of subscribers) {
      if (sub.memberId === memberId || await blocked(sub.memberId, memberId, tx)) continue
      try { await target(item, sub.memberId, tx) } catch { continue }
      await notify(tx, sub.memberId, memberId, item, 'New work from a curator you follow.')
    }
  }
  async function notify(tx: Tx, memberId: string, actorId: string, item: TasteTarget, text: string) {
    await tx.tasteNotification.upsert({ where: { memberId_actorId_targetKind_targetId: { memberId, actorId, targetKind: item.kind, targetId: item.id } },
      create: { memberId, actorId, targetKind: item.kind, targetId: item.id, text }, update: { text, read: false, createdAt: new Date() } })
  }
  return {
    review, target, blocked,
    async assertPublishingAllowed(memberId: string) { if ((await person(memberId)).tasteRestricted) throw new ApiError('FORBIDDEN', 'Publishing is restricted for this member.') },
    async share(kind: 'list' | 'review' | 'edition', id: string) {
      const t = await target({ kind, id })
      if (kind === 'review') { const row = await db.review.findUniqueOrThrow({ where: { id } }); return { title: 'In my own words', description: row.spoiler ? 'A review containing spoilers. Open to read.' : row.body.slice(0, 500), author: t.owner.profile!.username, href: t.href, refs: [ref(row)], spoiler: row.spoiler } }
      if (kind === 'list') { const row = await db.memberList.findUniqueOrThrow({ where: { id }, include: { items: { take: 4, orderBy: { position: 'asc' } } } }); return { title: row.name, description: row.description ?? '', author: t.owner.profile!.username, href: t.href, refs: row.items.map(ref), spoiler: false } }
      const row = await db.tasteDocument.findUniqueOrThrow({ where: { id } }), edition = tasteEditionSchema.parse(row.published)
      return { title: edition.title, description: edition.introduction, author: t.owner.profile!.username, href: t.href, refs: edition.picks.map(({ kind, id }) => ({ kind, id })), spoiler: false }
    },
    async profile(name: string, viewer?: string): Promise<TasteProfile> {
      const owner = await username(name)
      if (await blocked(viewer, owner.id)) throw missing()
      const own = owner.id === viewer, sections = visible(owner)
      const stored = await document(owner.id, 'profile', 'profile')
      const presentation = tastePresentationSchema.parse(stored?.data ?? {})
      const lists = sections.lists || own ? await db.memberList.findMany({ where: { memberId: owner.id, removedAt: null, ...(own ? {} : { visibility: 'public' }), ...(presentation.featuredLists.length ? { id: { in: presentation.featuredLists } } : {}) }, orderBy: { updatedAt: 'desc' }, take: 2, include: { items: { orderBy: { position: 'asc' }, take: 5 }, _count: { select: { items: true } } } }) : []
      const rows = await db.tasteDocument.findMany({ where: { memberId: owner.id, kind: 'edition', publishedAt: { not: null }, removedAt: null }, orderBy: { key: 'desc' }, take: 12 })
      if (presentation.featuredLists.length) lists.sort((a, b) => presentation.featuredLists.indexOf(a.id) - presentation.featuredLists.indexOf(b.id))
      const diary = sections.diary || own ? await db.diaryEntry.findMany({ where: { memberId: owner.id }, orderBy: [{ watchedOn: 'desc' }, { id: 'desc' }], take: 4 }) : []
      let featured = null
      if (sections.reviews || own) {
        const row = await db.review.findFirst({ where: { memberId: owner.id, removedAt: null, ...(presentation.featuredReview ? { id: presentation.featuredReview } : {}) }, orderBy: { createdAt: 'desc' } })
        if (row) featured = await review(row.id, viewer)
      }
      let comparison: TasteProfile['comparison'] = null
      if (viewer && !own) {
        const [mine, theirs, myFavorites, theirFavorites] = await Promise.all([
          sections.ratings ? db.rating.findMany({ where: { memberId: viewer } }) : [],
          sections.ratings ? db.rating.findMany({ where: { memberId: owner.id } }) : [],
          sections.favorites ? db.favorite.findMany({ where: { memberId: viewer } }) : [],
          sections.favorites ? db.favorite.findMany({ where: { memberId: owner.id } }) : [],
        ])
        const key = (x: { catalogKind: string; tmdbId: number }) => `${x.catalogKind}:${x.tmdbId}`
        const ratings = new Map(mine.map(x => [key(x), x.value]))
        const common = theirs.filter(x => ratings.has(key(x))).map(x => ({ ...ref(x), yours: ratings.get(key(x))!, theirs: x.value }))
        comparison = { sharedFavorites: theirFavorites.filter(x => myFavorites.some(y => key(x) === key(y))).map(ref), sharedHighRatings: common.filter(x => x.yours >= 8 && x.theirs >= 8).slice(0, 8), differences: common.filter(x => Math.abs(x.yours - x.theirs) >= 3).sort((a, b) => Math.abs(b.yours - b.theirs) - Math.abs(a.yours - a.theirs)).slice(0, 4), compared: common.length }
      }
      // Never return private feature identifiers in the presentation itself.
      if (!own) { presentation.featuredLists = lists.map(x => x.id); presentation.featuredReview = featured?.reviewId ?? null }
      return { presentation, revision: stored?.revision ?? 0, owner: own, editions: await Promise.all(rows.map(row => projectEdition(row, owner))),
        activity: diary.map(row => ({ ...ref(row), entryId: row.id, watchedOn: row.watchedOn.toISOString().slice(0, 10) })),
        review: featured, lists: lists.map(x => ({ id: x.id, slug: x.slug, name: x.name, description: x.description, count: x._count.items, refs: x.items.map(ref) })), comparison }
    },
    async savePresentation(memberId: string, data: TastePresentation, revision: number) {
      return db.$transaction(async tx => { await writable(memberId, tx)
        for (const listId of data.featuredLists) if (!await tx.memberList.findFirst({ where: { id: listId, memberId, removedAt: null } })) throw missing()
        if (data.featuredReview && !await tx.review.findFirst({ where: { id: data.featuredReview, memberId, removedAt: null } })) throw missing()
        const row = await writeDocument(tx, memberId, 'profile', 'profile', data, revision)
        return { revision: row.revision }
      })
    },
    async draft(memberId: string, key: string) { const row = await document(memberId, 'draft', key); return { data: row?.data ?? {}, revision: row?.revision ?? 0 } },
    async saveDraft(memberId: string, key: string, data: unknown, revision: number) {
      return db.$transaction(async tx => { await person(memberId, tx); await tx.$queryRaw`SELECT id FROM "Member" WHERE id = ${memberId} FOR UPDATE`; const row = await writeDocument(tx, memberId, 'draft', key, data, revision); return { revision: row.revision, data: row.data } })
    },
    async edition(name: string, month: string, viewer?: string, draft = false) {
      const owner = await username(name), row = await document(owner.id, 'edition', month)
      if (!row || row.removedAt || (draft && viewer !== owner.id) || (!draft && !row.published)) throw missing()
      await target({ kind: 'edition', id: row.id }, viewer)
      return projectEdition(row, owner, draft)
    },
    async saveEdition(memberId: string, data: TasteEdition, revision: number, publish: boolean) {
      if (publish && (data.picks.length !== 3 || data.picks.some(p => !p.reason.trim()))) throw new ApiError('BAD_REQUEST', 'Choose three picks and explain each one before publishing.')
      return db.$transaction(async tx => { await writable(memberId, tx)
        if ((await document(memberId, 'edition', data.month, tx))?.removedAt) throw new ApiError('FORBIDDEN', 'This edition was removed after review and cannot be republished.')
        if (data.reviewId && !await tx.review.findFirst({ where: { id: data.reviewId, memberId, removedAt: null } })) throw missing()
        if (data.listId && !await tx.memberList.findFirst({ where: { id: data.listId, memberId, visibility: 'public', removedAt: null } })) throw missing()
        const row = await writeDocument(tx, memberId, 'edition', data.month, data, revision, publish)
        if (publish) await emit(tx, memberId, { kind: 'edition', id: row.id })
        return { revision: row.revision, id: row.id }
      })
    },
    async unpublishEdition(memberId: string, month: string) {
      await db.tasteDocument.updateMany({ where: { memberId, kind: 'edition', key: month }, data: { published: Prisma.DbNull, publishedAt: null, revision: { increment: 1 } } })
    },
    async listLayout(listId: string, viewer?: string) {
      const { owner } = await target({ kind: 'list', id: listId }, viewer)
      const [row, list] = await Promise.all([document(owner.id, 'list', listId), db.memberList.findUniqueOrThrow({ where: { id: listId } })])
      const items = viewer ? await db.listItem.findMany({ where: { listId }, select: { catalogKind: true, tmdbId: true } }) : []
      const watched = viewer && items.length ? await db.watchedTitle.findMany({ where: { memberId: viewer, OR: items } }) : []
      return { layout: tasteListLayoutSchema.parse(row?.data ?? {}), revision: list.updatedAt.getTime(), watched: watched.map(ref) }
    },
    async saveList(memberId: string, listId: string, input: TasteListWrite) {
      return db.$transaction(async tx => { await writable(memberId, tx)
        const { owner } = await target({ kind: 'list', id: listId }, memberId, tx)
        const row = await tx.memberList.findUniqueOrThrow({ where: { id: listId } })
        const editor = await tx.memberListCollaborator.findUnique({ where: { listId_memberId: { listId, memberId } } })
        if (owner.id !== memberId && !editor) throw missing()
        if (row.updatedAt.getTime() !== input.revision) throw conflict()
        if (owner.id !== memberId && row.visibility !== input.visibility) throw new ApiError('FORBIDDEN', 'Only the curator can change visibility.')
        const chapters = new Set(input.layout.chapters.map(c => c.id)), keys = new Set(input.items.map(i => `${i.kind}:${i.id}`))
        if (chapters.size !== input.layout.chapters.length || Object.entries(input.layout.assignments).some(([key, chapter]) => !keys.has(key) || !chapters.has(chapter))) throw new ApiError('BAD_REQUEST', 'Choose valid list chapters.')
        const updated = await tx.memberList.updateMany({ where: { id: listId, updatedAt: row.updatedAt }, data: { name: input.name, description: input.description, genres: input.layout.genres, visibility: input.visibility, updatedAt: new Date(Math.max(Date.now(), row.updatedAt.getTime() + 1)) } })
        if (!updated.count) throw conflict()
        await tx.listItem.deleteMany({ where: { listId } })
        await tx.listItem.createMany({ data: input.items.map((item, position) => ({ listId, position: position + 1, catalogKind: catalogKind(item.kind), tmdbId: item.id, note: item.note ?? null })) })
        const layout = await document(owner.id, 'list', listId, tx)
        await writeDocument(tx, owner.id, 'list', listId, input.layout, layout?.revision ?? 0)
        if (input.publishUpdate && owner.id === memberId && input.visibility === 'public') await emit(tx, memberId, { kind: 'list', id: listId })
        return { revision: (await tx.memberList.findUniqueOrThrow({ where: { id: listId } })).updatedAt.getTime() }
      })
    },
    async publishReview(memberId: string, input: TasteReviewWrite) {
      return db.$transaction(async tx => {
        await writable(memberId, tx)
        const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex')
        const old = await tx.tasteMutation.findUnique({ where: { memberId_key: { memberId, key: input.idempotencyKey } } })
        if (old) { if (old.fingerprint !== fingerprint) throw conflict(); return old.result }
        const kind = catalogKind(input.kind), titleKey = { memberId, catalogKind: kind, tmdbId: input.id }
        if (input.rating === null) await tx.rating.deleteMany({ where: titleKey })
        else await tx.rating.upsert({ where: { memberId_catalogKind_tmdbId: titleKey }, create: { ...titleKey, value: input.rating }, update: { value: input.rating } })
        let reviewId: string | null = null
        if (input.body) {
          const data = { body: input.body, spoiler: input.spoiler, ...(input.season === undefined ? {} : { season: input.season }), ...(input.episode === undefined ? {} : { episode: input.episode }), ratingAtPublication: input.rating }
          if (input.reviewId) {
            const changed = await tx.review.updateMany({ where: { id: input.reviewId, ...titleKey, revision: input.revision, removedAt: null }, data: { ...data, revision: { increment: 1 } } })
            if (!changed.count) throw conflict()
            reviewId = input.reviewId
          } else {
            const row = await tx.review.create({ data: { ...titleKey, ...data, reviewedOn: input.log ? new Date(`${input.log.watchedOn}T00:00:00Z`) : null } })
            reviewId = row.id
            await emit(tx, memberId, { kind: 'review', id: reviewId })
          }
        }
        if (input.log) {
          await tx.watchedTitle.upsert({ where: { memberId_catalogKind_tmdbId: titleKey }, create: titleKey, update: {} })
          await tx.diaryEntry.create({ data: { ...titleKey, watchedOn: new Date(`${input.log.watchedOn}T00:00:00Z`), rewatch: input.log.rewatch, tags: input.log.tags, season: input.season ?? 0, episode: input.episode ?? 0, idempotencyKey: input.idempotencyKey } })
        }
        const result = { reviewId }
        await tx.tasteMutation.create({ data: { memberId, key: input.idempotencyKey, fingerprint, result } })
        return result
      })
    },
    async likeReview(memberId: string, reviewId: string, liked: boolean) {
      await target({ kind: 'review', id: reviewId }, memberId)
      if (liked) await db.reviewLike.upsert({ where: { reviewId_memberId: { reviewId, memberId } }, create: { reviewId, memberId }, update: {} })
      else await db.reviewLike.deleteMany({ where: { reviewId, memberId } })
    },
    async deleteReview(memberId: string, reviewId: string) {
      const result = await db.review.deleteMany({ where: { id: reviewId, memberId } })
      if (!result.count) throw missing()
    },
    async discussion(item: TasteTarget, viewer?: string, cursor?: string) {
      await target(item, viewer)
      if (cursor && !await db.tasteComment.findFirst({ where: { id: cursor, targetKind: item.kind, targetId: item.id } })) throw new ApiError('BAD_REQUEST', 'This page belongs to another discussion.')
      const rows = await db.tasteComment.findMany({ where: { targetKind: item.kind, targetId: item.id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 31, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) })
      const items = []
      for (const row of rows.slice(0, 30)) {
        if (await blocked(viewer, row.memberId)) continue
        let writer: Person
        try { writer = await person(row.memberId) } catch { continue }
        items.push({ id: row.id, body: row.deleted ? '' : row.body, spoiler: row.spoiler, parentId: row.parentId, revision: row.revision,
          createdAt: row.createdAt.toISOString(), author: author(writer), owner: row.memberId === viewer, deleted: row.deleted })
      }
      const sub = viewer ? await db.tasteSubscription.findUnique({ where: { memberId_targetKind_targetId: { memberId: viewer, targetKind: item.kind, targetId: item.id } } }) : null
      return { items, nextCursor: rows.length > 30 ? rows[29]!.id : null, muted: sub?.muted ?? false, canComment: Boolean(viewer && !(await person(viewer)).tasteRestricted) }
    },
    async comment(memberId: string, item: TasteTarget, input: { body: string; spoiler: boolean; parentId: string | null; idempotencyKey: string }) {
      return db.$transaction(async tx => {
        await writable(memberId, tx)
        const { owner } = await target(item, memberId, tx)
        if (!['review', 'list'].includes(item.kind)) throw new ApiError('BAD_REQUEST', 'This publication has no discussion.')
        const existing = await tx.tasteComment.findUnique({ where: { memberId_idempotencyKey: { memberId, idempotencyKey: input.idempotencyKey } } })
        if (existing) {
          if (existing.body !== input.body || existing.targetKind !== item.kind || existing.targetId !== item.id || existing.parentId !== input.parentId || existing.spoiler !== input.spoiler) throw conflict()
          return { id: existing.id }
        }
        const parent = input.parentId ? await tx.tasteComment.findFirst({ where: { id: input.parentId, targetKind: item.kind, targetId: item.id, parentId: null, deleted: false } }) : null
        if (input.parentId && !parent) throw new ApiError('BAD_REQUEST', 'Reply to an available top-level comment.')
        if (parent && await blocked(memberId, parent.memberId, tx)) throw missing()
        const row = await tx.tasteComment.create({ data: { memberId, targetKind: item.kind, targetId: item.id, ...input } })
        const recipient = parent?.memberId ?? owner.id
        const mute = await tx.tasteSubscription.findUnique({ where: { memberId_targetKind_targetId: { memberId: recipient, targetKind: item.kind, targetId: item.id } } })
        if (recipient !== memberId && !mute?.muted && !await blocked(memberId, recipient, tx)) await notify(tx, recipient, memberId, item, parent ? 'Someone replied to your comment.' : 'A new comment on your publication.')
        return { id: row.id }
      })
    },
    async editComment(memberId: string, commentId: string, changes: { body: string; spoiler: boolean; revision: number } | null) {
      return db.$transaction(async tx => {
        if (changes) await writable(memberId, tx)
        else await person(memberId, tx)
        const row = await tx.tasteComment.findFirst({ where: { id: commentId, memberId, ...(changes ? { deleted: false } : {}) } })
        if (!row) throw missing()
        if (!changes && row.deleted) return
        if (changes) await target({ kind: row.targetKind as TasteTarget['kind'], id: row.targetId }, memberId, tx)
        const updated = await tx.tasteComment.updateMany({ where: { id: commentId, memberId, deleted: false, ...(changes ? { revision: changes.revision } : {}) },
          data: changes ? { body: changes.body, spoiler: changes.spoiler, revision: { increment: 1 } } : { deleted: true, body: '', revision: { increment: 1 } } })
        if (!updated.count) {
          if (!changes && (await tx.tasteComment.findUnique({ where: { id: commentId } }))?.deleted) return
          throw conflict()
        }
      })
    },
    async subscription(memberId: string, item: TasteTarget) {
      await target(item, memberId)
      const row = await db.tasteSubscription.findUnique({ where: { memberId_targetKind_targetId: { memberId, targetKind: item.kind, targetId: item.id } } })
      return { subscribed: row?.updates ?? false, muted: row?.muted ?? false }
    },
    async subscribe(memberId: string, item: TasteTarget, mode: 'updates' | 'mute' | 'off' | 'unmute') {
      await target(item, memberId)
      const key = { memberId, targetKind: item.kind, targetId: item.id }
      const changes = mode === 'updates' || mode === 'off' ? { updates: mode === 'updates' } : { muted: mode === 'mute' }
      await db.tasteSubscription.upsert({ where: { memberId_targetKind_targetId: key }, create: { ...key, ...changes }, update: changes })
    },
    async block(memberId: string, targetId: string, enabled: boolean) {
      if (memberId === targetId) throw new ApiError('BAD_REQUEST', 'You cannot block yourself.')
      await person(targetId)
      await db.$transaction(async tx => {
        if (enabled) {
          await tx.tasteBlock.upsert({ where: { actorId_targetId: { actorId: memberId, targetId } }, create: { actorId: memberId, targetId }, update: {} })
          await tx.follow.deleteMany({ where: { OR: [{ followerId: memberId, followingId: targetId }, { followerId: targetId, followingId: memberId }] } })
          await tx.tasteNotification.deleteMany({ where: { OR: [{ memberId, actorId: targetId }, { memberId: targetId, actorId: memberId }] } })
        } else await tx.tasteBlock.deleteMany({ where: { actorId: memberId, targetId } })
      })
    },
    async blocks(memberId: string) {
      const rows = await db.tasteBlock.findMany({ where: { actorId: memberId }, take: 100 })
      const members = await db.member.findMany({ where: { id: { in: rows.map(r => r.targetId) }, profile: { isNot: null } }, select: profileSelect })
      return { items: members.map(author) }
    },
    async community(viewer: string | undefined, mode: 'following' | 'discover', query: string, kind: string, cursor?: string, genre?: string) {
      if (mode === 'following' && !viewer) throw new ApiError('UNAUTHENTICATED', 'Sign in to see your curators.')
      const follows = mode === 'following' ? await db.follow.findMany({ where: { followerId: viewer! }, select: { followingId: true } }) : null
      const items = []
      if (mode === 'discover') {
        if (cursor && !await db.memberList.findUnique({ where: { id: cursor } })) throw new ApiError('BAD_REQUEST', 'This collection page has expired.')
        const rows = await db.memberList.findMany({ where: { visibility: 'public', removedAt: null, ...(genre ? { genres: { has: genre } } : {}), ...(query ? { OR: [{ name: { contains: query, mode: 'insensitive' } }, { description: { contains: query, mode: 'insensitive' } }] } : {}), ...(kind !== 'all' ? { items: { some: { catalogKind: catalogKind(kind) } } } : {}) }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 41, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), include: { items: { orderBy: { position: 'asc' }, take: 5 } } })
        for (const row of rows.slice(0, 40)) {
          try { const t = await target({ kind: 'list', id: row.id }, viewer); items.push({ id: row.id, kind: 'list' as const, href: t.href, title: row.name, excerpt: row.description ?? '', spoiler: false, date: row.createdAt.toISOString(), author: author(t.owner), refs: row.items.map(ref) }) } catch { /* Current permissions filter every result. */ }
        }
        return { items, nextCursor: rows.length > 40 ? rows[39]!.id : null }
      }
      if (cursor && !await db.tasteEvent.findUnique({ where: { id: cursor } })) throw new ApiError('BAD_REQUEST', 'This feed page has expired.')
      const events = await db.tasteEvent.findMany({ where: { memberId: { in: follows!.map(f => f.followingId) } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 41, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) })
      for (const event of events.slice(0, 40)) {
        try {
          const item = { kind: event.targetKind as TasteTarget['kind'], id: event.targetId }, t = await target(item, viewer)
          if (item.kind === 'member') continue
          let title = t.title, excerpt = '', spoiler = false, refs: ReturnType<typeof ref>[] = []
          if (item.kind === 'list') {
            const row = await db.memberList.findUniqueOrThrow({ where: { id: item.id }, include: { items: { take: 5, orderBy: { position: 'asc' } } } })
            if (row.visibility !== 'public') continue
            excerpt = row.description ?? ''; refs = row.items.map(ref)
          } else if (item.kind === 'review') {
            const row = await db.review.findUniqueOrThrow({ where: { id: item.id } }); spoiler = row.spoiler; excerpt = spoiler ? '' : row.body.slice(0, 500); refs = [ref(row)]; title = `${author(t.owner).name} reviewed a ${ref(row).kind}`
          } else {
            const row = await db.tasteDocument.findUniqueOrThrow({ where: { id: item.id } }); if (!row.published) continue
            const edition = tasteEditionSchema.parse(row.published); title = edition.title; excerpt = edition.introduction; refs = edition.picks.map(({ kind, id }) => ({ kind, id }))
          }
          if (kind !== 'all' && !refs.some(r => r.kind === kind)) continue
          if (query && !`${title} ${excerpt}`.toLowerCase().includes(query.toLowerCase())) continue
          items.push({ id: event.id, kind: item.kind, href: t.href, title, excerpt, spoiler, date: event.createdAt.toISOString(), author: author(t.owner), refs })
        } catch { /* Deleted and hidden publications cannot linger in feeds. */ }
      }
      return { items, nextCursor: events.length > 40 ? events[39]!.id : null }
    },
    async notifications(memberId: string, cursor?: string) {
      if (cursor && !await db.tasteNotification.findFirst({ where: { id: cursor, memberId } })) throw new ApiError('BAD_REQUEST', 'This notification page is unavailable.')
      const rows = await db.tasteNotification.findMany({ where: { memberId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 31, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) })
      const items = []
      for (const row of rows.slice(0, 30)) {
        if (await blocked(memberId, row.actorId)) continue
        let href: string | null = null
        try { href = (await target({ kind: row.targetKind as TasteTarget['kind'], id: row.targetId }, memberId)).href } catch { /* No excerpt from unavailable content. */ }
        items.push({ id: row.id, text: href ? row.text : 'This publication is no longer available.', href, createdAt: row.createdAt.toISOString(), read: row.read })
      }
      return { items, nextCursor: rows.length > 30 ? rows[29]!.id : null }
    },
    async sendRecommendation(senderId: string, recipientId: string, title: CatalogRef) {
      if (senderId === recipientId) throw new ApiError('BAD_REQUEST', 'Choose someone else to recommend this to.')
      return db.$transaction(async tx => {
        const sender = await writable(senderId, tx)
        const recipient = await tx.member.findFirst({ where: { id: recipientId, status: 'ACTIVE', profile: { isNot: null } }, select: { id: true } })
        if (!recipient || await blocked(senderId, recipientId, tx)) throw missing()
        if (!await tx.follow.findUnique({ where: { followerId_followingId: { followerId: senderId, followingId: recipientId } }, select: { id: true } })) {
          throw new ApiError('FORBIDDEN', 'You can recommend titles only to someone you follow.')
        }
        const unique = { senderId, recipientId, catalogKind: catalogKind(title.kind), tmdbId: title.id }
        const existing = await tx.tasteRecommendation.findUnique({ where: { senderId_recipientId_catalogKind_tmdbId: unique } })
        if (existing) return { id: existing.id, title, sender: author(sender), response: recommendationResponse(existing.response), createdAt: existing.createdAt.toISOString() }
        const recent = await tx.tasteRecommendation.count({ where: { senderId, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } })
        if (recent >= 30) throw new ApiError('RATE_LIMITED', 'You have sent a lot of title recommendations today. Try again tomorrow.')
        const row = await tx.tasteRecommendation.create({ data: { senderId, recipientId, catalogKind: catalogKind(title.kind), tmdbId: title.id } })
        return { id: row.id, title, sender: author(sender), response: null, createdAt: row.createdAt.toISOString() }
      })
    },
    async recommendations(recipientId: string, cursor?: string) {
      await person(recipientId)
      if (cursor && !await db.tasteRecommendation.findFirst({ where: { id: cursor, recipientId }, select: { id: true } })) throw new ApiError('BAD_REQUEST', 'This recommendation page is unavailable.')
      const rows = await db.tasteRecommendation.findMany({
        where: { recipientId, sender: { status: 'ACTIVE', profile: { isNot: null } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 31,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: { sender: { select: profileSelect } },
      })
      const items = []
      for (const row of rows.slice(0, 30)) {
        if (await blocked(recipientId, row.senderId)) continue
        items.push({ id: row.id, title: ref(row), sender: author(row.sender), response: recommendationResponse(row.response), createdAt: row.createdAt.toISOString() })
      }
      return { items, nextCursor: rows.length > 30 ? rows[29]!.id : null }
    },
    async respondToRecommendation(recipientId: string, id: string, response: TasteRecommendationResponse) {
      await person(recipientId)
      const row = await db.tasteRecommendation.findFirst({ where: { id, recipientId }, select: { id: true, senderId: true } })
      if (!row || await blocked(recipientId, row.senderId)) throw missing()
      await db.tasteRecommendation.update({ where: { id }, data: { response: recommendationResponses[response], respondedAt: new Date() } })
    },
    async readNotifications(memberId: string) { await db.tasteNotification.updateMany({ where: { memberId, read: false }, data: { read: true } }) },
    async report(memberId: string, item: TasteTarget, reason: string, commentId: string | undefined, idempotencyKey: string) {
      const request = { action: 'report', item, reason, commentId: commentId ?? null }
      const fingerprint = createHash('sha256').update(JSON.stringify(request)).digest('hex')
      return db.$transaction(async tx => {
        const inserted = await tx.tasteMutation.createMany({
          data: [{ memberId, key: idempotencyKey, fingerprint, result: { reported: true } }],
          skipDuplicates: true,
        })
        if (!inserted.count) {
          const previous = await tx.tasteMutation.findUnique({ where: { memberId_key: { memberId, key: idempotencyKey } } })
          if (!previous || previous.fingerprint !== fingerprint) throw conflict()
          return previous.result
        }

        await target(item, memberId, tx)
        if (commentId && !await tx.tasteComment.findFirst({ where: { id: commentId, targetKind: item.kind, targetId: item.id } })) throw missing()
        const recent = await tx.tasteReport.count({ where: { reporterId: memberId, createdAt: { gte: new Date(Date.now() - 3600000) } } })
        if (recent >= 10) throw new ApiError('RATE_LIMITED', 'Please wait before sending another report.')
        await tx.tasteReport.create({ data: { reporterId: memberId, targetKind: item.kind, targetId: item.id, reason, commentId: commentId ?? null } })
        return { reported: true }
      })
    },
    async reports() {
      const rows = await db.tasteReport.findMany({ where: { status: { in: ['open', 'restrict'] } }, orderBy: { createdAt: 'asc' }, take: 100 })
      return { items: await Promise.all(rows.map(async r => {
        let content = 'Content is no longer available.', href: string | null = null
        if (r.commentId) content = (await db.tasteComment.findUnique({ where: { id: r.commentId } }))?.body || content
        else if (r.targetKind === 'review') { const row = await db.review.findUnique({ where: { id: r.targetId } }); if (row) { content = row.body; href = `/reviews/${row.id}` } }
        else if (r.targetKind === 'list') { const row = await db.memberList.findUnique({ where: { id: r.targetId }, include: { items: { orderBy: { position: 'asc' }, take: 500 } } }); if (row) { content = [row.name, row.description, ...row.items.map(i => i.note)].filter(Boolean).join('\n\n'); href = `/lists/${row.slug}` } }
        else if (r.targetKind === 'edition') { const row = await db.tasteDocument.findUnique({ where: { id: r.targetId } }); if (row?.published) content = JSON.stringify(row.published, null, 2) }
        else { const row = await db.profile.findUnique({ where: { memberId: r.targetId } }); if (row) { content = [row.displayName, row.bio].filter(Boolean).join('\n'); href = `/profile/${row.username}` } }
        return { id: r.id, reason: r.reason, target: { kind: r.targetKind, id: r.targetId }, commentId: r.commentId, createdAt: r.createdAt.toISOString(), status: r.status, content, href }
      })) }
    },
    async moderate(actorId: string, reportId: string, action: 'dismiss' | 'remove' | 'restrict' | 'restore', note: string) {
      await db.$transaction(async tx => {
        const report = await tx.tasteReport.findUnique({ where: { id: reportId } }); if (!report) throw missing()
        if (report.status === 'restrict' && action !== 'restore') throw new ApiError('BAD_REQUEST', 'Restore publishing to resolve this restriction.')
        if (action === 'remove') {
          if (report.commentId) await tx.tasteComment.updateMany({ where: { id: report.commentId }, data: { deleted: true, body: '' } })
          else if (report.targetKind === 'review') await tx.review.updateMany({ where: { id: report.targetId }, data: { removedAt: new Date() } })
          else if (report.targetKind === 'list') await tx.memberList.updateMany({ where: { id: report.targetId }, data: { removedAt: new Date() } })
          else if (report.targetKind === 'edition') await tx.tasteDocument.updateMany({ where: { id: report.targetId }, data: { removedAt: new Date() } })
          else throw new ApiError('BAD_REQUEST', 'Use Restrict for a member report.')
        }
        if (action === 'restrict' || action === 'restore') {
          let id = report.targetId
          if (report.commentId) id = (await tx.tasteComment.findUniqueOrThrow({ where: { id: report.commentId } })).memberId
          else if (report.targetKind === 'review') id = (await tx.review.findUniqueOrThrow({ where: { id: report.targetId } })).memberId
          else if (report.targetKind === 'list') id = (await tx.memberList.findUniqueOrThrow({ where: { id: report.targetId } })).memberId
          else if (report.targetKind === 'edition') id = (await tx.tasteDocument.findUniqueOrThrow({ where: { id: report.targetId } })).memberId
          await tx.member.update({ where: { id }, data: { tasteRestricted: action === 'restrict' } })
        }
        await tx.tasteReport.update({ where: { id: reportId }, data: { status: action } })
        await tx.tasteModeration.create({ data: { reportId, actorId, action, note } })
      })
    },
  }
}
export type TasteRepository = ReturnType<typeof createTasteRepository>
