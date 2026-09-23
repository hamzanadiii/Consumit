import { playbackTrackSchema } from '@consumit/contracts'
import type { PlaybackStore } from '../playback/state.ts'
import type { TitleMetadataResolver } from '../playback/tmdb-metadata.ts'
import { servedStorageKey, toServedTracks, type SubtitleCatalog } from './catalog.ts'
import { resolveSubtitles, type ServedSubtitle } from './engine.ts'
import { MAX_OFFSET_MS, shiftVtt } from './sync.ts'
import { createStoreFileStore, type OriginalFile, type SubtitleFileStore } from './storage.ts'
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
  /** Cached converted VTT text for a file key, or null on a miss.
   *  `offsetMs` shifts every cue server-side (member sync correction);
   *  shifted variants are cached under key+offset and never touch the
   *  source file. */
  file(key: string, offsetMs?: number | undefined): Promise<string | null>
  /** Original source bytes (srt/vtt/ass) for a file key, kept for future
   *  styled rendering. Null on backends without original storage. */
  original(key: string): Promise<OriginalFile | null>
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
  /** File backend for converted VTT + originals. Defaults to the
   *  search-cache store (converted VTT only, current behavior). */
  files?: SubtitleFileStore | undefined
  /** Durable Neon metadata catalog. Read on search-cache miss, written
   *  after fresh discoveries. Absent keeps today's cache-only behavior. */
  catalog?: SubtitleCatalog | undefined
}): SubtitleService {
  const files = deps.files ?? createStoreFileStore(deps.store)
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
      // Durable catalog before live fan-out: same content-keyed tracks
      // without hammering subtitle upstreams for every hourly expiry.
      if (deps.catalog) {
        try {
          const rows = await deps.catalog.find(ref, wanted.length ? wanted : ['en'])
          if (rows.length) {
            const cataloged = toServedTracks(rows, deps.origin)
            try {
              await deps.store.set(cacheKey, JSON.stringify({ subtitles: cataloged }), SEARCH_CACHE_TTL_SECONDS)
            } catch {
              // Cache failure never fails the search.
            }
            return cataloged
          }
        } catch {
          // Catalog failure falls through to live discovery.
        }
      }
      let tracks: ServedSubtitle[]
      if (ref.kind === 'anime') {
        const detail = await deps.animeTitle(ref.id)
        tracks = await resolveSubtitles(
          { type: 'anime', title: detail.title, episode, absoluteEpisode: episode, anilistId: ref.id, ...(queryLangs ? { langs: queryLangs } : {}) },
          deps.providers,
          files,
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
          files,
          deps.origin,
          signal,
        )
      }
      try {
        await deps.store.set(cacheKey, JSON.stringify({ subtitles: tracks }), SEARCH_CACHE_TTL_SECONDS)
      } catch {
        // Cache failure never fails the search.
      }
      // Write-through to the durable catalog: served (first-party) tracks
      // only; direct upstream tracks stay provider-owned. Best-effort.
      if (deps.catalog) {
        try {
          const inputs = (
            await Promise.all(
              tracks.map(async (track) => {
                const storageKey = servedStorageKey(track.url)
                if (!storageKey) return null
                const vtt = await files.getVtt(storageKey)
                if (!vtt) return null
                const original = await files.getOriginal(storageKey)
                return {
                  language: track.language,
                  label: track.label,
                  format: 'vtt' as const,
                  provider: track.provider,
                  storageKey,
                  ...(original ? { originalExt: original.ext } : {}),
                  vtt,
                  ...(track.hi ? { hi: true } : {}),
                  ...(typeof track.rating === 'number' ? { rating: track.rating } : {}),
                  ...(track.release ? { releaseTag: track.release } : {}),
                }
              }),
            )
          ).filter((input): input is NonNullable<typeof input> => input !== null)
          await deps.catalog.save(ref, inputs)
        } catch {
          // Catalog failure never fails the search.
        }
      }
      return tracks
    },
    async file(key: string, offsetMs?: number | undefined): Promise<string | null> {
      const base = await files.getVtt(key)
      if (!base) return null
      if (!offsetMs) return base
      if (!Number.isInteger(offsetMs) || Math.abs(offsetMs) > MAX_OFFSET_MS) return null
      const cacheKey = `subvtt:shift:${key}:${offsetMs}`
      try {
        const cached = await deps.store.get(cacheKey)
        if (cached) {
          const parsed = JSON.parse(cached) as { vtt?: unknown }
          if (typeof parsed.vtt === 'string' && parsed.vtt.startsWith('WEBVTT')) return parsed.vtt
        }
      } catch {
        // Cache failure falls through to a fresh shift.
      }
      const shifted = shiftVtt(base, offsetMs)
      if (!shifted) return null
      try {
        await deps.store.set(cacheKey, JSON.stringify({ vtt: shifted }), 7 * 24 * 3600)
      } catch {
        // Cache failure never fails the serve.
      }
      return shifted
    },
    async original(key: string): Promise<OriginalFile | null> {
      return files.getOriginal(key)
    },
  }
}
