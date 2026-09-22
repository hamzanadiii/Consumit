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
