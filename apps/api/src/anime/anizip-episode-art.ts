import { z } from 'zod'
import { StaleCache, type CachePolicy } from '../catalog/stale-cache.ts'
import type { AnizipClient } from '../subtitles/anizip.ts'

export type CanonicalEpisodeMetadata = {
  title: string | null
  synopsis: string | null
  stillUrl: string | null
  airDate: string | null
}

export type CanonicalEpisodeArt = {
  episodeByAnilistId(anilistId: number, episode: number): Promise<CanonicalEpisodeMetadata | null>
}

const positiveId = z.union([z.number().int().positive(), z.string().regex(/^[1-9]\d*$/).transform(Number)])
const mappingSchema = z.object({
  mappings: z.object({ anilist_id: positiveId }),
  episodes: z.record(z.string(), z.unknown()).refine(entries => Object.keys(entries).length <= 10_000),
})
const text = z.string().trim().max(20_000).nullable().optional().catch(null)
const episodeSchema = z.object({
  episode: positiveId,
  title: z.object({ en: text, 'x-jat': text }).nullable().optional().catch(null),
  overview: text,
  summary: text,
  image: z.string().max(2_048).nullable().optional().catch(null),
  airDate: z.iso.date().nullable().optional().catch(null),
  airdate: z.iso.date().nullable().optional().catch(null),
})
const policy = { freshForMs: 6 * 3600_000, staleForMs: 48 * 3600_000 } satisfies CachePolicy

function stillUrl(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && !url.port
      && ['artworks.thetvdb.com', 'image.tmdb.org'].includes(url.hostname) ? url.href : null
  } catch {
    return null
  }
}

/** AniList-keyed records avoid guessing how a parent series splits seasons.
 * Only matching canonical episode keys are accepted; specials stay separate.
 * The shared transport bounds bytes, time, redirects, and upstream hosts. */
export function createAnizipEpisodeArt(client: Pick<AnizipClient, 'mappingsFor'>, cache = new StaleCache()): CanonicalEpisodeArt {
  return {
    async episodeByAnilistId(anilistId, episode) {
      if (!Number.isSafeInteger(anilistId) || anilistId <= 0 || !Number.isInteger(episode) || episode < 1 || episode > 10_000) return null
      try {
        const result = await cache.get<Record<string, CanonicalEpisodeMetadata>>(`anime:canonical-episode-art:v1:${anilistId}`, policy, async () => {
          const parsed = mappingSchema.safeParse(await client.mappingsFor(anilistId, AbortSignal.timeout(8_000)))
          // Outages and invalid identities must not replace last-known art.
          if (!parsed.success || parsed.data.mappings.anilist_id !== anilistId) throw new Error('Canonical episode metadata is unavailable.')
          const episodes: Record<string, CanonicalEpisodeMetadata> = {}
          for (const [key, raw] of Object.entries(parsed.data.episodes)) {
            if (!/^[1-9]\d*$/.test(key) || Number(key) > 10_000) continue
            const info = episodeSchema.safeParse(raw)
            if (!info.success || info.data.episode !== Number(key)) continue
            const item = info.data
            episodes[key] = {
              title: item.title?.en || item.title?.['x-jat'] || null,
              synopsis: item.overview || item.summary || null,
              stillUrl: stillUrl(item.image),
              airDate: item.airDate || item.airdate || null,
            }
          }
          return episodes
        })
        const info = result.value[String(episode)]
        return info && (info.title || info.synopsis || info.stillUrl) ? info : null
      } catch {
        return null
      }
    },
  }
}
