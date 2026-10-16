import { createInternalClient } from '@consumit/server'
import { providerResultSchema } from '@consumit/provider-sdk'
import { registerProductInternal } from './internal/routes.ts'
import { createPlaybackRuntime } from '../../playback/src/runtime.ts'
import { registerOpenApi } from './http/openapi.ts'
import { registerClientErrors } from './telemetry/client-errors.ts'
import { observePool } from '@consumit/observability'
import { releaseProbeSourceSchema } from '@consumit/contracts'
import { z } from 'zod'
import cookie from '@fastify/cookie'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import Fastify from 'fastify'
import { Valkey } from 'iovalkey'
import type { Catalog } from './catalog/catalog.ts'
import { registerCatalogRoutes } from './catalog/routes.ts'
import { unavailableCatalogAdapter } from './catalog/unavailable-catalog.ts'
import { createAnilistCatalog, type AnimeCatalog } from './catalog/anilist/adapter.ts'
import { createCachedAnimeCatalog } from './catalog/anilist/cached-catalog.ts'
import { createTmdbCatalog } from './catalog/tmdb-catalog.ts'
import { createPostgresCatalogCacheStore } from './catalog/postgres-cache-store.ts'
import { StaleCache } from './catalog/stale-cache.ts'
import { loadEnv, type ApiEnv } from './config/env.ts'
import { createDbClient } from './db/client.ts'
import { rateLimitExceeded, registerErrorHandlers } from './http/errors.ts'
import { apiRateLimitKey, isCatalogRead } from './http/rate-limit.ts'
import { registerHealthRoutes } from './http/health.ts'
import { generateRequestId, loggerOptions, registerRequestContext } from './http/request-context.ts'
import { createIdentity } from './identity/service.ts'
import { sessionCookieName } from './identity/session.ts'
import { registerIdentityRoutes } from './identity/routes.ts'
import { unavailableIdentity } from './identity/unavailable-identity.ts'
import type { Identity } from './identity/identity.ts'
import { createPostgresIdentityRepository } from './identity/postgres-repository.ts'
import type { IdentityRepository } from './identity/repository.ts'
import { createResendNotifier } from './identity/resend-notifier.ts'
import { createSesNotifier } from './identity/ses-notifier.ts'
import { readAwsCredentials } from './config/aws-credentials.ts'
import { readFileSync } from 'node:fs'
import { createValkeyAuthState } from './identity/valkey-auth-state.ts'
import type { MemberData } from './member-data/member-data.ts'
import { createPostgresMemberData } from './member-data/postgres-member-data.ts'
import { registerMemberDataRoutes } from './member-data/routes.ts'
import { createPublicMembers, type PublicMembers } from './member-data/public-members.ts'
import { unavailableMemberData } from './member-data/unavailable-member-data.ts'
import { type Playback } from './playback/playback.ts'
import { createPlaybackRelay } from './playback/relay.ts'
import { registerPlaybackRoutes } from './playback/routes.ts'
import { registerProviderComputeRoutes } from './playback/provider-compute.ts'
import { createSkipTimes } from './playback/skip-times.ts'
import { registerSkipTimesRoutes } from './playback/skip-times-routes.ts'
import { createMemoryPlaybackStore, createValkeyPlaybackStore } from './playback/state.ts'
import { loadConfiguredProviders } from './playback/configured-providers.ts'
import { createAnimeService } from './anime/anime-service.ts'
import type { KitsuCatalog } from './catalog/kitsu/kitsu.ts'
import { createAnimeMetaResolver, createAnimeTitleResolver, createAnimeTitleVariantsResolver } from './anime/title-resolver.ts'

import { registerAnimeRoutes } from './anime/routes.ts'
import { createKitsuCatalog } from './catalog/kitsu/adapter.ts'
import { createTmdbEpisodeArt, type TmdbEpisodeArtResolver } from './anime/tmdb-episode-art.ts'
import { createAnizipEpisodeArt, type CanonicalEpisodeArt } from './anime/anizip-episode-art.ts'


