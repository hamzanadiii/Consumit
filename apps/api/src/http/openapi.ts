import type { FastifyInstance } from 'fastify'
import swagger from '@fastify/swagger'
import { jsonSchemaTransform, validatorCompiler, serializerCompiler } from 'fastify-type-provider-zod'
import { resolvePlaybackRequestSchema, playbackSessionSchema, playbackSwitchRequestSchema, playbackFailureRequestSchema, playbackEventsSchema, playbackProviderListSchema } from '@consumit/contracts'
import * as contracts from '@consumit/contracts'
import type { ZodType } from 'zod'

const operations: Record<string, { body?: ZodType; response?: Record<number, ZodType> }> = {
  'POST /v1/auth/register': { body: contracts.registerRequestSchema, response: { 202: contracts.acceptedResponseSchema } },
  'POST /v1/auth/login': { body: contracts.loginRequestSchema, response: { 200: contracts.sessionMemberResponseSchema } },
  'POST /v1/auth/verify-email': { body: contracts.verifyEmailRequestSchema, response: { 200: contracts.sessionMemberResponseSchema } },
  'POST /v1/auth/verification/request': { body: contracts.emailRequestSchema, response: { 202: contracts.acceptedResponseSchema } },
  'POST /v1/auth/recovery/request': { body: contracts.emailRequestSchema, response: { 202: contracts.acceptedResponseSchema } },
  'POST /v1/auth/recovery/confirm': { body: contracts.recoveryConfirmRequestSchema },
  'POST /v1/auth/password/change': { body: contracts.passwordChangeRequestSchema },
  'GET /v1/me': { response: { 200: contracts.sessionMemberResponseSchema } },
  'GET /v1/me/profile': { response: { 200: contracts.profileSchema } },
  'GET /v1/me/export': { response: { 200: contracts.memberExportSchema } },
  'DELETE /v1/me': { body: contracts.accountDeletionRequestSchema },
  'GET /v1/titles/discover': { response: { 200: contracts.catalogPageSchema } },
  'GET /v1/titles/search': { response: { 200: contracts.catalogPageSchema } },
  'GET /v1/titles/batch': { response: { 200: contracts.catalogBatchSchema } },
  'GET /v1/titles/:kind/:id': { response: { 200: contracts.catalogTitleResponseSchema } },
  'GET /v1/titles/series/:id/seasons/:season': { response: { 200: contracts.catalogSeasonResponseSchema } },
  'GET /v1/me/library': { response: { 200: contracts.memberLibrarySnapshotSchema } },
  'GET /v1/me/watch-history': { response: { 200: contracts.watchHistoryPageSchema } },
  'GET /v1/me/continue-watching': { response: { 200: contracts.continueWatchingPageSchema } },
  'PUT /v1/me/continue-watching/hide': { body: contracts.catalogRefSchema },
  'GET /v1/me/recommendation-dismissals': { response: { 200: contracts.recommendationDismissalsSchema } },
  'PUT /v1/me/recommendation-dismissals': { body: contracts.catalogRefSchema },
  'POST /v1/playback/attempts': { body: contracts.playbackAttemptRequestSchema, response: { 200: contracts.playbackAttemptSchema } },
  'POST /v1/playback/attempts/:id/continue': { response: { 200: contracts.playbackAttemptSchema } },
  'PUT /v1/progress': { body: contracts.progressWriteRequestSchema, response: { 200: contracts.playbackProgressSchema } },
  'GET /v1/progress/:kind/:id': { response: { 200: contracts.playbackProgressSchema } },
  'GET /v1/profiles/:username': { response: { 200: contracts.profileReadResponseSchema } },
  'POST /v1/telemetry/client-errors': { body: contracts.clientErrorBatchSchema },
}

/** Canonical Zod validation remains in handlers, including their established errors. */
export async function registerOpenApi(app: FastifyInstance, title: string, path = '/v1/openapi.json') {
  app.setValidatorCompiler(validatorCompiler); app.setSerializerCompiler(serializerCompiler)
  await app.register(swagger, { openapi: { info: { title, version: '1.0.0' } }, transform: jsonSchemaTransform })
  app.addHook('onRoute', route => {
    if (route.url.startsWith('/v1/internal/') || route.url.startsWith('/v1/admin/') || route.url.startsWith('/health')) { route.schema = { ...route.schema, hide: true }; return }
    const method = Array.isArray(route.method) ? route.method[0] : route.method
    const operation = operations[`${method} ${route.url}`]
    if (operation) { route.attachValidation = true; route.schema = { ...route.schema, ...operation }; return }
    if (!route.url.startsWith('/v1/playback/')) return
    const body = route.url.endsWith('/resolve') || route.url.endsWith('/providers') ? resolvePlaybackRequestSchema
      : route.url.endsWith('/switch') ? playbackSwitchRequestSchema
      : route.url.endsWith('/refresh') || route.url.endsWith('/fallback') ? playbackFailureRequestSchema
      : route.url.endsWith('/events') ? playbackEventsSchema : undefined
    if (!body) return
    route.attachValidation = true
    route.schema = { ...route.schema, body, ...(route.url.endsWith('/events') ? {} : { response: { 200: route.url.endsWith('/providers') ? playbackProviderListSchema : playbackSessionSchema } }) }
  })
  app.get(path, { config: { rateLimit: { max: 10, timeWindow: '1 minute' } }, schema: { hide: true } }, async (_request, reply) => reply.header('cache-control', 'private, no-store').send(app.swagger()))
}
