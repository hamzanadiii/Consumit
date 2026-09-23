import type { KitsuCatalog, KitsuEpisodeArt } from './kitsu.ts'

/** Deterministic fake: episode art keyed by `${malId}:${episode}`. */
export function createFakeKitsuCatalog(art: Record<string, Omit<KitsuEpisodeArt, 'episode'>> = {}): KitsuCatalog {
  return {
    async episodeByMalId(malId: number, episode: number) {
      if (!Number.isInteger(malId) || malId <= 0 || !Number.isInteger(episode) || episode <= 0) return null
      const found = art[`${malId}:${episode}`]
      return found ? { ...found, episode } : null
    },
  }
}
