import { createProviderRouteRegistry } from '../../api/src/playback/route-registry.ts'
import { createSubtitleProviders } from '../../api/src/subtitles/providers.ts'
import { type AnimeCatalog } from '../../api/src/catalog/anilist/adapter.ts'
import { type ApiEnv } from '../../api/src/config/env.ts'
import { createPlayback, type Playback } from '../../api/src/playback/playback.ts'
import { createPlaybackRelay } from '../../api/src/playback/relay.ts'
import { createMemoryPlaybackStore, createValkeyPlaybackStore } from '../../api/src/playback/state.ts'
import { loadConfiguredProviders } from '../../api/src/playback/configured-providers.ts'
import { createAnimeMetaResolver, createAnimeTitleResolver, createAnimeTitleVariantsResolver } from '../../api/src/anime/title-resolver.ts'
import { createProbeScheduler } from '../../api/src/playback/probe.ts'
import { createAnizipClient } from '../../api/src/subtitles/anizip.ts'
import { createSubtitleHttp } from '../../api/src/subtitles/http.ts'
import { createDiskFileStore } from '../../api/src/subtitles/storage.ts'
import { createSubtitleService, type SubtitleService } from '../../api/src/subtitles/subtitles.ts'
import { createStreamingSubtitleProviders } from '../../api/src/subtitles/streaming.ts'
import type { TmdbEpisodeCoordinates } from '../../api/src/subtitles/tmdb-episode.ts'
import { createTmdbMetadataResolver } from '../../api/src/playback/tmdb-metadata.ts'
import { createTmdbIdentityResolver } from '../../api/src/playback/tmdb-identity.ts'
import { createCloudflareResolverAdapter, createResolverMetadata } from '../../api/src/playback/cloudflare-resolver.ts'
import { applyOrdersInPlace, type ProviderConfigStore, type ProviderKind } from '../../api/src/admin/provider-config.ts'
import { applyOverridesInPlace } from '../../api/src/admin/provider-config.ts'
import type { SubtitleCatalog } from '../../api/src/subtitles/catalog.ts'
import type { SubtitleFileStore } from '../../api/src/subtitles/storage.ts'
import type { CloudflareResolverOptions } from '../../api/src/playback/cloudflare-resolver.ts'
import type { TitleMetadataResolver } from '../../api/src/playback/tmdb-metadata.ts'

// These upstreams reject or stall Cloudflare Resolver egress in production,
// even though their same adapters and exact configured host scopes can resolve
// from the playback service's DNS-pinned transport. Keep the alternate route
// provider-scoped; do not weaken source or media-host validation. The set is
// not anime-specific — it is the native-lookup exception list.
const localResolverProviders = new Set(['kyren', 'recloud', '9anime', 'aniwave', 'miruro', 'allanime', 'kototv', 'yumezone', 'zenbu', 'fireanime', 'cinecat', 'vidapi', 'fmfau', 'vidbolt', 'nontonflix', 'embedmaster', 'mapple', 'streamvault'])

