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
import { unavailableMemberData } from './member-data/unavailable-member-data.ts'
import { createPlayback, type Playback } from './playback/playback.ts'
import { createPlaybackRelay } from './playback/relay.ts'
import { registerPlaybackRoutes } from './playback/routes.ts'
import { createMemoryPlaybackStore, createValkeyPlaybackStore } from './playback/state.ts'
import { loadConfiguredProviders } from './playback/configured-providers.ts'
import { createAnimeService } from './anime/anime-service.ts'
import type { KitsuCatalog } from './catalog/kitsu/kitsu.ts'
import { createAnimeMetaResolver, createAnimeTitleResolver, createAnimeTitleVariantsResolver } from './anime/title-resolver.ts'
import { createProbeScheduler } from './playback/probe.ts'
import { registerAnimeRoutes } from './anime/routes.ts'
import { createKitsuCatalog } from './catalog/kitsu/adapter.ts'
import { createTmdbEpisodeArt, type TmdbEpisodeArtResolver } from './anime/tmdb-episode-art.ts'
import { createAnizipEpisodeArt, type CanonicalEpisodeArt } from './anime/anizip-episode-art.ts'
import { createCastleSubsProvider } from './subtitles/castlesubs.ts'
import { createAnimeToshoProvider } from './subtitles/animetosho.ts'
import { createAnizipClient } from './subtitles/anizip.ts'
import { createSubtitleHttp } from './subtitles/http.ts'
import { createJimakuProvider } from './subtitles/jimaku.ts'
import { createNatsukiProvider } from './subtitles/natsuki.ts'
import { createNxshaSubsProvider } from './subtitles/nxshasubs.ts'
import { createPostgresSubtitleCatalog } from './subtitles/postgres-catalog.ts'
import { createPostgresSubtitlePreferences } from './subtitles/postgres-preferences.ts'
import type { SubtitlePreferences } from './subtitles/preferences.ts'
import { createRiveSubsProvider } from './subtitles/rivesubs.ts'
import { createOpenSubtitlesProvider } from './subtitles/opensubtitles.ts'
import { createSubDlProvider } from './subtitles/subdl.ts'
import { createSubSourceProvider } from './subtitles/subsource.ts'
import { createDiskFileStore } from './subtitles/storage.ts'
import { createSubtitleService, type SubtitleService } from './subtitles/subtitles.ts'
import { registerSubtitleRoutes } from './subtitles/routes.ts'
import { createTvSubtitlesProvider } from './subtitles/tvsubtitles.ts'
import { createVdrkProvider } from './subtitles/vdrk.ts'
import { createVdrkV2Provider } from './subtitles/vdrkv2.ts'
import { createYifyProvider } from './subtitles/yify.ts'
import { createTmdbMetadataResolver } from './playback/tmdb-metadata.ts'
import { registerAdminRoutes } from './admin/routes.ts'
import { createScoutCatalog, scoutRecipes } from './admin/scout-catalog.ts'
import { applyOrdersInPlace, createProviderConfigStore, type ProviderConfigStore, type ProviderKind } from './admin/provider-config.ts'
import { createPostgresProviderConfigStore } from './admin/postgres-provider-config.ts'
import { applyOverridesInPlace } from './admin/provider-config.ts'
import { registerWebVitalsRoutes } from './telemetry/web-vitals-routes.ts'

type BuildAppOptions = {
  playback?: Playback
  catalog?: Catalog
  animeCatalog?: AnimeCatalog
  animeEpisodeArt?: KitsuCatalog
  animeTmdbEpisodeArt?: TmdbEpisodeArtResolver
  animeCanonicalEpisodeArt?: CanonicalEpisodeArt
  env?: ApiEnv
  identity?: Identity
  memberData?: MemberData
  providerConfigStore?: ProviderConfigStore
  repository?: IdentityRepository
  subtitles?: SubtitleService
  subtitlePreferences?: SubtitlePreferences
}

