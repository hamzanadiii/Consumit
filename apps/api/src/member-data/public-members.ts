import { avatarStyleSchema, defaultProfileSectionVisibility, profileSectionVisibilitySchema, type PublicListDiscovery, type PublicListDiscoveryItem, type PublicMemberPage, type PublicMemberSummary, type PublicProfile, type PublicProfileCollection, type PublicProfileCollectionPage } from '@consumit/contracts'
import { Prisma, type PrismaClient } from '../../generated/prisma/client.js'
import { ApiError } from '../http/errors.ts'
import { z } from 'zod'

export interface PublicMembers {
  profile(username: string, viewer?: string): Promise<PublicProfile | null>
  search(query: string, cursor: string | undefined, limit: number, viewer?: string): Promise<PublicMemberPage>
  collection(username: string, collection: PublicProfileCollection, cursor: string | undefined, limit: number, viewer?: string): Promise<PublicProfileCollectionPage | null>
  listDiscovery?(viewer?: string): Promise<PublicListDiscovery>
  follow(actor: string, target: string, following: boolean): Promise<void>
}

const profileFields = { username: true, displayName: true, avatarStyle: true, avatarUrl: true, bio: true, bannerUrl: true, sectionVisibility: true } as const
const publicMember = { status: 'ACTIVE', profile: { isNot: null } } as const
const memberFields = { id: true, profile: { select: profileFields } } as const
type MemberRow = Prisma.MemberGetPayload<{ select: typeof memberFields }>
type SummaryRow = { id: string; profile: Pick<NonNullable<MemberRow['profile']>, 'username' | 'displayName' | 'avatarStyle' | 'avatarUrl'> | null }
const kind = (value: string) => value === 'ANIME' ? 'anime' as const : value === 'SERIES' ? 'series' as const : 'movie' as const
const pageCursor = z.object({ owner: z.string(), collection: z.string(), id: z.string() })
const searchCursor = z.object({ q: z.string(), rank: z.number().int().min(0).max(1), username: z.string(), id: z.string() })
const discoveryListSelect = {
  id: true,
  slug: true,
  name: true,
  description: true,
  items: { orderBy: { position: 'asc' }, take: 5, select: { catalogKind: true, tmdbId: true } },
  _count: { select: { items: true } },
  member: { select: { profile: { select: { username: true, displayName: true, sectionVisibility: true } } } },
} as const
type DiscoveryListRow = Prisma.MemberListGetPayload<{ select: typeof discoveryListSelect }>
function decode<T>(cursor: string | undefined, schema: z.ZodType<T>): T | undefined {
  if (!cursor) return undefined
  try { return schema.parse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))) }
  catch { throw new ApiError('BAD_REQUEST', 'Use a valid member page cursor.') }
}
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url')

