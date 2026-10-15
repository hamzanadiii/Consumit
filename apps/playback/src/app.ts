import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import { Valkey } from 'iovalkey'
import { authorizedInternal, createInternalClient, type InternalFetch } from '@consumit/server'
import { diagnosticOperationSchema, providerAttemptSchema, backgroundOperationSchema } from '@consumit/contracts/internal'
import type { ApiEnv } from '../../api/src/config/env.ts'
import { registerErrorHandlers, ApiError, rateLimitExceeded } from '../../api/src/http/errors.ts'
import { generateRequestId, loggerOptions, registerRequestContext } from '../../api/src/http/request-context.ts'
import { registerPlaybackRoutes } from '../../api/src/playback/routes.ts'
import { registerSubtitleRoutes } from '../../api/src/subtitles/routes.ts'
import { registerProviderComputeRoutes } from '../../api/src/playback/provider-compute.ts'
import { registerSkipTimesRoutes } from '../../api/src/playback/skip-times-routes.ts'
import { createSkipTimes } from '../../api/src/playback/skip-times.ts'
import { createScoutCatalog, scoutRecipes } from '../../api/src/admin/scout-catalog.ts'
import { inspectProviderSources } from '../../api/src/playback/inspection.ts'
import { createPlaybackRelay } from '../../api/src/playback/relay.ts'
import { createAnimeTitleResolver, createAnimeTitleVariantsResolver, createAnimeMetaResolver } from '../../api/src/anime/title-resolver.ts'
import { createPlaybackRuntime } from './runtime.ts'
import { createDiagnostics } from './diagnostics.ts'
import { createProductClient } from './product-client.ts'
import { registerOpenApi } from '../../api/src/http/openapi.ts'
import { S3Client } from '@aws-sdk/client-s3'
import { readAwsCredentials } from '../../api/src/config/aws-credentials.ts'
import { createS3FileStore } from './s3-files.ts'
import { z } from 'zod'
import { releaseProbeSourceSchema } from '@consumit/contracts'
import { resolveReleaseProbeSource } from '../../api/src/releases/service.ts'
import type { SubtitleService } from '../../api/src/subtitles/subtitles.ts'

