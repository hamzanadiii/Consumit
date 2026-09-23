import cookie from '@fastify/cookie'
import helmet from '@fastify/helmet'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import Fastify from 'fastify'
import type { Catalog } from './catalog/catalog.ts'
import { registerCatalogRoutes } from './catalog/routes.ts'
import { unavailableCatalogAdapter } from './catalog/unavailable-catalog.ts'
import { createAnilistCatalog, type AnimeCatalog } from './catalog/anilist/adapter.ts'
import { loadEnv, type ApiEnv } from './config/env.ts'
import { createDbClient } from './db/client.ts'
import { rateLimitExceeded, registerErrorHandlers } from './http/errors.ts'
import { rateLimitKey } from './http/rate-limit.ts'
import { registerHealthRoutes } from './http/health.ts'
import { generateRequestId, loggerOptions, registerRequestContext } from './http/request-context.ts'
import { createIdentity } from './identity/service.ts'
import { registerIdentityRoutes } from './identity/routes.ts'
import { unavailableIdentity } from './identity/unavailable-identity.ts'
import type { Identity } from './identity/identity.ts'
import { createPostgresIdentityRepository } from './identity/postgres-repository.ts'
import type { IdentityRepository } from './identity/repository.ts'
import { createResendNotifier } from './identity/resend-notifier.ts'
import { createValkeyAuthState } from './identity/valkey-auth-state.ts'
import { createLetterboxdImporter, type LetterboxdImporter } from './imports/letterboxd/importer.ts'
import { createPostgresLetterboxdImportRepository } from './imports/letterboxd/postgres-repository.ts'
import { registerLetterboxdImportRoutes } from './imports/letterboxd/routes.ts'
import { unavailableLetterboxdImporter } from './imports/letterboxd/unavailable-importer.ts'
import type { MemberData } from './member-data/member-data.ts'
import { createPostgresMemberData } from './member-data/postgres-member-data.ts'
import { registerMemberDataRoutes } from './member-data/routes.ts'
import { unavailableMemberData } from './member-data/unavailable-member-data.ts'
import { createPlayback, type Playback } from './playback/playback.ts'
import { registerPlaybackRoutes } from './playback/routes.ts'
import { registerEmbedRoutes } from './playback/embed-routes.ts'
import { createMemoryPlaybackStore, createValkeyPlaybackStore } from './playback/state.ts'
import { loadConfiguredProviders } from './playback/configured-providers.ts'
import { createAnimeService } from './anime/anime-service.ts'
import type { KitsuCatalog } from './catalog/kitsu/kitsu.ts'
import { createAnimeMetaResolver, createAnimeTitleResolver } from './anime/title-resolver.ts'
import { createProbeScheduler } from './playback/probe.ts'
import { registerAnimeRoutes } from './anime/routes.ts'
import { createKitsuCatalog } from './catalog/kitsu/adapter.ts'
import { createTmdbEpisodeArt, type TmdbEpisodeArtResolver } from './anime/tmdb-episode-art.ts'
import { createCastleSubsProvider } from './subtitles/castlesubs.ts'
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
import { registerAdminRoutes, type DomainWhitelistStore } from './admin/routes.ts'
import { createPostgresDomainWhitelistStore } from './admin/postgres-domains.ts'
import { createProviderConfigStore, type ProviderConfigStore } from './admin/provider-config.ts'
import { applyProviderOverrides } from './playback/configured-providers.ts'
import { applyOverridesInPlace } from './admin/provider-config.ts'

type BuildAppOptions = {
  playback?: Playback
  catalog?: Catalog
  animeCatalog?: AnimeCatalog
  animeEpisodeArt?: KitsuCatalog
  animeTmdbEpisodeArt?: TmdbEpisodeArtResolver
  domains?: DomainWhitelistStore
  env?: ApiEnv
  identity?: Identity
  letterboxdImporter?: LetterboxdImporter
  memberData?: MemberData
  providerConfigStore?: ProviderConfigStore
  repository?: IdentityRepository
  subtitles?: SubtitleService
  subtitlePreferences?: SubtitlePreferences
}