import { createAnizipClient } from './subtitles/anizip.ts'
import { createSubtitleHttp } from './subtitles/http.ts'



import { createPostgresSubtitleCatalog } from './subtitles/postgres-catalog.ts'
import { createPostgresSubtitlePreferences } from './subtitles/postgres-preferences.ts'
import type { SubtitlePreferences } from './subtitles/preferences.ts'





import { createSubtitleService, type SubtitleService } from './subtitles/subtitles.ts'
import { registerSubtitleRoutes } from './subtitles/routes.ts'




import { createTmdbMetadataResolver } from './playback/tmdb-metadata.ts'
import { createTmdbIdentityResolver } from './playback/tmdb-identity.ts'
import { createResolverMetadata } from './playback/cloudflare-resolver.ts'
import { registerAdminRoutes } from './admin/routes.ts'
import { createScoutCatalog, scoutRecipes } from './admin/scout-catalog.ts'
import { applyOrdersInPlace, createProviderConfigStore, type ProviderConfigStore, type ProviderKind } from './admin/provider-config.ts'
import { createPostgresProviderConfigStore } from './admin/postgres-provider-config.ts'
import { applyOverridesInPlace } from './admin/provider-config.ts'
import { registerWebVitalsRoutes } from './telemetry/web-vitals-routes.ts'
import { createReleaseRepository } from './releases/repository.ts'
import { createReleaseService, type ReleaseService } from './releases/service.ts'
import { registerReleaseRoutes } from './releases/routes.ts'
import { createExperienceRepository, type ExperienceRepository } from './experience/repository.ts'
import { registerExperienceRoutes } from './experience/routes.ts'
import { createReleaseScheduler } from './releases/scheduler.ts'
import { createReleaseCatalog } from './releases/catalog.ts'
import { providerRevision } from './releases/policy.ts'
import { suppliesVideo } from '@consumit/provider-sdk'
import { isProviderRemoved } from './admin/provider-config.ts'

type BuildAppOptions = {
  experience?: ExperienceRepository
  releases?: ReleaseService
  playback?: Playback
  catalog?: Catalog
  animeCatalog?: AnimeCatalog
  animeEpisodeArt?: KitsuCatalog
  animeTmdbEpisodeArt?: TmdbEpisodeArtResolver
  animeCanonicalEpisodeArt?: CanonicalEpisodeArt
  env?: ApiEnv
  identity?: Identity
  memberData?: MemberData
  publicMembers?: PublicMembers
  providerConfigStore?: ProviderConfigStore
  repository?: IdentityRepository
  subtitles?: SubtitleService
  subtitlePreferences?: SubtitlePreferences
}

