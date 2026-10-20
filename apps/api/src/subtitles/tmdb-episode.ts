import type { Catalog } from '../catalog/catalog.ts'

export type TmdbEpisodeCoordinates = { season: number; episode: number }

/** Map an anime's canonical absolute episode to the matching TMDB season and
 * episode. AniZip's season numbers describe TVDB, which is not always how a
 * TMDB-keyed subtitle provider partitions the same anime. */
export function createTmdbAnimeEpisodeMapper(catalog: Catalog) {
  const cache = new Map<string, TmdbEpisodeCoordinates | null>()

  return async function map(tmdbId: number, absoluteEpisode: number): Promise<TmdbEpisodeCoordinates | null> {
    if (!Number.isInteger(tmdbId) || tmdbId <= 0 || !Number.isInteger(absoluteEpisode) || absoluteEpisode <= 0) return null
    const key = `${tmdbId}:${absoluteEpisode}`
    const cached = cache.get(key)
    if (cached) return cached

    let mapped: TmdbEpisodeCoordinates | null = null
    try {
      const detail = await catalog.title('series', tmdbId)
      if (detail.item.kind === 'series') {
        let remaining = absoluteEpisode
        for (const season of [...detail.item.seasons].sort((a, b) => a.number - b.number)) {
          // TMDB season 0 contains specials; canonical anime episode numbers
          // count regular episodes and must start at season 1.
          if (season.number <= 0 || season.episodeCount <= 0) continue
          if (remaining > season.episodeCount) {
            remaining -= season.episodeCount
            continue
          }
          const seasonDetail = await catalog.season(tmdbId, season.number)
          const episode = seasonDetail.item.episodes.find(entry => entry.seasonNumber === season.number && entry.episodeNumber === remaining)
          if (episode) mapped = { season: season.number, episode: episode.episodeNumber }
          break
        }
      }
    } catch {
      // The providers can still try the canonical S1E{absoluteEpisode} form.
    }

    // Do not cache misses: a transient catalog outage must not pin fallback
    // coordinates for the lifetime of this process.
    if (mapped) {
      if (cache.size >= 1000) cache.delete(cache.keys().next().value!)
      cache.set(key, mapped)
    }
    return mapped
  }
}
