import { type AnimeCatalog } from '../../api/src/catalog/anilist/adapter.ts'
import { type ApiEnv } from '../../api/src/config/env.ts'
import { createPlayback, type Playback } from '../../api/src/playback/playback.ts'
import { createPlaybackRelay } from '../../api/src/playback/relay.ts'
import { createMemoryPlaybackStore, createValkeyPlaybackStore } from '../../api/src/playback/state.ts'
import { loadConfiguredProviders } from '../../api/src/playback/configured-providers.ts'
import { createAnimeMetaResolver, createAnimeTitleResolver, createAnimeTitleVariantsResolver } from '../../api/src/anime/title-resolver.ts'
import { createProbeScheduler } from '../../api/src/playback/probe.ts'
import { createCastleSubsProvider } from '../../api/src/subtitles/castlesubs.ts'
import { createAnimeToshoProvider } from '../../api/src/subtitles/animetosho.ts'
import { createAnizipClient } from '../../api/src/subtitles/anizip.ts'
import { createSubtitleHttp } from '../../api/src/subtitles/http.ts'
import { createJimakuProvider } from '../../api/src/subtitles/jimaku.ts'
import { createNatsukiProvider } from '../../api/src/subtitles/natsuki.ts'
import { createNxshaSubsProvider } from '../../api/src/subtitles/nxshasubs.ts'
import { createRiveSubsProvider } from '../../api/src/subtitles/rivesubs.ts'
import { createOpenSubtitlesProvider } from '../../api/src/subtitles/opensubtitles.ts'
import { createSubDlProvider } from '../../api/src/subtitles/subdl.ts'
import { createSubSourceProvider } from '../../api/src/subtitles/subsource.ts'
import { createDiskFileStore } from '../../api/src/subtitles/storage.ts'
import { createSubtitleService, type SubtitleService } from '../../api/src/subtitles/subtitles.ts'
import { createStreamingSubtitleProviders } from '../../api/src/subtitles/streaming.ts'
import { createTvSubtitlesProvider } from '../../api/src/subtitles/tvsubtitles.ts'
import { createVdrkProvider } from '../../api/src/subtitles/vdrk.ts'
import { createVdrkV2Provider } from '../../api/src/subtitles/vdrkv2.ts'
import { createYifyProvider } from '../../api/src/subtitles/yify.ts'
import { createTmdbMetadataResolver } from '../../api/src/playback/tmdb-metadata.ts'
import { createTmdbIdentityResolver } from '../../api/src/playback/tmdb-identity.ts'
import { createCloudflareResolverAdapter, createResolverMetadata } from '../../api/src/playback/cloudflare-resolver.ts'
import { applyOrdersInPlace, type ProviderConfigStore, type ProviderKind } from '../../api/src/admin/provider-config.ts'
import { applyOverridesInPlace } from '../../api/src/admin/provider-config.ts'
import type { SubtitleCatalog } from '../../api/src/subtitles/catalog.ts'
import type { SubtitleFileStore } from '../../api/src/subtitles/storage.ts'
import type { CloudflareResolverOptions } from '../../api/src/playback/cloudflare-resolver.ts'
import type { TitleMetadataResolver } from '../../api/src/playback/tmdb-metadata.ts'

