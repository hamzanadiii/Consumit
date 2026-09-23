import {
  catalogRefSchema,
  createDiaryEntryRequestSchema,
  createReviewRequestSchema,
  diaryEntrySchema,
  favoriteSelectionRequestSchema,
  followStateSchema,
  followStatusSchema,
  memberLibrarySchema,
  memberListDetailSchema,
  memberProfileDataSchema,
  memberRatingSchema,
  memberReviewSchema,
  memberTitleRecordSchema,
  memberTitleStateSchema,
  playbackProgressSchema,
  progressRefSchema,
  progressWriteRequestSchema,
  reviewLikeSchema,
  setRatingRequestSchema,
  setReviewLikeRequestSchema,
  titleReviewsPageSchema,
  titleReviewsQuerySchema,
  updateDiaryEntryRequestSchema,
  updateMemberListRequestSchema,
  updateMemberReviewRequestSchema,
  usernameSchema,
} from '@consumit/contracts'
import type { FastifyInstance, FastifyRequest } from 'fastify'

import type { ApiEnv } from '../config/env.ts'
import { ApiError } from '../http/errors.ts'
import { isAllowedOrigin } from '../http/csrf.ts'
import type { Identity } from '../identity/identity.ts'
import { sessionCookieName } from '../identity/session.ts'
import type { MemberData } from './member-data.ts'

