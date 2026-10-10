import { releaseEpisodeSchema, type ReleaseEpisode } from '@consumit/contracts'
import type { Catalog } from '../catalog/catalog.ts'
import type { AnimeCatalog } from '../catalog/anilist/adapter.ts'
import { recentlyReleased, WEEK_MS } from './policy.ts'

export function createReleaseCatalog(catalog: Catalog, anime: AnimeCatalog) {
  return async (kind: 'series' | 'anime', id: number, now: Date): Promise<ReleaseEpisode[]> => {
    const since = new Date(now.getTime() - WEEK_MS)
    if (kind === 'series' ? !catalog.recentEpisodes : !anime.recentEpisodes) throw new Error('Episode releases are unavailable.')
    const episodes = kind === 'series' ? await catalog.recentEpisodes!(id, since) : await anime.recentEpisodes!(id, since, now)
    return episodes.map(value => {
      const episode = releaseEpisodeSchema.parse(value)
      if (episode.ref.kind !== kind || episode.ref.id !== id) throw new Error('Episode identity did not match the requested title.')
      return episode
    }).filter(value => recentlyReleased(new Date(value.releasedAt), now))
  }
}
