import {
  catalogRefSchema,
  favoriteSelectionRequestSchema,
  memberLibrarySchema,
  memberListDetailSchema,
  memberProfileDataSchema,
  playbackProgressSchema,
  progressRefSchema,
  progressWriteRequestSchema,
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
    if (!isAllowedOrigin(request.headers, deps.env.appOrigin)) throw new ApiError('FORBIDDEN', 'Cross-site requests are not allowed.')
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
    if (!record) throw new ApiError('NOT_FOUND', 'No saved progress for this title.')
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
}