export function createPublicMembers(prisma: PrismaClient): PublicMembers {
  async function resolve(username: string) {
    const profile = await prisma.profile.findUnique({ where: { username }, select: { memberId: true } })
    const alias = profile ? null : await prisma.usernameAlias.findUnique({ where: { username }, select: { memberId: true } })
    const id = profile?.memberId ?? alias?.memberId
    if (!id) return null
    return prisma.member.findFirst({ where: { id, status: 'ACTIVE' }, select: memberFields })
  }
  const sections = (member: MemberRow) => profileSectionVisibilitySchema.catch(defaultProfileSectionVisibility()).parse(member.profile?.sectionVisibility)
  async function summaries(rows: SummaryRow[], viewer?: string): Promise<PublicMemberSummary[]> {
    const followed = viewer && rows.length ? await prisma.follow.findMany({ where: { followerId: viewer, followingId: { in: rows.map(row => row.id) } }, select: { followingId: true } }) : []
    const ids = new Set(followed.map(row => row.followingId))
    return rows.flatMap(row => row.profile ? [{ id: row.id, username: row.profile.username, displayName: row.profile.displayName, avatarStyle: avatarStyleSchema.catch('dusk').parse(row.profile.avatarStyle), avatarUrl: row.profile.avatarUrl, isFollowing: ids.has(row.id) }] : [])
  }
  function discoveryItem(row: DiscoveryListRow): PublicListDiscoveryItem | null {
    const profile = row.member.profile
    if (!profile) return null
    const visible = profileSectionVisibilitySchema.catch(defaultProfileSectionVisibility()).parse(profile.sectionVisibility)
    if (!visible.lists) return null
    return {
      list: { id: row.id, slug: row.slug, name: row.name, description: row.description, itemCount: row._count.items },
      owner: { username: profile.username, displayName: profile.displayName },
      preview: row.items.map(item => ({ kind: kind(item.catalogKind), id: item.tmdbId })),
    }
  }
  return {
    async profile(username, viewer) {
      const member = await resolve(username)
      if (!member?.profile) return null
      const visible = sections(member)
      const publicVisibility = { ...visible, tags: visible.tags && visible.reviews }
      const [summary, favorites, ratings, reviews, lists, followers, following] = await Promise.all([
        summaries([member], viewer),
        visible.favorites ? prisma.favorite.findMany({ where: { memberId: member.id }, orderBy: { position: 'asc' }, take: 4, select: { catalogKind: true, tmdbId: true, position: true } }) : Promise.resolve([]),
        visible.ratings ? prisma.rating.groupBy({ by: ['value'], where: { memberId: member.id }, _count: { _all: true } }) : Promise.resolve([]),
        visible.reviews ? prisma.review.count({ where: { memberId: member.id } }) : Promise.resolve(0),
        visible.lists ? prisma.memberList.count({ where: { memberId: member.id, visibility: 'public' } }) : Promise.resolve(0),
        visible.network ? prisma.follow.count({ where: { followingId: member.id, follower: publicMember } }) : Promise.resolve(0),
        visible.network ? prisma.follow.count({ where: { followerId: member.id, following: publicMember } }) : Promise.resolve(0),
      ])
      const [diary, history, watched, watchlist] = await Promise.all([
        visible.diary ? prisma.diaryEntry.count({ where: { memberId: member.id } }) : Promise.resolve(0),
        visible.history ? prisma.watchHistoryEntry.count({ where: { memberId: member.id } }) : Promise.resolve(0),
        visible.watched ? prisma.watchedTitle.count({ where: { memberId: member.id } }) : Promise.resolve(0),
        visible.watchlist ? prisma.savedTitle.count({ where: { memberId: member.id } }) : Promise.resolve(0),
      ])
      return {
        viewerIsOwner: false,
        canonicalUsername: member.profile.username,
        sectionVisibility: publicVisibility,
        profile: { ...summary[0]!, bio: member.profile.bio, bannerUrl: member.profile.bannerUrl },
        favorites: favorites.map(row => ({ kind: kind(row.catalogKind), id: row.tmdbId, position: row.position })),
        ratingDistribution: Array.from({ length: 10 }, (_, index) => ({ value: index + 1, count: ratings.find(row => row.value === index + 1)?._count._all ?? 0 })),
        statistics: {
          activity: visible.activity ? diary + reviews : 0,
          diary,
          history,
          lists,
          ratings: ratings.reduce((count, row) => count + row._count._all, 0),
          reviews,
          watchlist,
          watched,
        },
        social: { followers, following },
      }
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
          WHERE m.status = 'ACTIVE'
            AND (p.username ILIKE ${pattern} OR p."displayName" ILIKE ${pattern})
        ) SELECT * FROM matches ${after ? Prisma.sql`WHERE (rank, normalized, id) > (${after.rank}, ${after.username}, ${after.id})` : Prisma.empty}
        ORDER BY rank, normalized, id LIMIT ${take + 1}`)
      const page = rows.slice(0, take), last = page.at(-1)
      const items = await summaries(page.map(row => ({ id: row.id, profile: { ...row, bio: null, bannerUrl: null } })), viewer)
      return { items, nextCursor: rows.length > take && last ? encode({ q, rank: last.rank, username: last.normalized, id: last.id }) : null }
    },
    async collection(username, collection, cursor, limit, viewer) {
      const member = await resolve(username)
      if (!member?.profile) return null
      const visible = sections(member)
      const sectionForCollection = collection === 'ratings' ? 'ratings'
        : collection === 'reviews' ? 'reviews'
          : collection === 'lists' ? 'lists' : 'network'
      if (viewer !== member.id && !visible[sectionForCollection]) return null
      const after = decode(cursor, pageCursor)
      if (after && (after.owner !== member.id || after.collection !== collection)) throw new ApiError('BAD_REQUEST', 'This cursor belongs to another member page.')
      const take = Math.min(50, Math.max(1, limit)), where = { memberId: member.id, ...(after ? { id: { gt: after.id } } : {}) }
      const next = (rows: { id: string }[]) => rows.length > take ? encode({ owner: member.id, collection, id: rows[take - 1]!.id }) : null
      if (collection === 'ratings') {
        const rows = await prisma.rating.findMany({ where, orderBy: { id: 'asc' }, take: take + 1, select: { id: true, catalogKind: true, tmdbId: true, value: true } })
        return { collection, items: rows.slice(0, take).map(row => ({ id: row.tmdbId, kind: kind(row.catalogKind), value: row.value })), nextCursor: next(rows) }
      }
      if (collection === 'reviews') {
        const rows = await prisma.review.findMany({ where: { ...where, removedAt: null }, orderBy: { id: 'asc' }, take: take + 1, select: { id: true, catalogKind: true, tmdbId: true, body: true, spoiler: true, reviewedOn: true } })
        return { collection, items: rows.slice(0, take).map(row => ({ id: row.tmdbId, kind: kind(row.catalogKind), reviewId: row.id, body: row.spoiler ? 'Contains spoilers. Open the review to read.' : row.body, reviewedOn: row.reviewedOn?.toISOString().slice(0, 10) ?? null })), nextCursor: next(rows) }
      }
      if (collection === 'lists') {
        const rows = await prisma.memberList.findMany({ where: { ...where, visibility: 'public', removedAt: null }, orderBy: { id: 'asc' }, take: take + 1, select: { id: true, slug: true, name: true, description: true, _count: { select: { items: true } } } })
        return { collection, items: rows.slice(0, take).map(row => ({ id: row.id, slug: row.slug, name: row.name, description: row.description, itemCount: row._count.items })), nextCursor: next(rows) }
      }
      const relation = collection === 'followers' ? 'follower' : 'following'
      const rows = await prisma.follow.findMany({ where: { [collection === 'followers' ? 'followingId' : 'followerId']: member.id, ...(after ? { id: { gt: after.id } } : {}), [relation]: viewer === member.id ? { status: 'ACTIVE' } : publicMember }, orderBy: { id: 'asc' }, take: take + 1, select: { id: true, followerId: true, followingId: true } })
      const ids = rows.slice(0, take).map(row => relation === 'follower' ? row.followerId : row.followingId)
      const targets = await prisma.member.findMany({ where: { id: { in: ids }, status: 'ACTIVE' }, select: memberFields })
      const visibleTargets = await summaries(targets, viewer)
      const people = ids.flatMap<(PublicMemberSummary & { private: false }) | { id: string; private: true }>(id => {
        const summary = visibleTargets.find(row => row.id === id)
        if (summary) return [{ ...summary, private: false as const }]
        return []
      })
      return { collection, items: people, nextCursor: next(rows) }
    },
    async listDiscovery(viewer) {
      const [followed, popularIds] = await Promise.all([
        viewer
          ? prisma.follow.findMany({ where: { followerId: viewer, following: publicMember }, select: { followingId: true } })
          : Promise.resolve([]),
        prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT l."id"
          FROM "MemberList" l
          JOIN "SavedMemberList" saved ON saved."listId" = l."id" AND saved."memberId" <> l."memberId"
          JOIN "Member" m ON m."id" = l."memberId" AND m."status" = 'ACTIVE'
          JOIN "Profile" p ON p."memberId" = m."id"
          WHERE l."visibility" = 'public'
            AND COALESCE(p."sectionVisibility"->>'lists', 'true') <> 'false'
          GROUP BY l."id", l."updatedAt"
          HAVING COUNT(DISTINCT saved."memberId") >= 5
          ORDER BY COUNT(DISTINCT saved."memberId") DESC, l."updatedAt" DESC, l."id" ASC
          LIMIT 40
        `),
      ])
      const ownerIds = followed.map(row => row.followingId)
      const [recentRows, popularRows] = await Promise.all([
        ownerIds.length
          ? prisma.memberList.findMany({
            where: { memberId: { in: ownerIds }, visibility: 'public', member: { is: { status: 'ACTIVE', profile: { is: { sectionVisibility: { path: ['lists'], equals: true } } } } } },
            orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
            take: 40,
            select: discoveryListSelect,
          })
          : Promise.resolve([] as DiscoveryListRow[]),
        popularIds.length
          ? prisma.memberList.findMany({
            where: { id: { in: popularIds.map(row => row.id) }, visibility: 'public', member: { is: { status: 'ACTIVE' } } },
            select: discoveryListSelect,
          })
          : Promise.resolve([] as DiscoveryListRow[]),
      ])
      const popularById = new Map(popularRows.map(row => [row.id, row]))
      return {
        newFromNetwork: recentRows.flatMap(row => { const item = discoveryItem(row); return item ? [item] : [] }).slice(0, 8),
        popular: popularIds.flatMap(({ id }) => {
          const row = popularById.get(id)
          const item = row ? discoveryItem(row) : null
          return item ? [item] : []
        }).slice(0, 8),
      }
    },
    async follow(actor, target, following) {
      if (following && await prisma.tasteBlock.findFirst({ where: { OR: [{ actorId: actor, targetId: target }, { actorId: target, targetId: actor }] } })) throw new ApiError('FORBIDDEN', 'This relationship is unavailable.')
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
