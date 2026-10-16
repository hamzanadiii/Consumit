/** Kitsu episode-art boundary. Kitsu is keyless and numbers episodes
 *  absolutely per anime entry — the same canonical numbering Consumit uses
 *  for anime — so one mapping plus one filtered fetch yields a title,
 *  synopsis, and still per episode. */

export type KitsuEpisodeArt = {
  kitsuId: string
  episode: number
  title: string | null
  synopsis: string | null
  stillUrl: string | null
  airDate: string | null
}

export interface KitsuCatalog {
  /** Episode art by MyAnimeList id (AniList supplies `idMal`). Null when
   *  the mapping or the episode is unknown — never throws for a miss. */
  episodeByMalId(malId: number, episode: number): Promise<KitsuEpisodeArt | null>
}
