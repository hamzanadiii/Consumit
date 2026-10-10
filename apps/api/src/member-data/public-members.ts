import { avatarStyleSchema, type PublicMemberPage, type PublicMemberSummary, type PublicProfile, type PublicProfileCollection, type PublicProfileCollectionPage } from '@consumit/contracts'
import { Prisma, type PrismaClient } from '../../generated/prisma/client.js'
import { ApiError } from '../http/errors.ts'
import { z } from 'zod'

export interface PublicMembers {
  profile(username: string, viewer?: string): Promise<PublicProfile | null>
  search(query: string, cursor: string | undefined, limit: number, viewer?: string): Promise<PublicMemberPage>
  collection(username: string, collection: PublicProfileCollection, cursor: string | undefined, limit: number, viewer?: string): Promise<PublicProfileCollectionPage | null>
  follow(actor: string, target: string, following: boolean): Promise<void>
}

const profileFields = { username: true, displayName: true, avatarStyle: true, avatarUrl: true, bio: true, bannerUrl: true } as const
const publicMember = { status: 'ACTIVE', profile: { is: { visibility: 'public' } } } as const
const memberFields = { id: true, profile: { select: profileFields } } as const
type MemberRow = Prisma.MemberGetPayload<{ select: typeof memberFields }>
const kind = (value: string) => value === 'ANIME' ? 'anime' as const : value === 'SERIES' ? 'series' as const : 'movie' as const
const pageCursor = z.object({ owner: z.string(), collection: z.string(), id: z.string() })
const searchCursor = z.object({ q: z.string(), rank: z.number().int().min(0).max(1), username: z.string(), id: z.string() })
function decode<T>(cursor: string | undefined, schema: z.ZodType<T>): T | undefined {
  if (!cursor) return undefined
  try { return schema.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))) }
  catch { throw new ApiError('BAD_REQUEST', 'Use a valid member page cursor.') }
}
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')

