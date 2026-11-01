import type { Catalog } from '../catalog/catalog.ts'
import type { AnimeCatalog } from '../catalog/anilist/adapter.ts'
import { createAnilistCatalog } from '../catalog/anilist/adapter.ts'
import { createCachedAnimeCatalog } from '../catalog/anilist/cached-catalog.ts'
import { createKitsuCatalog } from '../catalog/kitsu/adapter.ts'
import type { KitsuCatalog } from '../catalog/kitsu/kitsu.ts'
import { createKitsuMetadataCatalog } from '../catalog/kitsu/metadata-adapter.ts'
import { createMalCatalog } from '../catalog/mal/adapter.ts'
import type { ApiEnv } from '../config/env.ts'
import { StaleCache } from '../catalog/stale-cache.ts'
import { createAnizipEpisodeArt, type CanonicalEpisodeArt } from './anizip-episode-art.ts'
import { createAnimeCatalogWithFallbacks } from './anime-fallback.ts'
import { createAnimeIdentityMap, type AnimeIdentityMap, type AnimeMetadataFallback } from './anime-metadata.ts'
import { createAnimeService, type AnimeService } from './anime-service.ts'
import { createTmdbEpisodeArt, type TmdbEpisodeArtResolver } from './tmdb-episode-art.ts'
import { createAnimeProviderResolvers, type AnimeProviderResolvers } from './title-resolver.ts'
import { createAnizipClient, type AnizipClient } from '../subtitles/anizip.ts'
import { createSubtitleHttp } from '../subtitles/http.ts'

export interface AnimeCapability {
  catalog: AnimeCatalog
  service: AnimeService
  providerResolvers: AnimeProviderResolvers
}

/** Concrete adapter boundary used by the Anime composition root. */
export type AnimeCapabilitySources = {
  primaryCatalog: AnimeCatalog
  fallbacks: AnimeMetadataFallback[]
  identity: AnimeIdentityMap
  episodeArt: KitsuCatalog
  tmdbEpisodeArt?: TmdbEpisodeArtResolver
  canonicalEpisodeArt?: CanonicalEpisodeArt
}

/** Assemble Anime-owned fallback, artwork, service and provider metadata paths. */
export function assembleAnimeCapability(sources: AnimeCapabilitySources): AnimeCapability {
  const catalog = createAnimeCatalogWithFallbacks(sources.primaryCatalog, sources.fallbacks, sources.identity)
  const service = createAnimeService(catalog, {
    episodeArt: sources.episodeArt,
    ...(sources.tmdbEpisodeArt ? { tmdbEpisodeArt: sources.tmdbEpisodeArt } : {}),
    ...(sources.canonicalEpisodeArt ? { canonicalEpisodeArt: sources.canonicalEpisodeArt } : {}),
  })
  return { catalog, service, providerResolvers: createAnimeProviderResolvers(catalog) }
}

export type CreateAnimeCapabilityOptions = {
  env: ApiEnv
  cache: StaleCache
  tmdbCatalog?: Catalog
  /** Persistent caching is enabled only when the API has its durable cache store. */
  persistentCache?: boolean
  /** Allows deterministic coverage of AniZip failures without network access. */
  anizipClient?: Pick<AnizipClient, 'mappingsFor'>
}

/** Anime composition root. Provider network implementations remain in adapters. */
export function createAnimeCapability({ env, cache, tmdbCatalog, persistentCache = false, anizipClient }: CreateAnimeCapabilityOptions): AnimeCapability {
  const rawCatalog = createAnilistCatalog()
  const primaryCatalog = persistentCache && env.nodeEnv !== 'test'
    ? createCachedAnimeCatalog(rawCatalog, cache)
    : rawCatalog
  const kitsuMetadata = createKitsuMetadataCatalog({ cache })
  const identity = createAnimeIdentityMap(cache, kitsuMetadata.aniListIdForMal)
  const fallbacks = env.nodeEnv === 'test'
    ? []
    : [
      ...(env.malClientId ? [createMalCatalog({ clientId: env.malClientId, identity, cache })] : []),
      kitsuMetadata.fallback(identity),
    ]

  let canonicalEpisodeArt: CanonicalEpisodeArt | undefined
  if (env.nodeEnv !== 'test') {
    const client = anizipClient ?? createAnizipClient(createSubtitleHttp(['api.ani.zip']))
    canonicalEpisodeArt = createAnizipEpisodeArt(client, cache)
  }

  return assembleAnimeCapability({
    primaryCatalog,
    fallbacks,
    identity,
    episodeArt: createKitsuCatalog({ cache }),
    ...(tmdbCatalog ? { tmdbEpisodeArt: createTmdbEpisodeArt(tmdbCatalog, cache) } : {}),
    ...(canonicalEpisodeArt ? { canonicalEpisodeArt } : {}),
  })
}