export async function buildApp({ catalog = unavailableCatalogAdapter, animeCatalog, animeEpisodeArt, animeTmdbEpisodeArt, domains: overrideDomains, env = loadEnv(), identity, letterboxdImporter, memberData, providerConfigStore, repository: overrideRepository, playback, subtitles, subtitlePreferences }: BuildAppOptions = {}) {
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
  await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024, files: 1, parts: 2 } })
  await app.register(rateLimit, {
    errorResponseBuilder: () => rateLimitExceeded(),
    // Per-member buckets: server-rendered traffic shares the web
    // container's IP, so IP-only keys collapse every member into one
    // bucket and normal browsing returns 429s. See rateLimitKey.
    keyGenerator: (request) => rateLimitKey(request),
    max: 100,
    timeWindow: '1 minute',
  })

  registerErrorHandlers(app)
  registerRequestContext(app)

  let closeIdentityResources: (() => Promise<void>) | undefined
  let resolvedIdentity = identity ?? unavailableIdentity
  let resolvedImporter = letterboxdImporter ?? unavailableLetterboxdImporter
  let resolvedMemberData = memberData ?? unavailableMemberData
  const needsDatabase = env.databaseUrl && (!identity || !letterboxdImporter || !memberData)
  const db = needsDatabase ? createDbClient(env.databaseUrl!, {
      ...(env.databaseSslCa ? { sslCa: env.databaseSslCa } : {}),
      sslMode: env.databaseSslMode,
    }) : null
  if (!identity && db && env.valkeyUrl && env.authCodePepper && env.resendApiKey && env.authEmailFrom) {
    const state = createValkeyAuthState(env.valkeyUrl, env.authCodePepper)
    resolvedIdentity = createIdentity({
      notifier: createResendNotifier({ apiKey: env.resendApiKey, from: env.authEmailFrom }),
      onNotificationError: (error) => app.log.error({ err: error }, 'authentication email was not delivered'),
      repository: createPostgresIdentityRepository(db.prisma),
      state,
    })
    closeIdentityResources = async () => {
      await Promise.allSettled([state.close(), db.close()])
    }
  }
  if (!letterboxdImporter && db) {
    resolvedImporter = createLetterboxdImporter({ catalog, repository: createPostgresLetterboxdImportRepository(db.prisma) })
    closeIdentityResources ??= async () => db.close()
  }
  if (!memberData && db) resolvedMemberData = createPostgresMemberData(db.prisma)

  app.addHook('onClose', async () => closeIdentityResources?.())
  registerHealthRoutes(app, {
    catalogConfigured: catalog !== unavailableCatalogAdapter,
    identityConfigured: resolvedIdentity !== unavailableIdentity,
  })
  registerIdentityRoutes(app, { env, identity: resolvedIdentity })
  const resolvedDomains = overrideDomains ?? (db ? createPostgresDomainWhitelistStore(db.prisma) : undefined)
  const repository = overrideRepository ?? (identity === undefined && db ? createPostgresIdentityRepository(db.prisma) : undefined)
  registerLetterboxdImportRoutes(app, { env, identity: resolvedIdentity, importer: resolvedImporter })
  registerMemberDataRoutes(app, { env, identity: resolvedIdentity, memberData: resolvedMemberData })
  registerCatalogRoutes(app, catalog)
  const resolvedAnimeCatalog = animeCatalog ?? createAnilistCatalog()
  const animeService = createAnimeService(resolvedAnimeCatalog, {
    episodeArt: animeEpisodeArt ?? createKitsuCatalog(),
    ...(animeTmdbEpisodeArt ? { tmdbEpisodeArt: animeTmdbEpisodeArt } : catalog !== unavailableCatalogAdapter ? { tmdbEpisodeArt: createTmdbEpisodeArt(catalog) } : {}),
  })
  registerAnimeRoutes(app, { anime: animeService })
  const playbackStore = env.playback?.enabled && env.playback.stateUrl ? createValkeyPlaybackStore(env.playback.stateUrl) : createMemoryPlaybackStore()
  const resolvedProviderConfig = providerConfigStore ?? (env.playback?.mediaConfig ? createProviderConfigStore(env.playback.mediaConfig.replace(/\.json$/, '.overrides.json')) : null)
  const rawProviders = env.playback?.enabled ? await loadConfiguredProviders(env.playback.mediaConfig, { tmdbToken: env.tmdbToken, animeTitleResolver: createAnimeTitleResolver(resolvedAnimeCatalog), animeMetaResolver: createAnimeMetaResolver(resolvedAnimeCatalog) }) : []
  const providerOverrides = resolvedProviderConfig ? await resolvedProviderConfig.getAll() : {}
  const providers = applyProviderOverrides(rawProviders, providerOverrides)
  const resolvedPlayback = playback ?? createPlayback({ providers, store: playbackStore, region: env.tmdbRegion, workerUrl: env.workerUrl, hmacSecret: env.embedHmacSecret })
  registerPlaybackRoutes(app, { playback: resolvedPlayback, origin: env.appOrigin, secure: env.nodeEnv === 'production', dev: env.nodeEnv !== 'production' })
  registerEmbedRoutes(app, { playback: resolvedPlayback, workerUrl: env.workerUrl, hmacSecret: env.embedHmacSecret, allowedDomains: env.embedAllowedDomains, origin: env.appOrigin, dev: env.nodeEnv !== 'production' })
  // Synthetic probes run in-process on a stagger (off in tests and when the
  // interval is zero). Past one instance every host probes; the reads are
  // idempotent and the 30-minute cadence makes duplication negligible.
  const probeScheduler = env.playback?.enabled && env.nodeEnv !== 'test' && env.playback.probeIntervalMs > 0
    ? createProbeScheduler({
      providers, region: env.tmdbRegion, intervalMs: env.playback.probeIntervalMs,
      log: (fields) => app.log.info({ component: 'provider-probe', ...fields }, 'provider probe finished'),
    })
    : null
  probeScheduler?.start()
  app.addHook('onClose', async () => probeScheduler?.stop())
  registerAdminRoutes(app, { env, identity: resolvedIdentity, domains: resolvedDomains, repository, providers, playback: resolvedPlayback, playbackStore, providerConfig: resolvedProviderConfig ?? undefined, probeStatus: probeScheduler ? () => probeScheduler.status() : undefined })
  // Aggregated captions: five subtitle providers plus the streaming
  // adapters' own tracks downstream. Converted VTT files are cached in the
  // playback store (Valkey when configured, memory otherwise) and served
  // first-party — the approved exception to browser-direct delivery.
  const subtitleService = subtitles ?? createSubtitleService({
    providers: [
      createYifyProvider(createSubtitleHttp(['yifysubtitles.ch'])),
      createTvSubtitlesProvider(createSubtitleHttp(['www.tvsubtitles.net'])),
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
    store: playbackStore,
    origin: env.appOrigin,
    ...(env.subtitlesDir ? { files: createDiskFileStore(env.subtitlesDir, playbackStore) } : {}),
    ...(db ? { catalog: createPostgresSubtitleCatalog(db.prisma) } : {}),
  })
  registerSubtitleRoutes(app, {
    subtitles: subtitleService,
    env,
    identity: resolvedIdentity,
    ...(subtitlePreferences ? { preferences: subtitlePreferences } : db ? { preferences: createPostgresSubtitlePreferences(db.prisma) } : {}),
  })
  app.addHook('onClose', async () => playbackStore.close())

  return app
}