export function createPublicMembers(prisma: PrismaClient): PublicMembers {
  async function resolve(username: string, viewer?: string) {
    const profile = await prisma.profile.findUnique({ where: { username }, select: { memberId: true } })
    const alias = profile ? null : await prisma.usernameAlias.findUnique({ where: { username }, select: { memberId: true } })
    const id = profile?.memberId ?? alias?.memberId
    if (!id) return null
    return prisma.member.findFirst({ where: { id, status: 'ACTIVE', ...(viewer === id ? {} : { profile: { is: { visibility: 'public' } } }) }, select: memberFields })
  }
  async function summaries(rows: MemberRow[], viewer?: string): Promise<PublicMemberSummary[]> {
    const followed = viewer && rows.length ? await prisma.follow.findMany({ where: { followerId: viewer, followingId: { in: rows.map(row => row.id) } }, select: { followingId: true } }) : []
    const ids = new Set(followed.map(row => row.followingId))
    return rows.flatMap(row => row.profile ? [{ id: row.id, username: row.profile.username, displayName: row.profile.displayName, avatarStyle: avatarStyleSchema.catch('dusk').parse(row.profile.avatarStyle), avatarUrl: row.profile.avatarUrl, isFollowing: ids.has(row.id) }] : [])
  }
  return {
    async profile(username, viewer) {
      const member = await resolve(username, viewer)
      if (!member?.profile) return null
      const [summary, favorites, ratings, reviews, lists, followers, following] = await Promise.all([
        summaries([member], viewer),
        prisma.favorite.findMany({ where: { memberId: member.id }, orderBy: { position: 'asc' }, take: 4, select: { catalogKind: true, tmdbId: true, position: true } }),
        prisma.rating.groupBy({ by: ['value'], where: { memberId: member.id }, _count: { _all: true } }),
        prisma.review.count({ where: { memberId: member.id } }),
        prisma.memberList.count({ where: { memberId: member.id, visibility: 'public' } }),
        prisma.follow.count({ where: { followingId: member.id, follower: publicMember } }),
        prisma.follow.count({ where: { followerId: member.id, following: publicMember } }),
      ])
      return { viewerIsOwner: false, canonicalUsername: member.profile.username, profile: { ...summary[0]!, bio: member.profile.bio, bannerUrl: member.profile.bannerUrl }, favorites: favorites.map(row => ({ kind: kind(row.catalogKind), id: row.tmdbId, position: row.position })), ratingDistribution: Array.from({ length: 10 }, (_, index) => ({ value: index + 1, count: ratings.find(row => row.value === index + 1)?._count._all ?? 0 })), statistics: { ratings: ratings.reduce((count, row) => count + row._count._all, 0), reviews, lists }, social: { followers, following } }
    },
    async search(query, cursor, limit, viewer) {
      const q = query.trim().replace(/^@+/, '').toLowerCase()
      if (q.length < 3 || q.length > 100) throw new ApiError('BAD_REQUEST', 'Type at least three characters to search people.')
      const after = decode(cursor, searchCursor)
      if (after && after.q !== q) throw new ApiError('BAD_REQUEST', 'This cursor belongs to another search.')
      const pattern = `%${q.replace(/[\\%_]/g, match => `\\${match}`)}%`
      const take = Math.min(50, Math.max(1, limit))
      const rows = await prisma.$queryRaw<Array<{ id: string; username: string; displayName: string | null; avatarStyle: string; avatarUrl: string | null; rank: number; normalized: string }>>(Prisma.sql`
        WITH matches AS (
          SELECT m.id, p.username, p."displayName", p."avatarStyle", p."avatarUrl",
            CASE WHEN lower(p.username) = ${q} THEN 0 ELSE 1 END AS rank, lower(p.username) AS normalized
          FROM "Profile" p JOIN "Member" m ON m.id = p."memberId"
          WHERE p.visibility = 'public' AND m.status = 'ACTIVE'
            AND (p.username ILIKE ${pattern} OR p."displayName" ILIKE ${pattern})
        ) SELECT * FROM matches ${after ? Prisma.sql`WHERE (rank, normalized, id) > (${after.rank}, ${after.username}, ${after.id})` : Prisma.empty}
        ORDER BY rank, normalized, id LIMIT ${take + 1}`)
      const page = rows.slice(0, take), last = page.at(-1)
      const items = await summaries(page.map(row => ({ id: row.id, profile: { ...row, bio: null, bannerUrl: null } })), viewer)
      return { items, nextCursor: rows.length > take && last ? encode({ q, rank: last.rank, username: last.normalized, id: last.id }) : null }
    },
    async collection(username, collection, cursor, limit, viewer) {
      const member = await resolve(username, viewer)
      if (!member?.profile) return null
      const after = decode(cursor, pageCursor)
      if (after && (after.owner !== member.id || after.collection !== collection)) throw new ApiError('BAD_REQUEST', 'This cursor belongs to another member page.')
      const take = Math.min(50, Math.max(1, limit)), where = { memberId: member.id, ...(after ? { id: { gt: after.id } } : {}) }
      const next = (rows: { id: string }[]) => rows.length > take ? encode({ owner: member.id, collection, id: rows[take - 1]!.id }) : null
      if (collection === 'ratings') {
        const rows = await prisma.rating.findMany({ where, orderBy: { id: 'asc' }, take: take + 1, select: { id: true, catalogKind: true, tmdbId: true, value: true } })
        return { collection, items: rows.slice(0, take).map(row => ({ id: row.tmdbId, kind: kind(row.catalogKind), value: row.value })), nextCursor: next(rows) }
      }
      if (collection === 'reviews') {
        const rows = await prisma.review.findMany({ where, orderBy: { id: 'asc' }, take: take + 1, select: { id: true, catalogKind: true, tmdbId: true, body: true, reviewedOn: true } })
        return { collection, items: rows.slice(0, take).map(row => ({ id: row.tmdbId, kind: kind(row.catalogKind), reviewId: row.id, body: row.body, reviewedOn: row.reviewedOn?.toISOString().slice(0, 10) ?? null })), nextCursor: next(rows) }
      }
      if (collection === 'lists') {
        const rows = await prisma.memberList.findMany({ where: { ...where, visibility: 'public' }, orderBy: { id: 'asc' }, take: take + 1, select: { id: true, slug: true, name: true, description: true, _count: { select: { items: true } } } })
        return { collection, items: rows.slice(0, take).map(row => ({ id: row.id, slug: row.slug, name: row.name, description: row.description, itemCount: row._count.items })), nextCursor: next(rows) }
      }
      const relation = collection === 'followers' ? 'follower' : 'following'
      const rows = await prisma.follow.findMany({ where: { [collection === 'followers' ? 'followingId' : 'followerId']: member.id, ...(after ? { id: { gt: after.id } } : {}), [relation]: viewer === member.id ? { status: 'ACTIVE' } : publicMember }, orderBy: { id: 'asc' }, take: take + 1, select: { id: true, followerId: true, followingId: true } })
      const ids = rows.slice(0, take).map(row => relation === 'follower' ? row.followerId : row.followingId)
      const targets = await prisma.member.findMany({ where: { id: { in: ids }, status: 'ACTIVE' }, select: { ...memberFields, profile: { select: { ...profileFields, visibility: true } } } })
      const visible = await summaries(targets.filter(row => row.profile?.visibility === 'public'), viewer)
      const people = ids.flatMap<(PublicMemberSummary & { private: false }) | { id: string; private: true }>(id => {
        const summary = visible.find(row => row.id === id)
        if (summary) return [{ ...summary, private: false as const }]
        return viewer === member.id && targets.some(row => row.id === id) ? [{ id, private: true as const }] : []
      })
      return { collection, items: people, nextCursor: next(rows) }
    },
    async follow(actor, target, following) {
      if (actor === target) throw new ApiError('BAD_REQUEST', 'You cannot follow yourself.')
      if (!following) { await prisma.follow.deleteMany({ where: { followerId: actor, followingId: target } }); return }
      await prisma.$transaction(async tx => {
        const retained = await tx.follow.findUnique({ where: { followerId_followingId: { followerId: actor, followingId: target } }, select: { id: true } })
        if (retained) return
        const [member, acting] = await Promise.all([tx.member.findFirst({ where: { id: target, ...publicMember }, select: { id: true } }), tx.member.findFirst({ where: { id: actor, status: 'ACTIVE' }, select: { id: true } })])
        if (!member || !acting) throw new ApiError('NOT_FOUND', 'Profile not found.')
        await tx.follow.createMany({ data: [{ followerId: actor, followingId: target }], skipDuplicates: true })
      })
    },
  }
}
