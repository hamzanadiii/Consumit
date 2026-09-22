import type { AnimeTitleDetail } from '@consumit/contracts'

export type EpisodeMapping = {
  canonicalEpisode: number
  displayNumber: string
  title: string | null
  providerMappings: ProviderEpisodeMapping[]
}

export type ProviderEpisodeMapping = {
  providerId: string
  providerSeriesId: string
  providerEpisode: number
  providerSeason: number | null
  audioLanguage: string
  confidence: number
  verifiedAt: string | null
}

export type AnimeEpisodeService = {
  resolveEpisodes(anime: AnimeTitleDetail): EpisodeMapping[]
  mapToProvider(episode: number, providerId: string, audioLanguage: string): ProviderEpisodeMapping | null
}

export function createAnimeEpisodeService(): AnimeEpisodeService {
  const mappings = new Map<string, EpisodeMapping[]>()

  const buildCacheKey = (anilistId: number) => `episodes:${anilistId}`

  return {
    resolveEpisodes(anime) {
      const cacheKey = buildCacheKey(anime.anilistId)
      const cached = mappings.get(cacheKey)
      if (cached) return cached

      const totalEpisodes = anime.episodes ?? 0
      const episodes: EpisodeMapping[] = []

      for (let i = 1; i <= totalEpisodes; i++) {
        episodes.push({
          canonicalEpisode: i,
          displayNumber: String(i),
          title: null,
          providerMappings: [],
        })
      }

      mappings.set(cacheKey, episodes)
      return episodes
    },

    mapToProvider(episode, providerId, audioLanguage) {
      return {
        providerId,
        providerSeriesId: '',
        providerEpisode: episode,
        providerSeason: null,
        audioLanguage,
        confidence: 0.5,
        verifiedAt: null,
      }
    },
  }
}