export async function buildApp({ experience, publicMembers, releases, catalog = unavailableCatalogAdapter, animeCatalog, animeEpisodeArt, animeTmdbEpisodeArt, animeCanonicalEpisodeArt, env = loadEnv(), identity, memberData, providerConfigStore, repository: overrideRepository, playback, subtitles, subtitlePreferences }: BuildAppOptions = {}) {
  const app = Fastify({
    bodyLimit: 1_048_576,
    // Matches requestTimeout: subtitle aggregation may legitimately work
    // up to the route deadline on cold caches.
    connectionTimeout: 15_000,
    genReqId: generateRequestId,
    keepAliveTimeout: 5_000,
    logger: env.nodeEnv !== 'test' ? loggerOptions() : false,
    requestTimeout: 15_000,
    trustProxy: env.trustedProxies.length ? env.trustedProxies : false,
  })

  await app.register(helmet)
  await app.register(cookie)
  await registerOpenApi(app, 'Consumit product API')
  // Credential and public budgets survive restarts and apply across API
  // instances. Never silently fall back to per-process limits in production.
  const requestLimits = env.nodeEnv === 'production' && env.valkeyUrl
    ? new Valkey(env.valkeyUrl, { lazyConnect: true, connectTimeout: 3000, commandTimeout: 2000, maxRetriesPerRequest: 1, enableOfflineQueue: false, retryStrategy: (attempt) => Math.min(attempt * 200, 1000) })
    : undefined
  if (requestLimits) {
    requestLimits.on('error', () => { /* Request errors use the API error boundary. */ })
    try { await requestLimits.connect() } catch (error) { requestLimits.disconnect(); throw error }
    app.addHook('onClose', async () => { requestLimits.disconnect() })
  }
  await app.register(rateLimit, {
    ...(requestLimits ? { redis: requestLimits, nameSpace: 'consumit:http-limits:v1:' } : {}),
    skipOnError: false,
    errorResponseBuilder: () => rateLimitExceeded(),
    // Public catalog fan-out has a separate bounded bucket; it cannot
    // consume the general member budget. Credential routes remain stricter.
    keyGenerator: (request) => apiRateLimitKey(request, resolvedIdentity, sessionCookieName(env)),
    max: (request) => isCatalogRead(request) ? 600 : 100,
    timeWindow: '1 minute',
  })

  registerErrorHandlers(app)
  registerRequestContext(app)

  let closeIdentityResources: (() => Promise<void>) | undefined
  let closeReleaseScheduler: (() => Promise<void>) | undefined
  let resolvedIdentity = identity ?? unavailableIdentity
  let resolvedMemberData = memberData ?? unavailableMemberData
  const needsPersistentCatalogCache = env.nodeEnv !== 'test'
    && (!animeCatalog || (catalog === unavailableCatalogAdapter && Boolean(env.tmdbToken)))
  const needsDatabase = env.databaseUrl && (!identity || !memberData || needsPersistentCatalogCache)
  const db = needsDatabase ? createDbClient(env.databaseUrl!, {
      ...(env.databaseSslCaFile ? { sslCa: readFileSync(env.databaseSslCaFile, 'utf8') } : env.databaseSslCa ? { sslCa: env.databaseSslCa } : {}),
      sslMode: env.databaseSslMode,
    }) : null
  const catalogCacheStore = db && env.nodeEnv !== 'test' ? createPostgresCatalogCacheStore(db.prisma) : undefined
  if (db) { const closePoolMetrics = observePool(db.stats); app.addHook('onClose', async () => closePoolMetrics()) }
  const catalogCache = new StaleCache(Date.now, catalogCacheStore, (error) => {
    app.log.warn({ err: error }, 'catalog cache persistence failed')
  })
  if (!env.backgroundJobs && catalogCacheStore && env.nodeEnv !== 'test') {
    const pruneExpiredCatalogCache = () => {
      void catalogCacheStore.deleteExpired(new Date()).catch((error) => {
        app.log.warn({ err: error }, 'catalog cache cleanup failed')
      })
    }
    pruneExpiredCatalogCache()
    const timer = setInterval(pruneExpiredCatalogCache, 60 * 60_000)
    timer.unref()
    app.addHook('onClose', async () => clearInterval(timer))
  }
  const resolvedCatalog = catalog !== unavailableCatalogAdapter
    ? catalog
    : env.nodeEnv !== 'test' && env.tmdbToken
      ? createTmdbCatalog({ cache: catalogCache, language: env.tmdbLanguage, region: env.tmdbRegion, token: env.tmdbToken })
      : catalog
  const emailConfigured = env.emailProvider === 'ses' ? env.ses : env.resendApiKey
  if (!identity && db && env.valkeyUrl && env.authCodePepper && emailConfigured && env.authEmailFrom) {
    const state = createValkeyAuthState(env.valkeyUrl, env.authCodePepper)
    const notifier = env.emailProvider === 'ses' && env.ses
      ? createSesNotifier({ from: env.authEmailFrom, region: env.ses.region, configurationSet: env.ses.configurationSet, credentials: readAwsCredentials(env.ses.credentialsFile) })
      : createResendNotifier({ apiKey: env.resendApiKey!, from: env.authEmailFrom })
    resolvedIdentity = createIdentity({
      notifier,
      onNotificationError: () => app.log.error({ code: 'EMAIL_DELIVERY_UNAVAILABLE' }, 'authentication email was not delivered'),
      repository: createPostgresIdentityRepository(db.prisma),
      state,
    })
    closeIdentityResources = async () => {
      if ('close' in notifier && typeof notifier.close === 'function') notifier.close()
      await Promise.allSettled([state.close(), db.close()])
    }
  }
  if (!memberData && db) resolvedMemberData = createPostgresMemberData(db.prisma, env.backgroundJobs)

  app.addHook('onClose', async () => {
    await closeReleaseScheduler?.()
    await closeIdentityResources?.()
    if (db && !closeIdentityResources) await db.close()
  })
  registerHealthRoutes(app, {
    catalogConfigured: resolvedCatalog !== unavailableCatalogAdapter,
    identityConfigured: resolvedIdentity !== unavailableIdentity,
    probes: {
      ...(db ? { database: () => db.prisma.$queryRaw`SELECT 1` } : {}),
      ...(requestLimits ? { rateLimits: () => requestLimits.ping() } : {}),
      ...(db && env.backgroundJobs ? { outboxSchema: () => db.prisma.$queryRaw`SELECT 1 FROM "OutboxEvent" LIMIT 1` } : {}),
    },
  })
  registerWebVitalsRoutes(app)
  registerClientErrors(app)
  registerIdentityRoutes(app, { env, identity: resolvedIdentity })
  const repository = overrideRepository ?? (identity === undefined && db ? createPostgresIdentityRepository(db.prisma) : undefined)
  registerMemberDataRoutes(app, { env, identity: resolvedIdentity, memberData: resolvedMemberData, publicMembers: publicMembers ?? (db ? createPublicMembers(db.prisma) : undefined) })
  const rawAnimeCatalog = animeCatalog ?? createAnilistCatalog()
  const resolvedAnimeCatalog = catalogCacheStore && env.nodeEnv !== 'test'
    ? createCachedAnimeCatalog(rawAnimeCatalog, catalogCache)
    : rawAnimeCatalog
  const anizip = createAnizipClient(createSubtitleHttp(['api.ani.zip']))
  const animeService = createAnimeService(resolvedAnimeCatalog, {
    ...(animeCanonicalEpisodeArt ? { canonicalEpisodeArt: animeCanonicalEpisodeArt } : env.nodeEnv !== 'test' ? { canonicalEpisodeArt: createAnizipEpisodeArt(anizip, catalogCache) } : {}),
    episodeArt: animeEpisodeArt ?? createKitsuCatalog({ cache: catalogCache }),
    ...(animeTmdbEpisodeArt ? { tmdbEpisodeArt: animeTmdbEpisodeArt } : resolvedCatalog !== unavailableCatalogAdapter ? { tmdbEpisodeArt: createTmdbEpisodeArt(resolvedCatalog, catalogCache) } : {}),
  })
  registerCatalogRoutes(app, { anime: animeService, catalog: resolvedCatalog })
  if (env.applicationMode !== 'product') registerSkipTimesRoutes(app, env.nodeEnv === 'test' ? { read: async () => [] } : createSkipTimes({ animeMalId: async (id) => (await animeService.title(id)).malId }))
  registerAnimeRoutes(app, { anime: animeService })
  const productMode = env.applicationMode === 'product'
  const providerOptions = {
    tmdbToken: env.tmdbToken,
    ...(env.playback?.relay?.discovery?.['lookmovie-relay'] === 'lookmovie-v1' ? { lookmovieWorker: { origin: env.playback.relay.origin, secret: env.playback.relay.secret } } : {}),
    animeTitleResolver: createAnimeTitleResolver(resolvedAnimeCatalog),
    animeTitleVariantsResolver: createAnimeTitleVariantsResolver(resolvedAnimeCatalog),
    animeMetaResolver: createAnimeMetaResolver(resolvedAnimeCatalog),
  }
  const rawProviders = env.playback?.enabled ? await loadConfiguredProviders(env.playback.mediaConfig, providerOptions) : []
  const legacyProviderConfig = env.playback?.mediaConfig ? createProviderConfigStore(env.playback.mediaConfig.replace(/\.json$/, '.overrides.json')) : null
  const durableProviderConfig = db && env.playback?.enabled && env.nodeEnv !== 'test' ? createPostgresProviderConfigStore(db.prisma, env.backgroundJobs) : null
  if (durableProviderConfig && legacyProviderConfig && !providerConfigStore) {
    await durableProviderConfig.migrateLegacy(await legacyProviderConfig.getAll(), rawProviders.map((provider) => provider.adapter.id))
  }
  const resolvedProviderConfig: ProviderConfigStore | null = providerConfigStore ?? durableProviderConfig ?? legacyProviderConfig
  const providerOverrides = resolvedProviderConfig ? await resolvedProviderConfig.getAll() : {}
  const providers = rawProviders
  applyOverridesInPlace(providers, providerOverrides)
  let providerOrders: Record<ProviderKind, string[]> = { movie: [], series: [], anime: [] }
  applyOrdersInPlace(providerOrders, providers, providerOverrides)
  if (resolvedProviderConfig?.getRevision) {
    let revision = await resolvedProviderConfig.getRevision()
    const timer = setInterval(() => {
      void (async () => {
        const next = await resolvedProviderConfig.getRevision!()
        if (next === revision) return
        const overrides = await resolvedProviderConfig.getAll()
        applyOverridesInPlace(providers, overrides)
        applyOrdersInPlace(providerOrders, providers, overrides)
        revision = next
      })().catch((error) => app.log.warn({ err: error }, 'provider configuration refresh failed'))
    }, 5000)
    app.addHook('onClose', async () => clearInterval(timer))
  }

  const remotePlayback = productMode && env.internal?.playbackOrigin ? createInternalClient({ origin: env.internal.playbackOrigin, secret: env.internal.secret }) : undefined
  if (remotePlayback) for (const provider of providers) {
    provider.adapter = { ...provider.adapter, async resolve(input, signal) {
      try { return providerResultSchema.parse(await remotePlayback('/v1/internal/playback/attempt', { providerId: provider.adapter.id, ...input }, { signal, timeoutMs: 16000 })) }
      catch { return { ok: false as const, code: 'unavailable' as const, retryable: true } }
    } }
  }
  const runtime = productMode ? null : await createPlaybackRuntime({ env, animeCatalog: resolvedAnimeCatalog, providerConfigStore: resolvedProviderConfig ?? undefined, subtitleCatalog: db ? createPostgresSubtitleCatalog(db.prisma) : undefined, playback, subtitles, scheduleProbes: !env.backgroundJobs, log: fields => app.log.info(fields, 'playback operation') })
  if (runtime) { providers.splice(0, providers.length, ...runtime.providers); providerOrders = runtime.providerOrders }
  const playbackStore = runtime?.store ?? (env.playback?.stateUrl ? createValkeyPlaybackStore(env.playback.stateUrl) : createMemoryPlaybackStore())
  const resolvedPlayback = runtime?.playback
  if (resolvedPlayback) registerPlaybackRoutes(app, { playback: resolvedPlayback, origin: env.appOrigin, secure: env.nodeEnv === 'production', dev: env.nodeEnv !== 'production' })
  if (resolvedPlayback && env.playback?.resolver?.computeSecret) registerProviderComputeRoutes(app, env.playback.resolver.computeSecret)
  const releaseRelay = env.playback?.relay ? createPlaybackRelay(env.playback.relay) : undefined
  const releaseRepository = db ? createReleaseRepository(db.prisma, row => {
    const provider = providers.find(provider => provider.adapter.id === row.providerId)
    return Boolean(provider?.enabled && !isProviderRemoved(provider) && suppliesVideo(provider) && provider.deliveryMode !== 'embed'
      && provider.approvedRegions.includes(env.tmdbRegion) && row.region === env.tmdbRegion && row.revision === providerRevision(provider)
      && (provider.deliveryMode !== 'relay' || releaseRelay?.includes(provider.adapter.id)))
  }) : undefined
  const releaseService = releases ?? (releaseRepository ? createReleaseService(releaseRepository, {
    ...(remotePlayback ? { resolvePreview: async (providerId: string, ref: import('@consumit/contracts').PlaybackRef, audioLanguage: string) => z.object({ source: releaseProbeSourceSchema.nullable() }).parse(await remotePlayback('/v1/internal/playback/release-source', { providerId, ref, audioLanguage, region: env.tmdbRegion }, { timeoutMs: 20000 })).source } : {}),
    providers, orders: providerOrders, region: env.tmdbRegion, origin: env.appOrigin, store: playbackStore, relay: releaseRelay, relayOrigin: env.playback?.relay?.origin,
  }) : undefined)
  registerReleaseRoutes(app, { env, identity: resolvedIdentity, service: releaseService })
  registerExperienceRoutes(app, { env, identity: resolvedIdentity, repository: experience ?? (db ? createExperienceRepository(db.prisma) : undefined) })
  if (releaseRepository && env.releases?.enabled && env.nodeEnv !== 'test') {
    const scheduler = createReleaseScheduler(releaseRepository, createReleaseCatalog(resolvedCatalog, resolvedAnimeCatalog),
      event => app.log.info({ component: 'release-catalog', ...event }, 'episode release refresh'))
    if (!env.backgroundJobs) scheduler.start()
    closeReleaseScheduler = () => scheduler.stop()
  }
  const probeScheduler = runtime?.probeScheduler
  const subtitleService = runtime?.subtitles ?? createSubtitleService({ providers: [], animeTitle: async id => ({ title: (await animeService.title(id)).titles.preferred }), store: playbackStore, origin: env.appOrigin })
  registerAdminRoutes(app, { env, identity: resolvedIdentity, repository, providers, scoutCatalog: env.playback?.enabled ? createScoutCatalog(providerOptions) : undefined, scoutRecipes, providerOrders, playbackStore, playback: resolvedPlayback, subtitles: subtitleService, providerConfig: resolvedProviderConfig ?? undefined, probeStatus: probeScheduler ? () => probeScheduler.status() : undefined, ...(remotePlayback ? { diagnostics: remotePlayback } : {}) })
  registerSubtitleRoutes(app, {
    subtitles: subtitleService,
    ...(productMode ? { mode: 'preferences' as const } : {}),
    env,
    identity: resolvedIdentity,
    ...(subtitlePreferences ? { preferences: subtitlePreferences } : db ? { preferences: createPostgresSubtitlePreferences(db.prisma) } : {}),
  })
  app.addHook('onClose', async () => { if (runtime) await runtime.close(); else await playbackStore.close() })


  const canonicalMetadata = createResolverMetadata({
    ...(env.tmdbToken ? { tmdb: createTmdbMetadataResolver(env.tmdbToken), identity: createTmdbIdentityResolver(env.tmdbToken) } : {}),
    animeTitle: createAnimeTitleResolver(resolvedAnimeCatalog), animeTitles: createAnimeTitleVariantsResolver(resolvedAnimeCatalog), animeMeta: createAnimeMetaResolver(resolvedAnimeCatalog),
  })
  registerProductInternal(app, { env, config: resolvedProviderConfig ?? undefined, anime: resolvedAnimeCatalog, metadata: canonicalMetadata,
    tmdb: env.tmdbToken ? createTmdbMetadataResolver(env.tmdbToken) : undefined, subtitles: db ? createPostgresSubtitleCatalog(db.prisma) : undefined,
    releaseRefresh: async () => { if (releaseRepository && env.releases?.enabled) await createReleaseScheduler(releaseRepository, createReleaseCatalog(resolvedCatalog, resolvedAnimeCatalog), event => app.log.info(event, 'release refresh')).runOnce() },
    catalogCleanup: async () => { await catalogCacheStore?.deleteExpired(new Date()) },
  })

  return app
}