type RuntimeOptions = { configurationSnapshot?: (() => Promise<import('@consumit/contracts/internal').ProviderState>) | undefined; env: ApiEnv; animeCatalog: Pick<AnimeCatalog, 'title'>; providerConfigStore?: ProviderConfigStore | undefined; subtitleCatalog?: SubtitleCatalog | undefined; files?: SubtitleFileStore | undefined; providerOptions?: Parameters<typeof loadConfiguredProviders>[1] | undefined; metadata?: CloudflareResolverOptions['metadata'] | undefined; titleMetadata?: TitleMetadataResolver; playback?: Playback | undefined; subtitles?: SubtitleService | undefined; scheduleProbes?: boolean | undefined; log?: ((fields: Record<string, unknown>) => void) | undefined }
export async function createPlaybackRuntime({ configurationSnapshot, env, animeCatalog: resolvedAnimeCatalog, providerConfigStore, subtitleCatalog, files, providerOptions: suppliedProviderOptions, metadata: suppliedMetadata, titleMetadata, playback, subtitles, scheduleProbes = false, log = () => {} }: RuntimeOptions) {
  const app = { log: { warn: (fields: Record<string, unknown>, message?: string) => log({ ...fields, message }), info: (fields: Record<string, unknown>, message?: string) => log({ ...fields, message }) }, addHook: (name: string, close: () => Promise<void>) => { if (name === 'onClose') closes.push(close) } }
  const closes: (() => Promise<void>)[] = []
  const playbackStore = env.playback?.enabled && env.playback.stateUrl ? createValkeyPlaybackStore(env.playback.stateUrl) : createMemoryPlaybackStore()
  const anizip = createAnizipClient(createSubtitleHttp(['api.ani.zip']))
  const providerOptions = suppliedProviderOptions ?? {
    tmdbToken: env.tmdbToken,
    ...(env.playback?.relay?.discovery?.['lookmovie-relay'] === 'lookmovie-v1' ? { lookmovieWorker: { origin: env.playback.relay.origin, secret: env.playback.relay.secret } } : {}),
    animeTitleResolver: createAnimeTitleResolver(resolvedAnimeCatalog),
    animeTitleVariantsResolver: createAnimeTitleVariantsResolver(resolvedAnimeCatalog),
    animeMetaResolver: createAnimeMetaResolver(resolvedAnimeCatalog),
  }
  const rawProviders = env.playback?.enabled ? await loadConfiguredProviders(env.playback.mediaConfig, providerOptions) : []
  const resolvedProviderConfig = providerConfigStore
  const initialSnapshot = await configurationSnapshot?.()
  const providerOverrides = initialSnapshot?.overrides ?? (resolvedProviderConfig ? await resolvedProviderConfig.getAll() : {})
  const providers = rawProviders
  applyOverridesInPlace(providers, providerOverrides)
  const providerOrders: Record<ProviderKind, string[]> = { movie: [], series: [], anime: [] }
  applyOrdersInPlace(providerOrders, providers, providerOverrides)
  let revision = initialSnapshot?.revision ?? await resolvedProviderConfig?.getRevision?.() ?? 0
  let configurationAt = Date.now(), configurationPending: Promise<void> | undefined
  const refreshConfiguration = () => {
    configurationPending ??= (async () => {
      const snapshot = await configurationSnapshot?.()
      const next = snapshot?.revision ?? await resolvedProviderConfig?.getRevision?.() ?? revision
      if (next !== revision && resolvedProviderConfig) {
        const overrides = snapshot?.overrides ?? await resolvedProviderConfig.getAll()
        applyOverridesInPlace(providers, overrides); applyOrdersInPlace(providerOrders, providers, overrides)
        revision = next
      }
      configurationAt = Date.now()
    })().finally(() => { configurationPending = undefined })
    return configurationPending
  }
  if (resolvedProviderConfig?.getRevision) {
    const timer = setInterval(() => { void refreshConfiguration().catch(() => app.log.warn({ component: 'provider-config' }, 'provider configuration refresh failed')) }, 5000)
    timer.unref()
    app.addHook('onClose', async () => clearInterval(timer))
  }
  if (env.playback?.resolver) {
    const metadata = suppliedMetadata ?? createResolverMetadata({
      ...(env.tmdbToken ? { tmdb: createTmdbMetadataResolver(env.tmdbToken) } : {}),
      ...(env.tmdbToken ? { identity: createTmdbIdentityResolver(env.tmdbToken) } : {}),
      animeTitle: createAnimeTitleResolver(resolvedAnimeCatalog),
      animeTitles: createAnimeTitleVariantsResolver(resolvedAnimeCatalog),
      animeMeta: createAnimeMetaResolver(resolvedAnimeCatalog),
    })
    for (const provider of providers) {
      if (!provider.workerConfig) continue
      provider.adapter = createCloudflareResolverAdapter(provider, {
        config: env.playback.resolver,
        currentConfig: current => ({
          ...current.workerConfig,
          id: current.adapter.id,
          enabled: current.enabled,
          regions: [...current.approvedRegions],
          mediaHosts: [...current.mediaHosts],
          mediaHostPatterns: (current.mediaHostPatterns ?? []).map(pattern => pattern.source),
          deliveryMode: current.deliveryMode ?? 'direct',
          ...(current.relayHostDiscovery ? { relayHostDiscovery: current.relayHostDiscovery } : {}),
        }),
        metadata,
      })
    }
  }
  const resolvedPlayback = playback ?? createPlayback({ providers, store: playbackStore, region: env.tmdbRegion, providerOrders, audioOrigin: env.appOrigin,
    ...(env.playback?.relay ? { relay: createPlaybackRelay(env.playback.relay), relayOrigin: env.appOrigin } : {}) })
  const probeScheduler = env.playback?.enabled && env.nodeEnv !== 'test' && env.playback.probeIntervalMs > 0
    ? createProbeScheduler({
      providers, region: env.tmdbRegion, intervalMs: env.playback.probeIntervalMs, store: playbackStore,
      log: (fields) => app.log.info({ component: 'provider-probe', ...fields }, 'provider probe finished'),
    })
    : null
  if (scheduleProbes) probeScheduler?.start()

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
      ...createStreamingSubtitleProviders(providers, env.tmdbRegion, playbackStore),
    ],
    metadata: titleMetadata ?? (env.tmdbToken?.trim() ? createTmdbMetadataResolver(env.tmdbToken) : undefined),
    animeTitle: async (id) => {
      const detail = await resolvedAnimeCatalog.title(id)
      return { title: detail.titles.preferred }
    },
    animeMapping: async (anilistId, episode, signal) => {
      const mapped = await anizip.episodeFor(anilistId, episode, signal)
      if (!mapped?.tmdbId) return null
      return { tmdbId: mapped.tmdbId, season: mapped.season }
    },
    store: playbackStore,
    origin: env.appOrigin,
    ...(files ? { files } : env.subtitlesDir ? { files: createDiskFileStore(env.subtitlesDir, playbackStore) } : {}),
    ...(subtitleCatalog ? { catalog: subtitleCatalog } : {}),
    requirements: {
      ...(!env.subtitleKeys.subdl ? { subdl: 'SUBDL_API_KEY' } : {}),
      ...(!env.subtitleKeys.jimaku ? { jimaku: 'JIMAKU_API_KEY' } : {}),
      ...(!env.subtitleKeys.openSubtitles ? { opensubtitles: 'OpenSubtitles API key and account credentials' } : {}),
    },
  })

  return { playback: resolvedPlayback, subtitles: subtitleService, providers, providerOrders, providerOptions, store: playbackStore, probeScheduler, refreshConfiguration, configurationCurrent: () => Date.now() - configurationAt <= 10000, async close() { probeScheduler?.stop(); for (const close of closes) await close(); await playbackStore.close() } }
}

