import {
  catalogRefSchema,
  circleActivityCursorSchema,
  type CircleActivityCursor,
  circleActivityPageSchema,
  circleActivityQuerySchema,
  createMemberListRequestSchema,
  discoverMemberListsSchema,
  createDiaryEntryRequestSchema,
  createReviewRequestSchema,
  diaryEntrySchema,
  favoriteSelectionRequestSchema,
  followStateSchema,
  followStatusSchema,
  memberLibraryCollectionPageSchema,
  memberLibraryCollectionSchema,
  memberLibraryPageQuerySchema,
  memberLibrarySnapshotSchema,
  memberListDetailSchema,
  memberSearchQuerySchema,
  memberSuggestionSchema,
  memberProfileDataSchema,
  memberProfileArchiveCursorSchema,
  memberProfileArchiveKindSchema,
  memberProfileArchivePageSchema,
  memberProfileArchiveQuerySchema,
  memberRatingCursorSchema,
  memberRatingLookupQuerySchema,
  memberRatingLookupRequestSchema,
  memberRatingLookupResponseSchema,
  memberRatingPageQuerySchema,
  memberRatingPageSchema,
  memberRatingSchema,
  memberReviewSchema,
  memberTitleRecordSchema,
  memberTitleStateSchema,
  playbackProgressSchema,
  progressRefSchema,
  progressWriteRequestSchema,
  watchHistoryPageSchema,
  reviewLikeSchema,
  setRatingRequestSchema,
  setReviewLikeRequestSchema,
  titleReviewsPageSchema,
  titleReviewsQuerySchema,
  updateDiaryEntryRequestSchema,
  updateMemberListRequestSchema,
  updateMemberListContentRequestSchema,
  updateMemberReviewRequestSchema,
  usernameSchema,
} from '@consumit/contracts'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'

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
    const profile = await deps.memberData.profile(parsed.data, await viewer(request, true))
    if (!profile) throw new ApiError('NOT_FOUND', 'Profile not found.')
    return memberProfileDataSchema.parse(profile)
  })

  app.get('/v1/profiles/:username/archives/:collection', async (request, reply) => {
    const params = request.params as { collection?: unknown; username?: unknown }
    const username = usernameSchema.safeParse(params.username)
    const collection = memberProfileArchiveKindSchema.safeParse(params.collection)
    const query = memberProfileArchiveQuerySchema.safeParse(request.query)
    if (!username.success || !collection.success || !query.success) throw new ApiError('BAD_REQUEST', 'Use a valid profile archive request.')
    let cursor: z.infer<typeof memberProfileArchiveCursorSchema> | undefined
    if (query.data.cursor) {
      let value: unknown
      try { value = JSON.parse(query.data.cursor) } catch { throw new ApiError('BAD_REQUEST', 'Use a valid profile archive cursor.') }
      const parsed = memberProfileArchiveCursorSchema.safeParse(value)
      const validFields = parsed.success && parsed.data.collection === collection.data && (
        ['films', 'likes'].includes(collection.data) ? Boolean(parsed.data.updatedAt)
          : collection.data === 'diary' ? Boolean(parsed.data.createdAt && parsed.data.watchedOn)
            : ['reviews', 'lists'].includes(collection.data) ? Boolean(collection.data === 'lists' ? parsed.data.updatedAt : parsed.data.createdAt)
              : ['activity'].includes(collection.data) ? Boolean(parsed.data.createdAt && parsed.data.kind)
                : false
      )
      if (!parsed.success || !validFields) throw new ApiError('BAD_REQUEST', 'Use a valid profile archive cursor.')
      cursor = parsed.data
    }
    void reply.header('cache-control', 'private, no-store')
    const page = await deps.memberData.profileArchive(username.data, collection.data, await viewer(request, true), cursor, query.data.limit)
    if (!page) throw new ApiError('NOT_FOUND', 'Profile archive not found.')
    return memberProfileArchivePageSchema.parse(page)
  })

  app.get('/v1/me/library', async (request, reply) => {
    void reply.header('cache-control', 'private, no-store')
    return memberLibrarySnapshotSchema.parse(await deps.memberData.librarySnapshot((await viewer(request, true))!))
  })

  app.get('/v1/me/library/collections/:collection', async (request, reply) => {
    const params = request.params as { collection?: unknown }
    const collection = memberLibraryCollectionSchema.safeParse(params.collection)
    const query = memberLibraryPageQuerySchema.safeParse(request.query)
    if (!collection.success || !query.success) throw new ApiError('BAD_REQUEST', 'Use a valid library collection page.')
    if (query.data.cursor) {
      let cursor: unknown
      try { cursor = JSON.parse(query.data.cursor) } catch { throw new ApiError('BAD_REQUEST', 'Use a valid library collection cursor.') }
      if (!cursor || typeof cursor !== 'object') throw new ApiError('BAD_REQUEST', 'Use a valid library collection cursor.')
      const value = cursor as { collection?: unknown; createdAt?: unknown; id?: unknown; updatedAt?: unknown; watchedOn?: unknown }
      const idIsValid = typeof value.id === 'string' && value.id.length > 0 && value.id.length <= 64
      const hasValidDate = (date: unknown) => typeof date === 'string' && z.iso.datetime().safeParse(date).success
      const dateIsValid = collection.data === 'diary'
        ? hasValidDate(value.createdAt) && hasValidDate(value.watchedOn)
        : collection.data === 'lists'
          ? hasValidDate(value.updatedAt)
          : hasValidDate(value.createdAt)
      if (value.collection !== collection.data || !idIsValid || !dateIsValid) throw new ApiError('BAD_REQUEST', 'Use a valid library collection cursor.')
    }
    void reply.header('cache-control', 'private, no-store')
    const page = await deps.memberData.libraryPage((await viewer(request, true))!, collection.data, query.data.cursor, query.data.limit)
    return memberLibraryCollectionPageSchema.parse(page)
  })

  

  

  app.put('/v1/me/favorites', async (request, reply) => {
    guardMutation(request)
    const parsed = favoriteSelectionRequestSchema.safeParse(request.body)
    if (!parsed.success) throw new ApiError('BAD_REQUEST', 'Choose up to four valid Favorites.')
    void reply.header('cache-control', 'private, no-store')
    await deps.memberData.setFavorites((await viewer(request, true))!, parsed.data.favorites)
    return reply.code(204).send()
  })

  app.patch('/v1/me/diary/:id', async (request, reply) => {
    guardMutation(request)
    const parsed = updateDiaryEntryRequestSchema.safeParse(request.body)
    if (!parsed.success) throw new ApiError('BAD_REQUEST', 'Provide valid diary changes.')
    const updated = await deps.memberData.updateDiary((await viewer(request, true))!, recordId(request), parsed.data)
    if (!updated) throw new ApiError('NOT_FOUND', 'Diary entry not found.')
    return reply.code(204).send()
  })

  app.delete('/v1/me/diary/:id', async (request, reply) => {
    guardMutation(request)
    const deleted = await deps.memberData.deleteDiary((await viewer(request, true))!, recordId(request))
    if (!deleted) throw new ApiError('NOT_FOUND', 'Diary entry not found.')
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

  app.post('/v1/me/lists', async (request, reply) => {
    guardMutation(request)
    const parsed = createMemberListRequestSchema.safeParse(request.body)
    if (!parsed.success) throw new ApiError('BAD_REQUEST', 'Provide a valid list name and request key.')
    void reply.header('cache-control', 'private, no-store')
    void reply.code(201)
    return memberListDetailSchema.parse(await deps.memberData.createList((await viewer(request, true))!, parsed.data))
  })

  app.put('/v1/me/lists/:id', async (request, reply) => {
    guardMutation(request)
    const parsed = updateMemberListContentRequestSchema.safeParse(request.body)
    if (!parsed.success) throw new ApiError('BAD_REQUEST', 'Provide valid list details and an ordered list of unique titles.')
    const updated = await deps.memberData.updateListContent((await viewer(request, true))!, recordId(request), parsed.data)
    if (!updated) throw new ApiError('NOT_FOUND', 'List not found.')
    void reply.header('cache-control', 'private, no-store')
    return reply.code(204).send()
  })

  app.delete('/v1/me/lists/:id', async (request, reply) => {
    guardMutation(request)
    const deleted = await deps.memberData.deleteList((await viewer(request, true))!, recordId(request))
    if (!deleted) throw new ApiError('NOT_FOUND', 'List not found.')
    void reply.header('cache-control', 'private, no-store')
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
        await deps.memberData.setSaved((await viewer(request, true))!, parsed.data, method === 'PUT')
        return reply.code(204).send()
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

  app.get('/v1/me/watch-history', async (request, reply) => {
    const query = request.query as { cursor?: unknown; limit?: unknown }
    const cursor = query.cursor
    const limit = query.limit === undefined ? 20 : Number(query.limit)
    if ((cursor !== undefined && (typeof cursor !== 'string' || !/^[a-z0-9]{8,64}$/i.test(cursor))) || !Number.isInteger(limit) || limit < 1 || limit > 50) {
      throw new ApiError('BAD_REQUEST', 'Use a valid history page.')
    }
    void reply.header('cache-control', 'private, no-store')
    return watchHistoryPageSchema.parse(await deps.memberData.watchHistory((await viewer(request, true))!, cursor, limit))
  })

  app.get('/v1/me/ratings', async (request, reply) => {
    const query = memberRatingPageQuerySchema.safeParse(request.query)
    if (!query.success) throw new ApiError('BAD_REQUEST', 'Use a valid rating archive page.')
    if (query.data.cursor) {
      let value: unknown
      try { value = JSON.parse(query.data.cursor) } catch { throw new ApiError('BAD_REQUEST', 'Use a valid rating archive cursor.') }
      const parsed = memberRatingCursorSchema.safeParse(value)
      if (!parsed.success || parsed.data.value !== query.data.value) throw new ApiError('BAD_REQUEST', 'Use a valid rating archive cursor.')
    }
    void reply.header('cache-control', 'private, no-store')
    const page = await deps.memberData.ratingsByValue((await viewer(request, true))!, query.data.value, query.data.cursor, query.data.limit)
    return memberRatingPageSchema.parse(page)
  })

  app.get('/v1/me/ratings/lookup', async (request, reply) => {
    const query = memberRatingLookupQuerySchema.safeParse(request.query)
    if (!query.success) throw new ApiError('BAD_REQUEST', 'Use valid title references for rating lookup.')
    const titles = query.data.titles.split(',').map((item) => {
      const match = /^(movie|series|anime):([1-9]\d*)$/.exec(item)
      return match ? { id: Number(match[2]), kind: match[1] } : null
    })
    if (titles.some((title) => !title || !Number.isSafeInteger(title.id))) throw new ApiError('BAD_REQUEST', 'Use valid title references for rating lookup.')
    const parsed = memberRatingLookupRequestSchema.safeParse({ titles })
    if (!parsed.success) throw new ApiError('BAD_REQUEST', 'Use up to 50 valid title references for rating lookup.')
    void reply.header('cache-control', 'private, no-store')
    return memberRatingLookupResponseSchema.parse(await deps.memberData.ratingsForTitles((await viewer(request, true))!, parsed.data.titles))
  })

  app.get('/v1/lists/:slug', async (request, reply) => {
    void reply.header('cache-control', 'private, no-store')
    const slug = (request.params as { slug?: unknown }).slug
    if (typeof slug !== 'string' || !slug || slug.length > 200) throw new ApiError('BAD_REQUEST', 'Use a valid list slug.')
    const list = await deps.memberData.list(slug, await viewer(request, true))
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
        await deps.memberData.setWatched((await viewer(request, true))!, parsed.data, method === 'PUT')
        return reply.code(204).send()
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
    return memberTitleStateSchema.parse(await deps.memberData.titleState(memberId, parsed.data))
  })

  app.get('/v1/reviews/:kind/:id', async (request, reply) => {
    const params = request.params as { id?: unknown; kind?: unknown }
    const ref = catalogRefSchema.safeParse({ id: Number(params.id), kind: params.kind })
    if (!ref.success) throw new ApiError('BAD_REQUEST', 'Use a valid movie or series identifier.')
    const query = titleReviewsQuerySchema.safeParse(request.query)
    if (!query.success) throw new ApiError('BAD_REQUEST', 'Use a valid reviews page, sort, and audience.')
    void reply.header('cache-control', 'private, no-store')
    return titleReviewsPageSchema.parse(await deps.memberData.titleReviews(ref.data, query.data.page, query.data.sort, await viewer(request, true)))
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
