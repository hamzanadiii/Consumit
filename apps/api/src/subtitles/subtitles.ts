import { playbackTrackSchema } from '@consumit/contracts'
import type { PlaybackStore } from '../playback/state.ts'
import type { TitleMetadataResolver } from '../playback/tmdb-metadata.ts'
import { resolveSubtitles, type ServedSubtitle } from './engine.ts'
import type { SubtitleSearchProvider } from './types.ts'
import { z } from 'zod'

const SEARCH_CACHE_TTL_SECONDS = 3600

/** Cached track lists keep the serving provider name; the public response
 *  contract carries it inside the label instead. */
const cachedTracksSchema = z.object({
  subtitles: z.array(playbackTrackSchema.extend({ format: z.literal('vtt'), provider: z.string().min(1).max(64) })).max(32),
})

export type SubtitleRef = {
  kind: 'movie' | 'series' | 'anime'
  id: number
  season?: number | undefined
  episode?: number | undefined
}

export interface SubtitleService {
  /** Aggregated playable caption tracks for one title/episode, independent
   *  of the selected streaming provider. `langs` is the member's preferred
   *  language list (max 3, priority order); the engine tries these first
   *  from every provider and defaults to English when empty. */
  search(ref: SubtitleRef, signal: AbortSignal, langs?: readonly string[] | undefined): Promise<ServedSubtitle[]>
  /** Cached converted VTT text for a file key, or null on a miss. */
  file(key: string): Promise<string | null>
}

/** Lenient query parsing: keep well-formed codes in order (max 3), drop
 *  the rest. Garbage never fails the search; it just narrows nothing. */
export function cleanQueryLangs(value: string | undefined): string[] {
  if (!value) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const part of value.split(',')) {
    const code = part.trim().toLowerCase()
    if (!/^[a-z]{2,3}$/.test(code) || seen.has(code)) continue
    seen.add(code)
    out.push(code)
    if (out.length >= 3) break
  }
  return out
}

export type AnimeTitleLookup = (anilistId: number) => Promise<{ title: string }>

export function createSubtitleService(deps: {
  providers: readonly SubtitleSearchProvider[]
  /** Canonical TMDB title/year/imdb identity for movies and series. Without
   *  it, title-keyed providers skip and only tmdbId-keyed ones answer. */
  metadata?: TitleMetadataResolver | undefined
  animeTitle: AnimeTitleLookup
  store: PlaybackStore
  origin: string
}): SubtitleService {
  return {
    async search(ref: SubtitleRef, signal: AbortSignal, langs?: readonly string[] | undefined): Promise<ServedSubtitle[]> {
      const season = ref.season ?? 1
      const episode = ref.episode ?? 1
      const wanted = cleanQueryLangs(langs?.join(',')).slice(0, 3)
      // Repeat views resolve instantly: the converted files behind these
      // URLs live 7 days, so an hour-old track list is always playable.
      const cacheKey = `subsearch:${ref.kind}:${ref.id}:${season}:${episode}:${wanted.join('+') || 'en'}`
      try {
        const cached = await deps.store.get(cacheKey)
        if (cached) {
          const parsed = cachedTracksSchema.safeParse(JSON.parse(cached))
          if (parsed.success) return parsed.data.subtitles
        }
      } catch {
        // Cache failure never blocks a fresh search.
      }
      const queryLangs = wanted.length ? wanted : undefined
      let tracks: ServedSubtitle[]
      if (ref.kind === 'anime') {
        const detail = await deps.animeTitle(ref.id)
        tracks = await resolveSubtitles(
          { type: 'anime', title: detail.title, episode, anilistId: ref.id, ...(queryLangs ? { langs: queryLangs } : {}) },
          deps.providers,
          deps.store,
          deps.origin,
          signal,
        )
      } else {
        let title: string | undefined
        let year: number | undefined
        let imdbId: string | undefined
        try {
          const meta = await deps.metadata?.({ kind: ref.kind, id: ref.id }, signal)
          title = meta?.title
          year = meta?.year
          imdbId = meta?.imdbId
        } catch {
          // Identity failure only narrows the provider set (title/imdb-keyed
          // providers skip); tmdbId-keyed providers still answer.
        }
        tracks = await resolveSubtitles(
          {
            type: ref.kind === 'movie' ? 'movie' : 'tv',
            tmdbId: ref.id,
            ...(imdbId ? { imdbId } : {}),
            ...(title ? { title } : {}),
            ...(year ? { year } : {}),
            season,
            episode,
            ...(queryLangs ? { langs: queryLangs } : {}),
          },
          deps.providers,
          deps.store,
          deps.origin,
          signal,
        )
      }
      try {
        await deps.store.set(cacheKey, JSON.stringify({ subtitles: tracks }), SEARCH_CACHE_TTL_SECONDS)
      } catch {
        // Cache failure never fails the search.
      }
      return tracks
    },
    async file(key: string): Promise<string | null> {
      if (!/^[0-9a-f]{16}$/.test(key)) return null
      const raw = await deps.store.get(`subvtt:${key}`)
      if (!raw) return null
      try {
        const parsed = JSON.parse(raw) as { vtt?: unknown }
        return typeof parsed.vtt === 'string' ? parsed.vtt : null
      } catch {
        return null
      }
    },
  }
}