export async function buildPlaybackApp(env: ApiEnv, fetcher: InternalFetch = fetch, dependencies: { subtitles?: SubtitleService } = {}) {
  if (!env.internal?.apiOrigin) throw new Error('Playback requires its private product API origin.')
  const client = createProductClient(createInternalClient({ origin: env.internal.apiOrigin, secret: env.internal.secret }, fetcher))
  const app = Fastify({ bodyLimit: 1048576, genReqId: generateRequestId, logger: env.nodeEnv === 'test' ? false : loggerOptions(), trustProxy: env.trustedProxies.length ? env.trustedProxies : false, requestTimeout: 15000 })
  await app.register(cookie); await app.register(helmet)
  await registerOpenApi(app, 'Consumit playback API', '/v1/playback/openapi.json')
  const limits = env.nodeEnv === 'production' && env.valkeyUrl ? new Valkey(env.valkeyUrl, { lazyConnect: true, maxRetriesPerRequest: 1, connectTimeout: 1500, commandTimeout: 2000, enableOfflineQueue: false }) : undefined
  if (limits) { limits.on('error', () => {}); await limits.connect(); app.addHook('onClose', async () => { limits.disconnect() }) }
  await app.register(rateLimit, { ...(limits ? { redis: limits, nameSpace: 'consumit:playback:http-limits:v1:' } : {}), skipOnError: false, max: 100, timeWindow: '1 minute', errorResponseBuilder: () => rateLimitExceeded() })
  registerErrorHandlers(app); registerRequestContext(app)
  const providerOptions = {
    tmdbMetadataResolver: client.tmdb,
    tmdbIdentityResolver: async (ref: Parameters<typeof client.tmdb>[0], signal: AbortSignal) => ({ imdbId: (await client.metadata('vaplayer', ref, signal)).imdbId }),
    animeTitleResolver: createAnimeTitleResolver(client.anime), animeTitleVariantsResolver: createAnimeTitleVariantsResolver(client.anime), animeMetaResolver: createAnimeMetaResolver(client.anime),
    ...(env.playback?.relay?.discovery?.['lookmovie-relay'] === 'lookmovie-v1' ? { lookmovieWorker: { origin: env.playback.relay.origin, secret: env.playback.relay.secret } } : {}),
  }
  let remoteFiles: ReturnType<typeof createS3FileStore> | undefined
  let objectClient: S3Client | undefined
  const parsedBackend = z.enum(['disk', 's3']).safeParse(process.env.SUBTITLE_FILE_BACKEND ?? 'disk')
  if (!parsedBackend.success) throw new Error('Use a supported subtitle storage backend.')
  const backend = parsedBackend.data
  if (backend === 's3') {
    const storage = z.object({ SUBTITLES_S3_BUCKET: z.string().min(1), SUBTITLES_S3_REGION: z.string().min(1), SUBTITLES_S3_ENDPOINT: z.url().optional(), SUBTITLES_S3_CREDENTIALS_FILE: z.string().min(1) }).safeParse({ ...process.env, SUBTITLES_S3_ENDPOINT: process.env.SUBTITLES_S3_ENDPOINT || undefined })
    if (!storage.success) throw new Error('Subtitle object storage requires a bucket, region, and dedicated credentials.')
    if (storage.data.SUBTITLES_S3_ENDPOINT) { const url = new URL(storage.data.SUBTITLES_S3_ENDPOINT); if (url.protocol !== 'https:' || url.origin !== storage.data.SUBTITLES_S3_ENDPOINT || url.username || url.password) throw new Error('Use an exact HTTPS object storage origin.') }
    objectClient = new S3Client({ region: storage.data.SUBTITLES_S3_REGION, ...(storage.data.SUBTITLES_S3_ENDPOINT ? { endpoint: storage.data.SUBTITLES_S3_ENDPOINT } : {}), credentials: readAwsCredentials(storage.data.SUBTITLES_S3_CREDENTIALS_FILE), maxAttempts: 1 })
    remoteFiles = createS3FileStore(objectClient, storage.data.SUBTITLES_S3_BUCKET)
    app.addHook('onClose', async () => { objectClient?.destroy() })
  }
  const runtime = await createPlaybackRuntime({ env, animeCatalog: client.anime, providerConfigStore: client.config, configurationSnapshot: client.snapshot, subtitleCatalog: client.subtitles, providerOptions, metadata: client.metadata, titleMetadata: client.tmdb, ...(dependencies.subtitles ? { subtitles: dependencies.subtitles } : {}), ...(remoteFiles ? { files: remoteFiles } : {}), log: fields => app.log.info(fields, 'playback operation') })
  app.addHook('onClose', () => runtime.close())
  app.addHook('preHandler', async request => {
    if (!request.url.startsWith('/v1/playback/') || runtime.configurationCurrent()) return
    try { await runtime.refreshConfiguration() } catch { throw new ApiError('PLAYBACK_UNAVAILABLE', 'Playback configuration is temporarily unavailable.', { retryable: true }) }
  })
  registerPlaybackRoutes(app, { playback: runtime.playback, origin: env.appOrigin, secure: env.nodeEnv === 'production', dev: env.nodeEnv !== 'production' })
  registerSubtitleRoutes(app, { subtitles: runtime.subtitles, env, mode: 'delivery' })
  registerSkipTimesRoutes(app, env.nodeEnv === 'test' ? { read: async () => [] } : createSkipTimes({ animeMalId: async id => (await client.anime.title(id)).malId }))
  if (env.playback?.resolver?.computeSecret) registerProviderComputeRoutes(app, env.playback.resolver.computeSecret)
  // Diagnostics run here against the live runtime, but only through a typed,
  // validated operation forwarded by the product API. Playback exposes no
  // admin surface, session, or re-injectable path of its own.
  const scoutCatalog = env.playback?.enabled ? createScoutCatalog(providerOptions) : undefined
  const diagnostics = createDiagnostics({
    env,
    providers: runtime.providers,
    store: runtime.store,
    playback: runtime.playback,
    subtitles: runtime.subtitles,
    ...(runtime.probeScheduler ? { probeStatus: () => runtime.probeScheduler!.status() } : {}),
    scoutCatalog,
    scoutRecipes,
  })
  const options = { config: { rateLimit: false as const }, preHandler: async (request: import('fastify').FastifyRequest, reply: import('fastify').FastifyReply) => {
    reply.header('cache-control', 'private, no-store')
    if (!authorizedInternal(request.headers.authorization, env.internal?.secret)) throw new ApiError('FORBIDDEN', 'This internal request is not allowed.')
  } }
  app.post('/v1/internal/playback/diagnostics', options, async request => {
    const parsed = diagnosticOperationSchema.safeParse(request.body)
    if (!parsed.success) throw new ApiError('BAD_REQUEST', 'Use a supported diagnostic operation.')
    const { statusCode, body } = await diagnostics(parsed.data)
    return { statusCode, body }
  })
  app.post('/v1/internal/playback/attempt', options, async request => {
    const parsed = providerAttemptSchema.safeParse(request.body)
    if (!parsed.success) throw new ApiError('BAD_REQUEST', 'Use a valid configured attempt.')
    const provider = runtime.providers.find(row => row.adapter.id === parsed.data.providerId && row.enabled && row.approvedRegions.includes(parsed.data.region) && row.mediaKinds.includes(parsed.data.ref.kind))
    if (!provider) return { ok: false, code: 'unavailable', retryable: false }
    const result = await inspectProviderSources(provider, parsed.data, AbortSignal.timeout(15000), runtime.store)
    return result.sources.length ? { ok: true, sources: result.sources } : { ok: false, code: 'empty', retryable: false }
  })
  app.post('/v1/internal/playback/release-source', options, async request => {
    const parsed = providerAttemptSchema.safeParse(request.body)
    if (!parsed.success || parsed.data.region !== env.tmdbRegion) throw new ApiError('BAD_REQUEST', 'Use a valid release-check reference.')
    const provider = runtime.providers.find(row => row.adapter.id === parsed.data.providerId && row.enabled && row.approvedRegions.includes(parsed.data.region) && row.mediaKinds.includes(parsed.data.ref.kind))
    if (!provider) return { source: null }
    const source = await resolveReleaseProbeSource(provider, parsed.data.ref, parsed.data.audioLanguage, { region: env.tmdbRegion, origin: env.appOrigin, store: runtime.store, ...(env.playback?.relay ? { relay: createPlaybackRelay(env.playback.relay), relayOrigin: env.playback.relay.origin } : {}) })
    return { source: source ? releaseProbeSourceSchema.parse(source) : null }
  })
  app.post('/v1/internal/jobs/run', options, async request => {
    const parsed = backgroundOperationSchema.safeParse(request.body)
    if (!parsed.success || !['provider.refresh', 'provider.probe'].includes(parsed.data.operation)) throw new ApiError('BAD_REQUEST', 'Use a playback background operation.')
    if (parsed.data.operation === 'provider.refresh') await runtime.refreshConfiguration()
    else await runtime.probeScheduler?.runOnce({ budgetMs: 60000, onlyDue: true })
    return { completed: true }
  })
  app.get('/health/live', { config: { rateLimit: false } }, async () => ({ status: 'ok' }))
  app.get('/health/ready', { config: { rateLimit: false } }, async (_request, reply) => {
    try { await client.config.getRevision(); if (env.playback?.stateUrl) await runtime.store.get('readiness'); return { status: 'ok' } }
    catch { return reply.code(503).send({ status: 'degraded' }) }
  })
  return app
}


