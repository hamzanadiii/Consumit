export type WatchTitle = {
  kind: 'movie' | 'series' | 'anime'
  id: number
  title: string
  year?: number | null | undefined
  overview?: string | null | undefined
  posterUrl?: string | null | undefined
  backdropUrl?: string | null | undefined
  logoUrl?: string | null | undefined
  runtimeMinutes?: number | null | undefined
  episodeRuntimeMinutes?: number | null | undefined
  tmdbRating?: number | null | undefined
  certification?: string | null | undefined
  contentRating?: string | null | undefined
}

/** Minimal episode surface. Series episodes carry a season; anime episodes
 *  are identified by canonical number alone. */
export type WatchEpisode = {
  title: string
  seasonNumber?: number | undefined
  episodeNumber: number
  overview?: string | null | undefined
  runtimeMinutes?: number | null | undefined
  stillUrl?: string | null | undefined
}
