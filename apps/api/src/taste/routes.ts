import { z } from 'zod'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import {
  tastePresentationWriteSchema, tasteProfileSchema, tasteDraftWriteSchema, tasteDraftReadSchema,
  tasteEditionWriteSchema, tasteEditionReadSchema, tasteListReadSchema, tasteListWriteSchema,
  tasteReviewWriteSchema, tasteReviewSchema, tasteTargetSchema, tasteCommentWriteSchema,
  tasteCommentEditSchema, tasteDiscussionSchema, tasteCommunitySchema, tasteNotificationsSchema,
  tasteRecommendationPageSchema, tasteRecommendationWriteSchema, tasteRecommendationResponseWriteSchema, tasteRecommendationSchema,
  tasteReportSchema, tasteReportsSchema, tasteModerationSchema, tasteAuthorSchema, tasteShareSchema,
} from '@consumit/contracts'
import type { ApiEnv } from '../config/env.ts'
import type { Identity } from '../identity/identity.ts'
import { sessionCookieName } from '../identity/session.ts'
import { requestMember } from '../http/request-member.ts'
import { isAllowedOrigin } from '../http/csrf.ts'
import { ApiError } from '../http/errors.ts'
import type { TasteRepository } from './repository.ts'

export function registerTasteRoutes(app: FastifyInstance, deps: { env: ApiEnv; identity: Identity; repository?: TasteRepository | undefined }) {
  const repo = () => { if (!deps.repository) throw new ApiError('AUTH_STATE_UNAVAILABLE', 'Publishing is temporarily unavailable. Try again.'); return deps.repository }
  const parse = <T>(schema: z.ZodType<T>, value: unknown): T => { const result = schema.safeParse(value); if (!result.success) throw new ApiError('BAD_REQUEST', result.error.issues[0]?.message ?? 'Check these details.'); return result.data }
  async function member(request: FastifyRequest, required = false, admin = false) {
    if (!['GET', 'HEAD'].includes(request.method) && !isAllowedOrigin(request.headers, deps.env.appOrigin, deps.env.nodeEnv !== 'production')) throw new ApiError('FORBIDDEN', 'Cross-site requests are not allowed.')
    const result = await requestMember(request, deps.identity, sessionCookieName(deps.env))
    if (required && !result) throw new ApiError('UNAUTHENTICATED', 'Sign in to continue.')
    if (admin && result?.role !== 'admin') throw new ApiError('FORBIDDEN', 'Admin access required.')
    return result?.id
  }
  const params = (r: FastifyRequest) => parse(z.record(z.string(), z.string().min(1).max(160)), r.params)
  const query = (r: FastifyRequest) => parse(z.object({ cursor: z.string().max(160).optional(), mode: z.enum(['following', 'discover']).default('discover'), q: z.string().max(100).default(''), genre: z.string().max(60).optional(), kind: z.enum(['all', 'movie', 'series', 'anime']).default('all'), draft: z.enum(['true', 'false']).default('false') }), r.query)
  app.addHook('onRequest', async (request, reply) => { if (request.url.startsWith('/v1/taste/')) reply.header('cache-control', 'private, no-store') })
  app.addHook('preHandler', async request => {
    const tastePrivateRead = /^\/v1\/taste\/(drafts|notifications|recommendations|blocks|subscriptions|moderation)(\/|\?|$)/.test(request.url)
    if (request.url.startsWith('/v1/taste/') && (tastePrivateRead || !['GET', 'HEAD'].includes(request.method))) await member(request, true)
    if (deps.repository && !['GET', 'HEAD', 'DELETE'].includes(request.method) && /^\/v1\/me\/(reviews|lists)(\/|$)/.test(request.url)) {
      const id = await member(request, true)
      if (id) await deps.repository.assertPublishingAllowed(id)
    }
  })
  app.get('/v1/taste/profiles/:username', async r => { const viewer = await member(r); return tasteProfileSchema.parse(await repo().profile(params(r).username!, (r.query as { visitor?: string }).visitor === 'true' ? undefined : viewer)) })
  app.get('/v1/taste/share/:kind/:id', async r => { const p = parse(z.object({ kind: z.enum(['review', 'list', 'edition']), id: z.string().min(1).max(160) }), r.params); return tasteShareSchema.parse(await repo().share(p.kind, p.id)) })
  app.put('/v1/taste/presentation', async r => { const id = (await member(r, true))!, { revision, ...data } = parse(tastePresentationWriteSchema, r.body); return repo().savePresentation(id, data, revision) })
  app.get('/v1/taste/drafts/:key', async r => tasteDraftReadSchema.parse(await repo().draft((await member(r, true))!, params(r).key!)))
  app.put('/v1/taste/drafts/:key', async r => { const id = (await member(r, true))!, input = parse(tasteDraftWriteSchema, r.body); return tasteDraftReadSchema.parse(await repo().saveDraft(id, params(r).key!, input.data, input.revision)) })
  app.get('/v1/taste/profiles/:username/editions/:month', async r => tasteEditionReadSchema.parse(await repo().edition(params(r).username!, params(r).month!, await member(r), query(r).draft === 'true')))
  app.put('/v1/taste/editions', async r => { const id = (await member(r, true))!, { revision, publish, ...data } = parse(tasteEditionWriteSchema, r.body); return repo().saveEdition(id, data, revision, publish) })
  app.delete('/v1/taste/editions/:month', async (r, reply) => { await repo().unpublishEdition((await member(r, true))!, params(r).month!); return reply.code(204).send() })
  app.get('/v1/taste/lists/:id', async r => tasteListReadSchema.parse(await repo().listLayout(params(r).id!, await member(r))))
  app.put('/v1/taste/lists/:id', async r => repo().saveList((await member(r, true))!, params(r).id!, parse(tasteListWriteSchema, r.body)))
  app.get('/v1/taste/reviews/:id', async r => tasteReviewSchema.parse(await repo().review(params(r).id!, await member(r))))
  app.delete('/v1/taste/reviews/:id', async (r, reply) => { await repo().deleteReview((await member(r, true))!, params(r).id!); return reply.code(204).send() })
  app.post('/v1/taste/reviews', async r => repo().publishReview((await member(r, true))!, parse(tasteReviewWriteSchema, r.body)))
  app.put('/v1/taste/reviews/:id/like', async (r, reply) => { await repo().likeReview((await member(r, true))!, params(r).id!, parse(z.object({ liked: z.boolean() }), r.body).liked); return reply.code(204).send() })
  app.get('/v1/taste/discussion/:kind/:id', async r => tasteDiscussionSchema.parse(await repo().discussion(parse(tasteTargetSchema, params(r)), await member(r), query(r).cursor)))
  app.post('/v1/taste/discussion/:kind/:id', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async r => repo().comment((await member(r, true))!, parse(tasteTargetSchema, params(r)), parse(tasteCommentWriteSchema, r.body)))
  app.patch('/v1/taste/comments/:id', async (r, reply) => { await repo().editComment((await member(r, true))!, params(r).id!, parse(tasteCommentEditSchema, r.body)); return reply.code(204).send() })
  app.delete('/v1/taste/comments/:id', async (r, reply) => { await repo().editComment((await member(r, true))!, params(r).id!, null); return reply.code(204).send() })
  app.get('/v1/taste/subscriptions/:kind/:id', async r => repo().subscription((await member(r, true))!, parse(tasteTargetSchema, params(r))))
  app.put('/v1/taste/subscriptions/:kind/:id', async (r, reply) => { await repo().subscribe((await member(r, true))!, parse(tasteTargetSchema, params(r)), parse(z.object({ mode: z.enum(['updates', 'mute', 'off', 'unmute']) }), r.body).mode); return reply.code(204).send() })
  app.get('/v1/taste/blocks', async r => z.object({ items: z.array(tasteAuthorSchema) }).parse(await repo().blocks((await member(r, true))!)))
  app.put('/v1/taste/blocks/:id', async (r, reply) => { await repo().block((await member(r, true))!, params(r).id!, parse(z.object({ enabled: z.boolean() }), r.body).enabled); return reply.code(204).send() })
  app.get('/v1/taste/community', async r => { const q = query(r); return tasteCommunitySchema.parse(await repo().community(await member(r), q.mode, q.q, q.kind, q.cursor, q.genre)) })
  app.get('/v1/taste/notifications', async r => tasteNotificationsSchema.parse(await repo().notifications((await member(r, true))!, query(r).cursor)))
  app.post('/v1/taste/notifications/read-all', async (r, reply) => { await repo().readNotifications((await member(r, true))!); return reply.code(204).send() })
  app.get('/v1/taste/recommendations', async r => tasteRecommendationPageSchema.parse(await repo().recommendations((await member(r, true))!, query(r).cursor)))
  app.post('/v1/taste/recommendations', { config: { rateLimit: { max: 30, timeWindow: '1 hour' } } }, async r => {
    const input = parse(tasteRecommendationWriteSchema, r.body)
    return tasteRecommendationSchema.parse(await repo().sendRecommendation((await member(r, true))!, input.recipientId, { kind: input.kind, id: input.id }))
  })
  app.put('/v1/taste/recommendations/:id/response', async (r, reply) => {
    const { response } = parse(tasteRecommendationResponseWriteSchema, r.body)
    await repo().respondToRecommendation((await member(r, true))!, params(r).id!, response)
    return reply.code(204).send()
  })
  app.post('/v1/taste/reports', async (r, reply) => { const id = (await member(r, true))!, input = parse(tasteReportSchema, r.body); await repo().report(id, { kind: input.kind, id: input.id }, input.reason, input.commentId, input.idempotencyKey); return reply.code(204).send() })
  app.get('/v1/taste/moderation', async r => { await member(r, true, true); return tasteReportsSchema.parse(await repo().reports()) })
  app.post('/v1/taste/moderation/:id', async (r, reply) => { const id = (await member(r, true, true))!, input = parse(tasteModerationSchema, r.body); await repo().moderate(id, params(r).id!, input.action, input.note); return reply.code(204).send() })
}
