import { z } from 'zod'
import { AnimeError } from '../../anime/errors.ts'
import { StaleCache, type CachePolicy } from '../stale-cache.ts'
import { kitsuUnavailable } from './errors.ts'
import type { KitsuCatalog, KitsuEpisodeArt } from './kitsu.ts'

const apiOrigin = 'https://kitsu.io/api/edge'
const userAgent = 'Consumit/1.0 (anime episode-art adapter)'
const requestTimeoutMs = 8_000

// Episode art never changes once published: cache long, serve stale.
const mappingPolicy = { freshForMs: 7 * 86_400_000, staleForMs: 30 * 86_400_000 } satisfies CachePolicy
const episodePolicy = { freshForMs: 7 * 86_400_000, staleForMs: 30 * 86_400_000 } satisfies CachePolicy

const mappingSchema = z.object({
  data: z.array(z.object({
    relationships: z.object({
      item: z.object({
        links: z.object({ related: z.url() }),
      }),
    }),
  })).max(10),
})

const linkageSchema = z.object({
  data: z.object({ id: z.string().min(1) }).nullable(),
})

const episodeSchema = z.object({
  data: z.array(z.object({
    attributes: z.object({
      number: z.number().int().positive().nullable(),
      canonicalTitle: z.string().nullable().catch(null),
      synopsis: z.string().nullable().catch(null),
      airdate: z.string().nullable().catch(null),
      thumbnail: z.object({ original: z.url().nullable().catch(null) }).nullable().catch(null),
    }).passthrough(),
  })).max(5),
  meta: z.object({ count: z.number().int().nonnegative().catch(0) }).optional(),
})

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export type KitsuCatalogOptions = {
  cache?: StaleCache | undefined
  fetch?: FetchLike | undefined
}

function httpUrl(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

export function createKitsuCatalog({ cache = new StaleCache(), fetch: fetchImpl = fetch }: KitsuCatalogOptions = {}): KitsuCatalog {
  async function getJson(path: string): Promise<unknown> {
    let response: Response
    try {
      response = await fetchImpl(`${apiOrigin}${path}`, {
        headers: { accept: 'application/vnd.api+json', 'user-agent': userAgent },
        signal: AbortSignal.timeout(requestTimeoutMs),
      })
    } catch (error) {
      return kitsuUnavailable(error)
    }
    if (response.status === 404) {
      throw new AnimeError('ANIME_NOT_FOUND', 'No episode artwork is known for this title.')
    }
    if (!response.ok) {
      return kitsuUnavailable(`Kitsu HTTP ${response.status}`)
    }
    try {
      return await response.json() as unknown
    } catch (error) {
      return kitsuUnavailable(error)
    }
  }

  /** AniList idMal -> Kitsu anime id via the MAL mapping table. */
  async function kitsuId(malId: number): Promise<string | null> {
    const cached = await cache.get<string | null>(`kitsu:mapping:${malId}`, mappingPolicy, async () => {
      const raw = mappingSchema.safeParse(
        await getJson(`/mappings?filter[externalSite]=myanimelist%2Fanime&filter[externalId]=${malId}&page[limit]=1`),
      )
      if (!raw.success || !raw.data.data.length) return null
      const related = raw.data.data[0]?.relationships.item.links.related
      if (!related) return null
      const linked = linkageSchema.safeParse(await getJson(related.replace(apiOrigin, '')))
      return linked.success ? (linked.data.data?.id ?? null) : null
    })
    return cached.value
  }

  return {
    async episodeByMalId(malId: number, episode: number): Promise<KitsuEpisodeArt | null> {
      if (!Number.isInteger(malId) || malId <= 0 || !Number.isInteger(episode) || episode <= 0) return null
      const id = await kitsuId(malId)
      if (!id) return null
      try {
        const cached = await cache.get<KitsuEpisodeArt | null>(`kitsu:episode:${id}:${episode}`, episodePolicy, async () => {
          const raw = episodeSchema.safeParse(
            await getJson(`/anime/${encodeURIComponent(id)}/episodes?filter[number]=${episode}&page[limit]=1`),
          )
          if (!raw.success || !raw.data.data.length) return null
          const attributes = raw.data.data[0]?.attributes
          if (!attributes || attributes.number !== episode) return null
          return {
            kitsuId: id,
            episode,
            title: attributes.canonicalTitle?.trim() || null,
            synopsis: attributes.synopsis?.trim() || null,
            stillUrl: httpUrl(attributes.thumbnail?.original),
            airDate: attributes.airdate,
          } satisfies KitsuEpisodeArt
        })
        return cached.value
      } catch (error) {
        if (error instanceof AnimeError && error.code === 'ANIME_NOT_FOUND') return null
        throw error
      }
    },
  }
}
