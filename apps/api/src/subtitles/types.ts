/** Subtitle-provider contract. Providers only SEARCH — the engine downloads,
 *  extracts (zip), converts (srt to vtt), caches, and serves playable VTT. */

export type SubtitleQuery = {
  type: 'movie' | 'tv' | 'anime'
  tmdbId?: number | undefined
  imdbId?: string | undefined
  title?: string | undefined
  year?: number | undefined
  /** TV season / episode (anime: absolute episode in `episode`). */
  season?: number | undefined
  episode?: number | undefined
  /** AniList id for anime-only providers (Jimaku). */
  anilistId?: number | undefined
  /** Canonical anime episode number (absolute numbering per the domain
   *  glossary). Mirrors `episode` today; split-cours and specials keep
   *  their own canonical numbers here while provider quirks stay behind
   *  each adapter. */
  absoluteEpisode?: number | undefined
  /** Richer episode fingerprint. Populated when the caller holds episode
   *  detail (air date, duration, title); providers match on what they can
   *  and ignore the rest. The anime catalog grows these fields — providers
   *  must never require them. */
  episodeTitle?: string | undefined
  airDate?: string | undefined
  durationMs?: number | undefined
  /** Preferred language codes, in order (default ['en']). */
  langs?: string[] | undefined
}

export type RawSubtitle = {
  /** Direct file URL (srt/vtt) or zip URL (set needsExtract). */
  url: string
  /** ISO-ish language code, lowercased (en, fr, ar, ...). */
  lang: string
  label: string
  format: 'srt' | 'vtt' | 'ass' | 'zip' | 'other'
  rating?: number | undefined
  hi?: boolean | undefined
  release?: string | undefined
  provider: string
  needsExtract?: boolean | undefined
  headers?: Record<string, string> | undefined
}

export type SubtitleSearchProvider = {
  readonly id: string
  readonly name: string
  supports(query: SubtitleQuery): boolean
  search(query: SubtitleQuery, signal: AbortSignal): Promise<RawSubtitle[]>
}