export function registerMemberDataRoutes(app: FastifyInstance, deps: { env: ApiEnv; identity: Identity; memberData: MemberData }) {
  const cookieName = sessionCookieName(deps.env)

  async function viewer(request: FastifyRequest, required: boolean) {
    const token = request.cookies?.[cookieName]
    if (!token) {
      if (required) throw new ApiError('UNAUTHENTICATED', 'Sign in to continue.')
      return undefined
    }
    const member = await deps.identity.getSession(token)
    if (!member && required) throw new ApiError('UNAUTHENTICATED', 'Sign in to continue.')
    return member?.id
  }

  function guardMutation(request: FastifyRequest) {
    if (!isAllowedOrigin(request.headers, deps.env.appOrigin, deps.env.nodeEnv !== 'production')) throw new ApiError('FORBIDDEN', 'Cross-site requests are not allowed.')
  }

  function recordId(request: FastifyRequest) {
    const id = (request.params as { id?: unknown }).id
    if (typeof id !== 'string' || !id || id.length > 100) throw new ApiError('BAD_REQUEST', 'Use a valid record identifier.')
    return id
  }

  app.get('/v1/profiles/:username', async (request, reply) => {
    void reply.header('cache-control', 'private, no-store')
    const parsed = usernameSchema.safeParse((request.params as { username?: unknown }).username)
    if (!parsed.success) throw new ApiError('BAD_REQUEST', 'Use a valid username.')
    const profile = await deps.memberData.profile(parsed.data, await viewer(request, false))
    if (!profile) throw new ApiError('NOT_FOUND', 'Profile not found.')
    return memberProfileDataSchema.parse(profile)
  })

  app.get('/v1/me/library', async (request, reply) => {
    void reply.header('cache-control', 'private, no-store')
    return memberLibrarySchema.parse(await deps.memberData.library((await viewer(request, true))!))
  })

  app.put('/v1/me/favorites', async (request, reply) => {
    guardMutation(request)
    const parsed = favoriteSelectionRequestSchema.safeParse(request.body)
    if (!parsed.success) throw new ApiError('BAD_REQUEST', 'Choose up to four valid Favorites.')
    void reply.header('cache-control', 'private, no-store')
    return memberLibrarySchema.parse(await deps.memberData.setFavorites((await viewer(request, true))!, parsed.data.favorites))
  })

  app.patch('/v1/me/diary/:id', async (request, reply) => {
    guardMutation(request)
    const parsed = updateDiaryEntryRequestSchema.safeParse(request.body)
    if (!parsed.success) throw new ApiError('BAD_REQUEST', 'Provide valid diary changes.')
    const updated = await deps.memberData.updateDiary((await viewer(request, true))!, recordId(request), parsed.data)
    if (!updated) throw new ApiError('NOT_FOUND', 'Diary entry not found.')
    return reply.code(204).send()
  })

  app.post('/v1/me/diary', async (request, reply) => {
    guardMutation(request)
    const parsed = createDiaryEntryRequestSchema.safeParse(request.body)
    if (!parsed.success) throw new ApiError('BAD_REQUEST', 'Provide a valid watched date.')
    void reply.header('cache-control', 'private, no-store')
    void reply.code(201)
    return diaryEntrySchema.parse(await deps.memberData.createDiaryEntry((await viewer(request, true))!, parsed.data))
  })

  app.patch('/v1/me/reviews/:id', async (request, reply) => {
    guardMutation(request)
    const parsed = updateMemberReviewRequestSchema.safeParse(request.body)
    if (!parsed.success) throw new ApiError('BAD_REQUEST', 'Provide valid review changes.')
    const updated = await deps.memberData.updateReview((await viewer(request, true))!, recordId(request), parsed.data)
    if (!updated) throw new ApiError('NOT_FOUND', 'Review not found.')
    return reply.code(204).send()
  })

  app.patch('/v1/me/lists/:id', async (request, reply) => {
    guardMutation(request)
    const parsed = updateMemberListRequestSchema.safeParse(request.body)
    if (!parsed.success) throw new ApiError('BAD_REQUEST', 'Provide valid list changes.')
    const updated = await deps.memberData.updateList((await viewer(request, true))!, recordId(request), parsed.data)
    if (!updated) throw new ApiError('NOT_FOUND', 'List not found.')
    return reply.code(204).send()
  })

  for (const method of ['PUT', 'DELETE'] as const) {
    app.route({
      handler: async (request, reply) => {
        guardMutation(request)
        const params = request.params as { id?: unknown; kind?: unknown }
        const parsed = catalogRefSchema.safeParse({ id: Number(params.id), kind: params.kind })
        if (!parsed.success) throw new ApiError('BAD_REQUEST', 'Use a valid movie or series identifier.')
        void reply.header('cache-control', 'private, no-store')
        return memberLibrarySchema.parse(await deps.memberData.setSaved((await viewer(request, true))!, parsed.data, method === 'PUT'))
      },
      method,
      url: '/v1/me/library/titles/:kind/:id',
    })
  }

  app.put('/v1/progress', async (request, reply) => {
    guardMutation(request)
    const parsed = progressWriteRequestSchema.safeParse(request.body)
    if (!parsed.success) throw new ApiError('BAD_REQUEST', 'Provide a valid playback position.')
    void reply.header('cache-control', 'private, no-store')
    return playbackProgressSchema.parse(await deps.memberData.setProgress((await viewer(request, true))!, parsed.data))
  })

  app.get('/v1/progress/:kind/:id', async (request, reply) => {
    const params = request.params as { id?: unknown; kind?: unknown }
    const query = request.query as { episode?: unknown; season?: unknown }
    const parsed = progressRefSchema.safeParse({
      ...(query.episode === undefined ? {} : { episode: Number(query.episode) }),
      id: Number(params.id),
      kind: params.kind,
      ...(query.season === undefined ? {} : { season: Number(query.season) }),
    })
    if (!parsed.success) throw new ApiError('BAD_REQUEST', 'Use a valid title reference.')
    void reply.header('cache-control', 'private, no-store')
    const record = await deps.memberData.progress((await viewer(request, true))!, parsed.data)
    if (!record) return reply.code(204).send()
    return playbackProgressSchema.parse(record)
  })

  app.get('/v1/lists/:slug', async (request, reply) => {
    void reply.header('cache-control', 'private, no-store')
    const slug = (request.params as { slug?: unknown }).slug
    if (typeof slug !== 'string' || !slug || slug.length > 200) throw new ApiError('BAD_REQUEST', 'Use a valid list slug.')
    const list = await deps.memberData.list(slug, await viewer(request, false))
    if (!list) throw new ApiError('NOT_FOUND', 'List not found.')
    return memberListDetailSchema.parse(list)
  })

  app.put('/v1/ratings', async (request, reply) => {
    guardMutation(request)
    const parsed = setRatingRequestSchema.safeParse(request.body)
    if (!parsed.success) throw new ApiError('BAD_REQUEST', 'Rate between 1 and 10.')
    void reply.header('cache-control', 'private, no-store')
    return memberRatingSchema.parse(await deps.memberData.setRating((await viewer(request, true))!, { id: parsed.data.id, kind: parsed.data.kind }, parsed.data.value))
  })

  app.get('/v1/ratings/:kind/:id', async (request, reply) => {
    const params = request.params as { id?: unknown; kind?: unknown }
    const parsed = catalogRefSchema.safeParse({ id: Number(params.id), kind: params.kind })
    if (!parsed.success) throw new ApiError('BAD_REQUEST', 'Use a valid movie or series identifier.')
    void reply.header('cache-control', 'private, no-store')
    const rating = await deps.memberData.rating((await viewer(request, true))!, parsed.data)
    if (!rating) throw new ApiError('NOT_FOUND', 'No rating for this title.')
    return memberRatingSchema.parse(rating)
  })

  app.delete('/v1/ratings/:kind/:id', async (request, reply) => {
    guardMutation(request)
    const params = request.params as { id?: unknown; kind?: unknown }
    const parsed = catalogRefSchema.safeParse({ id: Number(params.id), kind: params.kind })
    if (!parsed.success) throw new ApiError('BAD_REQUEST', 'Use a valid movie or series identifier.')
    const removed = await deps.memberData.removeRating((await viewer(request, true))!, parsed.data)
    if (!removed) throw new ApiError('NOT_FOUND', 'No rating for this title.')
    return reply.code(204).send()
  })

  for (const method of ['PUT', 'DELETE'] as const) {
    app.route({
      handler: async (request, reply) => {
        guardMutation(request)
        const params = request.params as { id?: unknown; kind?: unknown }
        const parsed = catalogRefSchema.safeParse({ id: Number(params.id), kind: params.kind })
        if (!parsed.success) throw new ApiError('BAD_REQUEST', 'Use a valid movie or series identifier.')
        void reply.header('cache-control', 'private, no-store')
        return memberLibrarySchema.parse(await deps.memberData.setWatched((await viewer(request, true))!, parsed.data, method === 'PUT'))
      },
      method,
      url: '/v1/me/library/watched/:kind/:id',
    })
  }

  app.put('/v1/likes', async (request, reply) => {
    guardMutation(request)
    const parsed = catalogRefSchema.safeParse(request.body)
    if (!parsed.success) throw new ApiError('BAD_REQUEST', 'Use a valid movie or series identifier.')
    void reply.header('cache-control', 'private, no-store')
    return memberTitleRecordSchema.parse(await deps.memberData.setLiked((await viewer(request, true))!, parsed.data, true))
  })

  app.get('/v1/likes/:kind/:id', async (request, reply) => {
    const params = request.params as { id?: unknown; kind?: unknown }
    const parsed = catalogRefSchema.safeParse({ id: Number(params.id), kind: params.kind })
    if (!parsed.success) throw new ApiError('BAD_REQUEST', 'Use a valid movie or series identifier.')
    void reply.header('cache-control', 'private, no-store')
    const like = await deps.memberData.like((await viewer(request, true))!, parsed.data)
    if (!like) throw new ApiError('NOT_FOUND', 'No like for this title.')
    return memberTitleRecordSchema.parse(like)
  })

  app.delete('/v1/likes/:kind/:id', async (request, reply) => {
    guardMutation(request)
    const params = request.params as { id?: unknown; kind?: unknown }
    const parsed = catalogRefSchema.safeParse({ id: Number(params.id), kind: params.kind })
    if (!parsed.success) throw new ApiError('BAD_REQUEST', 'Use a valid movie or series identifier.')
    const removed = await deps.memberData.removeLike((await viewer(request, true))!, parsed.data)
    if (!removed) throw new ApiError('NOT_FOUND', 'No like for this title.')
    return reply.code(204).send()
  })

  app.get('/v1/me/reviews/:kind/:id', async (request, reply) => {
    const params = request.params as { id?: unknown; kind?: unknown }
    const parsed = catalogRefSchema.safeParse({ id: Number(params.id), kind: params.kind })
    if (!parsed.success) throw new ApiError('BAD_REQUEST', 'Use a valid movie or series identifier.')
    void reply.header('cache-control', 'private, no-store')
    const review = await deps.memberData.review((await viewer(request, true))!, parsed.data)
    if (!review) throw new ApiError('NOT_FOUND', 'No review for this title.')
    return memberReviewSchema.parse(review)
  })

  app.get('/v1/me/titles/:kind/:id', async (request, reply) => {
    const params = request.params as { id?: unknown; kind?: unknown }
    const parsed = catalogRefSchema.safeParse({ id: Number(params.id), kind: params.kind })
    if (!parsed.success) throw new ApiError('BAD_REQUEST', 'Use a valid movie or series identifier.')
    void reply.header('cache-control', 'private, no-store')
    const memberId = (await viewer(request, true))!
    const [rating, like, review] = await Promise.all([
      deps.memberData.rating(memberId, parsed.data),
      deps.memberData.like(memberId, parsed.data),
      deps.memberData.review(memberId, parsed.data),
    ])
    return memberTitleStateSchema.parse({ rating, like, review })
  })

  app.get('/v1/reviews/:kind/:id', async (request, reply) => {
    const params = request.params as { id?: unknown; kind?: unknown }
    const ref = catalogRefSchema.safeParse({ id: Number(params.id), kind: params.kind })
    if (!ref.success) throw new ApiError('BAD_REQUEST', 'Use a valid movie or series identifier.')
    const query = titleReviewsQuerySchema.safeParse(request.query)
    if (!query.success) throw new ApiError('BAD_REQUEST', 'Use a valid reviews page, sort, and audience.')
    void reply.header('cache-control', 'private, no-store')
    return titleReviewsPageSchema.parse(await deps.memberData.titleReviews(ref.data, query.data.page, query.data.sort, await viewer(request, false), query.data.audience))
  })

  app.get('/v1/follows/:username', async (request, reply) => {
    const username = usernameSchema.safeParse((request.params as { username?: unknown }).username)
    if (!username.success) throw new ApiError('BAD_REQUEST', 'Use a valid username.')
    void reply.header('cache-control', 'private, no-store')
    return followStateSchema.parse({ following: await deps.memberData.isFollowing((await viewer(request, true))!, username.data) })
  })

  for (const method of ['PUT', 'DELETE'] as const) {
    app.route({
      handler: async (request, reply) => {
        guardMutation(request)
        const username = usernameSchema.safeParse((request.params as { username?: unknown }).username)
        if (!username.success) throw new ApiError('BAD_REQUEST', 'Use a valid username.')
        void reply.header('cache-control', 'private, no-store')
        const status = await deps.memberData.setFollow((await viewer(request, true))!, username.data, method === 'PUT')
        if (!status) throw new ApiError('NOT_FOUND', 'Member not found.')
        return followStatusSchema.parse(status)
      },
      method,
      url: '/v1/follows/:username',
    })
  }

  app.put('/v1/review-likes', async (request, reply) => {
    guardMutation(request)
    const parsed = setReviewLikeRequestSchema.safeParse(request.body)
    if (!parsed.success) throw new ApiError('BAD_REQUEST', 'Use a valid review identifier.')
    void reply.header('cache-control', 'private, no-store')
    const like = await deps.memberData.setReviewLiked((await viewer(request, true))!, parsed.data.reviewId, true)
    if (!like) throw new ApiError('NOT_FOUND', 'Review not found.')
    return reviewLikeSchema.parse(like)
  })

  app.delete('/v1/review-likes/:reviewId', async (request, reply) => {
    guardMutation(request)
    const reviewId = (request.params as { reviewId?: unknown }).reviewId
    if (typeof reviewId !== 'string' || !reviewId || reviewId.length > 128) throw new ApiError('BAD_REQUEST', 'Use a valid review identifier.')
    const removed = await deps.memberData.removeReviewLike((await viewer(request, true))!, reviewId)
    if (!removed) throw new ApiError('NOT_FOUND', 'Review not found.')
    return reply.code(204).send()
  })

  app.post('/v1/me/reviews', async (request, reply) => {
    guardMutation(request)
    const parsed = createReviewRequestSchema.safeParse(request.body)
    if (!parsed.success) throw new ApiError('BAD_REQUEST', 'Write a review between 1 and 10,000 characters.')
    void reply.header('cache-control', 'private, no-store')
    void reply.code(201)
    return memberReviewSchema.parse(await deps.memberData.createReview((await viewer(request, true))!, parsed.data))
  })
}
