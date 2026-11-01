import { z } from 'zod'

const ref = z.object({ kind: z.enum(['movie', 'series', 'anime']), id: z.int().positive() })
const id = z.string().min(1).max(160)
const revision = z.int().nonnegative()
export const tasteSectionSchema = z.enum(['favorites', 'edition', 'lists', 'review', 'activity'])
export const tastePresentationSchema = z.object({
  cover: ref.nullable().default(null),
  crop: z.number().min(0).max(100).default(50),
  tint: z.enum(['midnight', 'umber', 'slate']).default('midnight'),
  statement: z.string().trim().max(180).default(''),
  featuredLists: z.array(id).max(2).default([]),
  featuredReview: id.nullable().default(null),
  sections: z.array(tasteSectionSchema).length(5).refine(v => new Set(v).size === 5).default(['favorites', 'edition', 'lists', 'review', 'activity']),
})
export type TastePresentation = z.infer<typeof tastePresentationSchema>
export const tastePresentationWriteSchema = tastePresentationSchema.extend({ revision })

export const tasteEditionSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  title: z.string().trim().min(1).max(120),
  introduction: z.string().trim().max(2000).default(''),
  cover: ref.nullable().default(null),
  picks: z.array(ref.extend({ reason: z.string().trim().max(500) })).max(3).default([]),
  reviewId: id.nullable().default(null),
  listId: id.nullable().default(null),
})
export type TasteEdition = z.infer<typeof tasteEditionSchema>
export const tasteEditionWriteSchema = tasteEditionSchema.extend({ revision, publish: z.boolean().default(false) })
  .refine(v => !v.publish || (v.picks.length === 3 && v.picks.every(p => p.reason.length > 0)), 'Choose three picks and explain each one before publishing.')
  .refine(v => new Set(v.picks.map(p => `${p.kind}:${p.id}`)).size === v.picks.length, 'Choose each pick once.')

export const tasteListLayoutSchema = z.object({
  genres: z.array(z.enum(['Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Drama', 'Fantasy', 'Horror', 'Mystery', 'Romance', 'Science Fiction', 'Thriller', 'Documentary'])).max(3).default([]),
  preset: z.enum(['collection', 'ranking', 'watch-order']).default('collection'),
  cover: ref.nullable().default(null),
  chapters: z.array(z.object({ id, name: z.string().trim().min(1).max(100), introduction: z.string().trim().max(500).default('') })).max(30).default([]),
  assignments: z.record(z.string().max(80), id).default({}),
})
export type TasteListLayout = z.infer<typeof tasteListLayoutSchema>
export const tasteListWriteSchema = z.object({
  revision,
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).nullable(),
  visibility: z.enum(['public', 'unlisted', 'private']),
  items: z.array(ref.extend({ note: z.string().trim().max(500).nullable().optional() })).max(500),
  layout: tasteListLayoutSchema,
  publishUpdate: z.boolean().default(false),
}).refine(v => new Set(v.items.map(x => `${x.kind}:${x.id}`)).size === v.items.length, 'Each title can appear once.')
export type TasteListWrite = z.infer<typeof tasteListWriteSchema>

export const tasteReviewWriteSchema = ref.extend({
  idempotencyKey: z.uuid(),
  reviewId: id.optional(),
  revision: revision.default(0),
  body: z.string().trim().max(10000),
  spoiler: z.boolean().default(false),
  season: z.int().nonnegative().optional(),
  episode: z.int().positive().optional(),
  rating: z.int().min(1).max(10).nullable(),
  log: z.object({ watchedOn: z.iso.date(), rewatch: z.boolean(), tags: z.array(z.string().trim().min(1).max(100)).max(50).default([]) }).optional(),
}).refine(v => Boolean(v.body || v.log), 'Write a review or log a watch.')
  .refine(v => v.kind !== 'movie' || (v.season === undefined && v.episode === undefined), 'Movies have no episodes.')
  .refine(v => v.kind !== 'anime' || v.season === undefined, 'Anime uses canonical episode numbers.')
  .refine(v => v.kind !== 'series' || v.episode === undefined || v.season !== undefined, 'Choose a season for this episode.')
export type TasteReviewWrite = z.infer<typeof tasteReviewWriteSchema>
export const tasteDraftWriteSchema = z.object({ revision, data: z.record(z.string(), z.unknown()).refine(v => JSON.stringify(v).length <= 100000, 'Draft is too large.') })
export const tasteTargetSchema = z.object({ kind: z.enum(['review', 'list', 'edition', 'member']), id })
export type TasteTarget = z.infer<typeof tasteTargetSchema>
export const tasteCommentWriteSchema = z.object({
  body: z.string().trim().min(1).max(2000), spoiler: z.boolean().default(false), parentId: id.nullable().default(null), idempotencyKey: z.uuid(),
})
export const tasteCommentEditSchema = z.object({ body: z.string().trim().min(1).max(2000), spoiler: z.boolean(), revision })
export const tasteReportSchema = tasteTargetSchema.extend({ commentId: id.optional(), reason: z.string().trim().min(3).max(1000), idempotencyKey: z.string().uuid() })

