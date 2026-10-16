import { timingSafeEqual } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { notificationPageSchema, notificationPreferencesSchema, notificationQuerySchema, readNotificationSchema, releaseShelfSchema,
  releaseProbeEvidenceSchema, releaseProbeJobSchema, releaseProbeSourceSchema } from '@consumit/contracts'
import type { ApiEnv } from '../config/env.ts'
import type { Identity } from '../identity/identity.ts'
import { sessionCookieName } from '../identity/session.ts'
import { requestMember } from '../http/request-member.ts'
import { isAllowedOrigin } from '../http/csrf.ts'
import { ApiError } from '../http/errors.ts'
import type { ReleaseService } from './service.ts'
import { recordReleaseCheck } from './telemetry.ts'

const leaseSchema = z.object({ id: z.uuid(), leaseToken: z.uuid() }).strict()
export function registerReleaseRoutes(app: FastifyInstance, deps: { env: ApiEnv; identity: Identity; service?: ReleaseService | undefined }) {
  async function member(request: FastifyRequest, mutation = false) {
    if (mutation && !isAllowedOrigin(request.headers, deps.env.appOrigin, deps.env.nodeEnv !== 'production')) throw new ApiError('FORBIDDEN', 'This request is not allowed.')
    const owner = await requestMember(request, deps.identity, sessionCookieName(deps.env))
    if (!owner) throw new ApiError('UNAUTHENTICATED', 'Sign in to see your episode updates.')
    return owner.id
  }
  function service() {
    if (!deps.service) throw new ApiError('INTERNAL', 'Episode updates are temporarily unavailable.', { retryable: true })
    return deps.service
  }
  function authorizeWorker(request: FastifyRequest) {
    const expected = deps.env.releases?.workerSecret
    const actual = request.headers.authorization?.replace(/^Bearer /, '')
    if (!expected || !actual || Buffer.byteLength(actual) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) throw new ApiError('FORBIDDEN', 'This request is not allowed.')
    if (!deps.env.releases?.enabled) throw new ApiError('NOT_FOUND', 'Episode checks are not enabled.')
  }
  app.get('/v1/me/releases', async (request, reply) => {
    const owner = await member(request)
    reply.header('cache-control', 'private, no-store')
    return releaseShelfSchema.parse(await service().shelf(owner))
  })
  app.get('/v1/me/notifications', async (request, reply) => {
    const memberId = await member(request), parsed = notificationQuerySchema.safeParse(request.query)
    if (!parsed.success) throw new ApiError('BAD_REQUEST', 'Use a valid notification filter and cursor.')
    reply.header('cache-control', 'private, no-store')
    return notificationPageSchema.parse(await service().notifications(memberId, parsed.data))
  })
  app.patch('/v1/me/notifications/:id', async (request, reply) => {
    const memberId = await member(request, true), parsed = z.object({ id: z.uuid() }).safeParse(request.params)
    if (!parsed.success || !readNotificationSchema.safeParse(request.body).success) throw new ApiError('BAD_REQUEST', 'Choose a notification to mark read.')
    await service().markRead(memberId, parsed.data.id)
    return reply.header('cache-control', 'private, no-store').code(204).send()
  })
  app.post('/v1/me/notifications/read-all', async (request, reply) => {
    const owner = await member(request, true)
    await service().markRead(owner)
    return reply.header('cache-control', 'private, no-store').code(204).send()
  })
  app.get('/v1/me/notification-preferences', async (request, reply) => {
    const owner = await member(request)
    reply.header('cache-control', 'private, no-store')
    return notificationPreferencesSchema.parse(await service().preferences(owner))
  })
  app.patch('/v1/me/notification-preferences', async (request, reply) => {
    const owner = await member(request, true), parsed = notificationPreferencesSchema.safeParse(request.body)
    if (!parsed.success) throw new ApiError('BAD_REQUEST', 'Choose a notification preference.')
    reply.header('cache-control', 'private, no-store')
    return notificationPreferencesSchema.parse(await service().setPreferences(owner, parsed.data.newEpisodes))
  })
  app.post('/v1/internal/releases/claim', async (request, reply) => {
    authorizeWorker(request)
    const job = await service().claimCheck()
    return reply.header('cache-control', 'private, no-store').send({ job: job ? releaseProbeJobSchema.parse(job) : null })
  })
  // Job-scoped, short-lived authorization for the first-party probe page only.
  app.post('/v1/internal/releases/authorize', async (request, reply) => {
    const parsed = leaseSchema.safeParse(request.body)
    if (!parsed.success || !deps.env.releases?.enabled || !await service().authorizeJob(parsed.data.id, parsed.data.leaseToken)) throw new ApiError('FORBIDDEN', 'This playback check has expired.')
    return reply.header('cache-control', 'private, no-store').code(204).send()
  })
  app.post('/v1/internal/releases/source', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    authorizeWorker(request)
    const parsed = leaseSchema.extend({ kind: z.enum(['series', 'anime']) }).safeParse(request.body)
    if (!parsed.success) throw new ApiError('BAD_REQUEST', 'Use a valid playback check.')
    request.raw.setTimeout(20_000)
    const source = await service().source(parsed.data.id, parsed.data.leaseToken, parsed.data.kind)
    return reply.header('cache-control', 'private, no-store').send({ source: source ? releaseProbeSourceSchema.parse(source) : null })
  })
  app.post('/v1/internal/releases/result', async (request, reply) => {
    authorizeWorker(request)
    const parsed = leaseSchema.extend({ evidence: releaseProbeEvidenceSchema }).safeParse(request.body)
    if (!parsed.success) throw new ApiError('BAD_REQUEST', 'Use valid playback evidence.')
    const result = await service().finishCheck(parsed.data.id, parsed.data.leaseToken, parsed.data.evidence)
    if (result) { recordReleaseCheck(result.passed, result.notificationsInserted); app.log.info({ component: 'release-check', ...result }, 'episode check finished') }
    return reply.header('cache-control', 'private, no-store').code(204).send()
  })
}