type RuntimeOptions = { configurationSnapshot?: (() => Promise<import('@consumit/contracts/internal').ProviderState>) | undefined; env: ApiEnv; animeCatalog: Pick<AnimeCatalog, 'title'>; animeTmdbEpisode?: ((tmdbId: number, absoluteEpisode: number, signal: AbortSignal) => Promise<TmdbEpisodeCoordinates | null>) | undefined; providerConfigStore?: ProviderConfigStore | undefined; subtitleCatalog?: SubtitleCatalog | undefined; files?: SubtitleFileStore | undefined; providerOptions?: Parameters<typeof loadConfiguredProviders>[1] | undefined; metadata?: CloudflareResolverOptions['metadata'] | undefined; titleMetadata?: TitleMetadataResolver; playback?: Playback | undefined; subtitles?: SubtitleService | undefined; scheduleProbes?: boolean | undefined; log?: ((fields: Record<string, unknown>) => void) | undefined }
export async function createPlaybackRuntime({ configurationSnapshot, env, animeCatalog: resolvedAnimeCatalog, animeTmdbEpisode, providerConfigStore, subtitleCatalog, files, providerOptions: suppliedProviderOptions, metadata: suppliedMetadata, titleMetadata, playback, subtitles, scheduleProbes = false, log = () => {} }: RuntimeOptions) {
  const app = { log: { warn: (fields: Record<string, unknown>, message?: string) => log({ ...fields, message }), info: (fields: Record<string, unknown>, message?: string) => log({ ...fields, message }) }, addHook: (name: string, close: () => Promise<void>) => { if (name === 'onClose') closes.push(close) } }
  const closes: (() => Promise<void>)[] = []
  const playbackStore = env.playback?.enabled && env.playback.stateUrl ? createValkeyPlaybackStore(env.playback.stateUrl) : createMemoryPlaybackStore()
  const anizip = createAnizipClient(createSubtitleHttp(['api.ani.zip']))
  const lookmovieOnMediaNode = Boolean(env.playback?.relay?.node?.providers.lookmovie?.length)
  if (lookmovieOnMediaNode && env.playback?.resolver?.providerOrigins?.lookmovie) throw new Error('LookMovie media-node delivery requires lookup on the same node.')
  const cloudflareOnly = env.playback?.execution === 'cloudflare-only'
  const providerOptions = {
    ...(suppliedProviderOptions ?? {
    tmdbToken: env.tmdbToken,
    ...(!lookmovieOnMediaNode && env.playback?.relay?.discovery?.['lookmovie'] === 'lookmovie-v1' ? { lookmovieWorker: { origin: env.playback.relay.origin, secret: env.playback.relay.secret } } : {}),
    animeTitleResolver: createAnimeTitleResolver(resolvedAnimeCatalog),
    animeTitleVariantsResolver: createAnimeTitleVariantsResolver(resolvedAnimeCatalog),
    animeMetaResolver: createAnimeMetaResolver(resolvedAnimeCatalog),
    }),
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
  const registry = cloudflareOnly && env.playback?.resolver ? createProviderRouteRegistry({
    providers, resolverOrigin: env.playback.resolver.origin, resolverOrigins: env.playback.resolver.providerOrigins,
    relayOrigin: env.playback.relay?.origin, relayOrigins: env.playback.relay?.providerOrigins, relayProviders: env.playback.relay?.providers,
    accepted: env.playback.acceptedEdgeRoutes ?? [],
  }) : null
  if (registry) for (const provider of providers) provider.routeVersion = registry.version
  if (env.playback?.resolver) {
    const metadata = suppliedMetadata ?? createResolverMetadata({
      ...(env.tmdbToken ? { tmdb: createTmdbMetadataResolver(env.tmdbToken) } : {}),
      ...(env.tmdbToken ? { identity: createTmdbIdentityResolver(env.tmdbToken) } : {}),
      animeTitle: createAnimeTitleResolver(resolvedAnimeCatalog),
      animeTitles: createAnimeTitleVariantsResolver(resolvedAnimeCatalog),
      animeMeta: createAnimeMetaResolver(resolvedAnimeCatalog),
    })
    for (const provider of providers) {
      // Node-issued LookMovie media is tied to the native lookup egress.
      // Wrapping this adapter in the edge resolver breaks that binding.
      if (!cloudflareOnly && provider.adapter.id === 'lookmovie' && lookmovieOnMediaNode) continue
      // An explicitly reviewed Worker route overrides the default native-egress
      // exception; otherwise operator routing edits would be silently ignored.
      if (cloudflareOnly && (!registry || !provider.workerConfig || !registry.snapshot().some(route => route.provider === provider.adapter.id))) {
        provider.adapter = { ...provider.adapter, resolve: async () => ({ ok: false, code: 'unavailable', retryable: false }) }
        continue
      }
      if (!cloudflareOnly && (!provider.workerConfig || localResolverProviders.has(provider.adapter.id) && !env.playback.resolver.providerOrigins?.[provider.adapter.id])) continue
      if (cloudflareOnly) provider.execution = 'cloudflare'
      provider.adapter = createCloudflareResolverAdapter(provider, {
        config: { ...env.playback.resolver, cloudflareOnly },
        currentConfig: current => ({
          ...current.workerConfig,
          id: current.adapter.id,
          enabled: current.enabled, role: current.role ?? 'video', upstreamGroup: current.upstreamGroup, concurrency: current.concurrency, requestsPerMinute: current.requestsPerMinute, mediaKinds: [...current.mediaKinds],
          regions: [...current.approvedRegions],
          mediaHosts: [...current.mediaHosts],
          mediaHostPatterns: (current.mediaHostPatterns ?? []).map(pattern => pattern.source),
          deliveryMode: current.deliveryMode ?? 'direct',
          ...(current.relayHostDiscovery ? { relayHostDiscovery: current.relayHostDiscovery } : {}),
        }),
        metadata,
        ...(cloudflareOnly && registry ? { route: (input: import('@consumit/provider-sdk').ProviderInput) => registry.find(provider.adapter.id, input.ref.kind, input.region, provider.deliveryMode ?? 'direct', input.purpose === 'audio' ? 'audio' : 'video') } : {}),
      })
      if (cloudflareOnly && registry) {
        const adapter = provider.adapter
        provider.adapter = { ...adapter, resolve: (input, signal) => registry.find(adapter.id, input.ref.kind, input.region, provider.deliveryMode ?? 'direct', input.purpose === 'audio' ? 'audio' : 'video')
          ? adapter.resolve(input, signal) : Promise.resolve({ ok: false, code: 'unavailable', retryable: false }) }
      }
    }
  }
  if (registry) log({ component: 'provider-route-registry', version: registry.version })
  const resolvedPlayback = playback ?? createPlayback({ providers, store: playbackStore, region: env.tmdbRegion, providerOrders, audioOrigin: env.appOrigin,
    ...(env.playback?.relay ? { relay: createPlaybackRelay({ ...env.playback.relay,
      ...(registry ? { routeVersion: registry.version, routePolicy: registry.relayRoutes() } : {}),
    }), relayOrigin: env.appOrigin } : {}) })
  const probeScheduler = env.playback?.enabled && env.nodeEnv !== 'test' && env.playback.probeIntervalMs > 0
    ? createProbeScheduler({
      providers, region: env.tmdbRegion, intervalMs: env.playback.probeIntervalMs, store: playbackStore,
      log: (fields) => app.log.info({ component: 'provider-probe', ...fields }, 'provider probe finished'),
    })
    : null
  if (scheduleProbes) probeScheduler?.start()

  // Aggregated captions: registered subtitle providers plus the streaming
  // adapters' own tracks downstream. Converted VTT files are cached in the
  // playback store (Valkey when configured, memory otherwise) and served
  // first-party — the approved exception to browser-direct delivery.
  // AnimeTosho and TVSubtitles use canonical absolute episode numbering.
  // AniZip supplies the external IDs/AniDB episode ID; TMDB's own catalog
  // maps the absolute episode to the season/episode used by TMDB-keyed and
  // title-keyed TV providers. TVDB coordinates must not be reused as TMDB.
  const subtitleService = subtitles ?? createSubtitleService({
    ...(cloudflareOnly && env.playback?.subtitleWorker ? { edge: env.playback.subtitleWorker } : {}),
    providers: cloudflareOnly ? [] : [
      ...createSubtitleProviders(env.subtitleKeys),
      ...createStreamingSubtitleProviders(providers, env.tmdbRegion, playbackStore),
    ],
    metadata: titleMetadata ?? (env.tmdbToken?.trim() ? createTmdbMetadataResolver(env.tmdbToken) : undefined),
    animeTitle: async (id) => {
      const detail = await resolvedAnimeCatalog.title(id)
      return { title: detail.titles.preferred }
    },
    ...(!cloudflareOnly ? { animeMapping: async (anilistId: number, episode: number, signal: AbortSignal) => {
      const mapped = await anizip.episodeFor(anilistId, episode, signal)
      if (!mapped || (!mapped.tmdbId && !mapped.imdbId)) return null
      return { ...(mapped.tmdbId ? { tmdbId: mapped.tmdbId } : {}), ...(mapped.imdbId ? { imdbId: mapped.imdbId } : {}), ...(mapped.anidbEid ? { anidbEid: mapped.anidbEid } : {}), season: mapped.season, episode: mapped.episode }
    } } : {}),
    ...(animeTmdbEpisode ? { animeTmdbEpisode } : {}),
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

  return { playback: resolvedPlayback, subtitles: subtitleService, providers, providerOrders, providerOptions, store: playbackStore, probeScheduler, routeRegistry: registry, refreshConfiguration, configurationCurrent: () => Date.now() - configurationAt <= 10000, async close() { probeScheduler?.stop(); for (const close of closes) await close(); await playbackStore.close() } }
}

