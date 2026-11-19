import type { AnimeCatalog } from '../catalog/anilist/adapter.ts'
import { assembleAnimeCapability, type AnimeCapability, type AnimeCapabilitySources } from './capability.ts'

type TestArtwork = Pick<AnimeCapabilitySources, 'episodeArt' | 'tmdbEpisodeArt' | 'canonicalEpisodeArt'>

/** Builds the complete buildApp seam with deterministic, network-free defaults. */
export function createTestAnimeCapability(catalog: AnimeCatalog, artwork: Partial<TestArtwork> = {}): AnimeCapability {
  return assembleAnimeCapability({
    primaryCatalog: catalog,
    fallbacks: [],
    identity: {
      async remember() {},
      async malIdForAniList() { return null },
      async aniListIdForMal() { return null },
    },
    episodeArt: artwork.episodeArt ?? { async episodeByMalId() { return null } },
    ...(artwork.tmdbEpisodeArt ? { tmdbEpisodeArt: artwork.tmdbEpisodeArt } : {}),
    ...(artwork.canonicalEpisodeArt ? { canonicalEpisodeArt: artwork.canonicalEpisodeArt } : {}),
  })
}