export const tasteAuthorSchema = z.object({ id, username: z.string(), name: z.string(), avatarUrl: z.string().nullable() })
export const tasteReviewSchema = ref.extend({
  reviewId: id, body: z.string(), spoiler: z.boolean(), season: z.number().nullable(), episode: z.number().nullable(),
  rating: z.number().nullable(), revision, createdAt: z.string(), author: tasteAuthorSchema, likes: z.number(), liked: z.boolean(), owner: z.boolean(),
})
export const tasteEditionReadSchema = z.object({ id, data: tasteEditionSchema, revision, publishedAt: z.string().nullable(), author: tasteAuthorSchema, listHref: z.string().nullable().default(null) })
export const tasteProfileSchema = z.object({
  presentation: tastePresentationSchema, revision, owner: z.boolean(),
  editions: z.array(tasteEditionReadSchema), review: tasteReviewSchema.nullable(),
  activity: z.array(ref.extend({ entryId: id, watchedOn: z.string() })).default([]),
  lists: z.array(z.object({ id, slug: z.string(), name: z.string(), description: z.string().nullable(), count: z.number(), refs: z.array(ref) })),
  comparison: z.object({ sharedFavorites: z.array(ref), sharedHighRatings: z.array(ref), differences: z.array(ref.extend({ yours: z.number(), theirs: z.number() })), compared: z.number() }).nullable(),
})
export type TasteProfile = z.infer<typeof tasteProfileSchema>
export const tasteListReadSchema = z.object({ revision, layout: tasteListLayoutSchema, watched: z.array(ref).default([]) })
export const tasteDraftReadSchema = z.object({ revision, data: z.record(z.string(), z.unknown()) })
export const tasteCommentSchema = z.object({ id, body: z.string(), spoiler: z.boolean(), parentId: id.nullable(), revision, createdAt: z.string(), author: tasteAuthorSchema, owner: z.boolean(), deleted: z.boolean() })
export const tasteDiscussionSchema = z.object({ items: z.array(tasteCommentSchema), nextCursor: z.string().nullable(), muted: z.boolean(), canComment: z.boolean() })
export const tasteCommunityItemSchema = z.object({
  id, kind: z.enum(['review', 'list', 'edition']), href: z.string(), title: z.string(), excerpt: z.string(),
  spoiler: z.boolean(), date: z.string(), author: tasteAuthorSchema, refs: z.array(ref),
})
export const tasteCommunitySchema = z.object({ items: z.array(tasteCommunityItemSchema), nextCursor: z.string().nullable() })
export type TasteCommunity = z.infer<typeof tasteCommunitySchema>
export const tasteNotificationsSchema = z.object({ items: z.array(z.object({ id, text: z.string(), href: z.string().nullable(), createdAt: z.string(), read: z.boolean() })), nextCursor: z.string().nullable() })
export const tasteRecommendationResponseSchema = z.enum(['saved', 'already-seen', 'not-interested'])
export type TasteRecommendationResponse = z.infer<typeof tasteRecommendationResponseSchema>
export const tasteRecommendationWriteSchema = ref.extend({ recipientId: id }).strict()
export const tasteRecommendationResponseWriteSchema = z.object({ response: tasteRecommendationResponseSchema }).strict()
export const tasteRecommendationSchema = z.object({ id, title: ref, sender: tasteAuthorSchema, response: tasteRecommendationResponseSchema.nullable(), createdAt: z.string() })
export const tasteRecommendationPageSchema = z.object({ items: z.array(tasteRecommendationSchema).max(30), nextCursor: id.nullable() })
export const tasteReportsSchema = z.object({ items: z.array(z.object({ id, reason: z.string(), target: tasteTargetSchema, commentId: z.string().nullable(), createdAt: z.string(), status: z.string(), content: z.string(), href: z.string().nullable() })) })
export const tasteModerationSchema = z.object({ action: z.enum(['dismiss', 'remove', 'restrict', 'restore']), note: z.string().trim().min(3).max(1000) })
export const tasteShareSchema = z.object({ title: z.string(), description: z.string(), author: z.string(), href: z.string(), refs: z.array(ref), spoiler: z.boolean() })