export async function buildApp({ catalog = unavailableCatalogAdapter, animeCatalog, animeEpisodeArt, animeTmdbEpisodeArt, animeCanonicalEpisodeArt, env = loadEnv(), identity, memberData, providerConfigStore, repository: overrideRepository, playback, subtitles, subtitlePreferences }: BuildAppOptions = {}) {
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
  const catalogCache = new StaleCache(Date.now, catalogCacheStore, (error) => {
    app.log.warn({ err: error }, 'catalog cache persistence failed')
  })
  if (catalogCacheStore && env.nodeEnv !== 'test') {
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
  if (!memberData && db) resolvedMemberData = createPostgresMemberData(db.prisma)

  app.addHook('onClose', async () => {
    await closeIdentityResources?.()
    if (db && !closeIdentityResources) await db.close()
  })
  registerHealthRoutes(app, {
    catalogConfigured: resolvedCatalog !== unavailableCatalogAdapter,
    identityConfigured: resolvedIdentity !== unavailableIdentity,
    probes: {
      ...(db ? { database: () => db.prisma.$queryRaw`SELECT 1` } : {}),
      ...(requestLimits ? { rateLimits: () => requestLimits.ping() } : {}),
    },
  })
  registerWebVitalsRoutes(app)
  registerIdentityRoutes(app, { env, identity: resolvedIdentity })
  const repository = overrideRepository ?? (identity === undefined && db ? createPostgresIdentityRepository(db.prisma) : undefined)
  registerMemberDataRoutes(app, { env, identity: resolvedIdentity, memberData: resolvedMemberData })
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
  registerAnimeRoutes(app, { anime: animeService })
  const playbackStore = env.playback?.enabled && env.playback.stateUrl ? createValkeyPlaybackStore(env.playback.stateUrl) : createMemoryPlaybackStore()
  const providerOptions = {
    tmdbToken: env.tmdbToken,
    animeTitleResolver: createAnimeTitleResolver(resolvedAnimeCatalog),
    animeTitleVariantsResolver: createAnimeTitleVariantsResolver(resolvedAnimeCatalog),
    animeMetaResolver: createAnimeMetaResolver(resolvedAnimeCatalog),
  }
  const rawProviders = env.playback?.enabled ? await loadConfiguredProviders(env.playback.mediaConfig, providerOptions) : []
  const legacyProviderConfig = env.playback?.mediaConfig ? createProviderConfigStore(env.playback.mediaConfig.replace(/\.json$/, '.overrides.json')) : null
  const durableProviderConfig = db && env.playback?.enabled && env.nodeEnv !== 'test' ? createPostgresProviderConfigStore(db.prisma) : null
  if (durableProviderConfig && legacyProviderConfig && !providerConfigStore) {
    await durableProviderConfig.migrateLegacy(await legacyProviderConfig.getAll(), rawProviders.map((provider) => provider.adapter.id))
  }
  const resolvedProviderConfig: ProviderConfigStore | null = providerConfigStore ?? durableProviderConfig ?? legacyProviderConfig
  const providerOverrides = resolvedProviderConfig ? await resolvedProviderConfig.getAll() : {}
  const providers = rawProviders
  applyOverridesInPlace(providers, providerOverrides)
  const providerOrders: Record<ProviderKind, string[]> = { movie: [], series: [], anime: [] }
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
  const resolvedPlayback = playback ?? createPlayback({ providers, store: playbackStore, region: env.tmdbRegion, providerOrders, audioOrigin: env.appOrigin,
    ...(env.playback?.relay ? { relay: createPlaybackRelay(env.playback.relay), relayOrigin: env.appOrigin } : {}) })
  registerPlaybackRoutes(app, { playback: resolvedPlayback, origin: env.appOrigin, secure: env.nodeEnv === 'production', dev: env.nodeEnv !== 'production' })
  // Synthetic probes run in-process on a stagger (off in tests and when the
  // interval is zero). Past one instance every host probes; the reads are
  // idempotent and the 30-minute cadence makes duplication negligible.
  const probeScheduler = env.playback?.enabled && env.nodeEnv !== 'test' && env.playback.probeIntervalMs > 0
    ? createProbeScheduler({
      providers, region: env.tmdbRegion, intervalMs: env.playback.probeIntervalMs, store: playbackStore,
      log: (fields) => app.log.info({ component: 'provider-probe', ...fields }, 'provider probe finished'),
    })
    : null
  probeScheduler?.start()
  app.addHook('onClose', async () => probeScheduler?.stop())
  // Aggregated captions: thirteen subtitle providers plus the streaming
  // adapters' own tracks downstream. Converted VTT files are cached in the
  // playback store (Valkey when configured, memory otherwise) and served
  // first-party — the approved exception to browser-direct delivery.
  // AnimeTosho answers anime queries by AniList id; the ani.zip bridge maps
  // canonical anime episodes to TMDB identity so the TMDB-keyed fleet
  // (VDRK, VDRK v2, RiveSubs, Natsuki, NxshaSubs, plus SubDL/OpenSubtitles
  // when keyed) answers them too. CastleSubs and SubSource answer anime by
  // title on the TV path; TVSubtitles already did.
  const subtitleService = subtitles ?? createSubtitleService({
    providers: [
      createYifyProvider(createSubtitleHttp(['yifysubtitles.ch'])),
      createTvSubtitlesProvider(createSubtitleHttp(['www.tvsubtitles.net'])),
      createAnimeToshoProvider(createSubtitleHttp(['api.ani.zip', 'feed.animetosho.xyz', 'feed.animetosho.net'])),
      createSubSourceProvider(createSubtitleHttp(['subsource.net'])),
      createCastleSubsProvider(createSubtitleHttp(['api.hlowb.com'])),
      createNxshaSubsProvider(createSubtitleHttp(['nxsha.space'])),
      createVdrkProvider(createSubtitleHttp(['sub.vdrk.site'])),
      createVdrkV2Provider(createSubtitleHttp(['sub.vdrk.site'])),
      createRiveSubsProvider(createSubtitleHttp(['scrapper.rivestream.app'])),
      createNatsukiProvider(createSubtitleHttp(['natsuki.hls.lol'])),
      // Key-gated providers decline without credentials (no keys set).
      createSubDlProvider(createSubtitleHttp(['api.subdl.com']), env.subtitleKeys.subdl),
      createJimakuProvider(createSubtitleHttp(['jimaku.cc']), env.subtitleKeys.jimaku),
      createOpenSubtitlesProvider(createSubtitleHttp(['api.opensubtitles.com']), env.subtitleKeys.openSubtitles),
    ],
    metadata: env.tmdbToken?.trim() ? createTmdbMetadataResolver(env.tmdbToken) : undefined,
    animeTitle: async (id) => {
      const detail = await animeService.title(id)
      return { title: detail.titles.preferred }
    },
    animeMapping: async (anilistId, episode, signal) => {
      const mapped = await anizip.episodeFor(anilistId, episode, signal)
      if (!mapped?.tmdbId) return null
      return { tmdbId: mapped.tmdbId, season: mapped.season }
    },
    store: playbackStore,
    origin: env.appOrigin,
    ...(env.subtitlesDir ? { files: createDiskFileStore(env.subtitlesDir, playbackStore) } : {}),
    ...(db ? { catalog: createPostgresSubtitleCatalog(db.prisma) } : {}),
    requirements: {
      ...(!env.subtitleKeys.subdl ? { subdl: 'SUBDL_API_KEY' } : {}),
      ...(!env.subtitleKeys.jimaku ? { jimaku: 'JIMAKU_API_KEY' } : {}),
      ...(!env.subtitleKeys.openSubtitles ? { opensubtitles: 'OpenSubtitles API key and account credentials' } : {}),
    },
  })
  registerAdminRoutes(app, { env, identity: resolvedIdentity, repository, providers, scoutCatalog: env.playback?.enabled ? createScoutCatalog(providerOptions) : undefined, scoutRecipes, providerOrders, playbackStore, playback: resolvedPlayback, subtitles: subtitleService, providerConfig: resolvedProviderConfig ?? undefined, probeStatus: probeScheduler ? () => probeScheduler.status() : undefined })
  registerSubtitleRoutes(app, {
    subtitles: subtitleService,
    env,
    identity: resolvedIdentity,
    ...(subtitlePreferences ? { preferences: subtitlePreferences } : db ? { preferences: createPostgresSubtitlePreferences(db.prisma) } : {}),
  })
  app.addHook('onClose', async () => playbackStore.close())

  return app
}
