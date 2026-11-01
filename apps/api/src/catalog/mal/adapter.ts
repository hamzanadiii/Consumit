import { z } from 'zod'
import type { AnimeSeason } from '@consumit/contracts'
import { AnimeError } from '../../anime/errors.ts'
import { StaleCache, type CachePolicy } from '../stale-cache.ts'
import {
  currentAnimeSeason,
  mapAnimeMetadataDetail,
  mapAnimeMetadataPage,
  type AnimeIdentityMap,
  type AnimeMetadataFallback,
  type AnimeMetadataRecord,
  unavailableFallback,
} from '../../anime/anime-metadata.ts'

const apiOrigin = 'https://api.myanimelist.net/v2'
const userAgent = 'Consumit/1.0 (anime metadata fallback)'
const requestTimeoutMs = 8_000
const malCachePolicy = { freshForMs: 15 * 60_000, staleForMs: 45 * 60_000 } satisfies CachePolicy

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

const optionalText = z.string().max(20_000).nullable().optional()
const optionalNumber = z.number().finite().nullable().optional()
const pictureSchema = z.object({
  medium: z.string().max(2_000).nullable().optional(),
  large: z.string().max(2_000).nullable().optional(),
}).nullable().optional()
const malAnimeSchema = z.object({
  id: z.int().positive(),
  title: z.string().min(1).max(500),
  main_picture: pictureSchema,
  alternative_titles: z.object({
    en: optionalText,
    ja: optionalText,
    synonyms: z.array(z.string().max(500)).max(50).optional(),
  }).optional(),
  start_date: optionalText,
  mean: optionalNumber,
  popularity: z.int().nonnegative().nullable().optional(),
  num_list_users: z.int().nonnegative().nullable().optional(),
  num_episodes: z.int().nonnegative().nullable().optional(),
  media_type: optionalText,
  status: optionalText,
  start_season: z.object({ year: z.int().nullable().optional(), season: z.string().max(40).nullable().optional() }).nullable().optional(),
  genres: z.array(z.object({ id: z.int().positive().optional(), name: z.string().max(100) })).max(80).optional(),
  average_episode_duration: z.int().nonnegative().nullable().optional(),
  synopsis: optionalText,
  rating: optionalText,
  source: optionalText,
})
const malPageSchema = z.object({
  data: z.array(z.object({ node: malAnimeSchema })).max(100),
  paging: z.object({ next: z.string().max(2_000).nullable().optional() }).optional(),
})
const malDetailSchema = z.union([malAnimeSchema, z.object({ data: malAnimeSchema })])

type MalAnime = z.infer<typeof malAnimeSchema>

function safeHttps(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' ? url.href : null
  } catch {
    return null
  }
}

function normalize(raw: MalAnime): AnimeMetadataRecord {
  let year = raw.start_season?.year ?? null
  if (!year && raw.start_date) {
    const match = raw.start_date.match(/^(\d{4})/)
    if (match) year = Number(match[1])
  }
  return {
    malId: raw.id,
    title: raw.title,
    englishTitle: raw.alternative_titles?.en ?? null,
    japaneseTitle: raw.alternative_titles?.ja ?? null,
    format: raw.media_type ?? null,
    status: raw.status ?? null,
    season: raw.start_season?.season ?? null,
    year,
    episodes: raw.num_episodes ?? null,
    durationMinutes: raw.average_episode_duration ? Math.round(raw.average_episode_duration / 60) : null,
    genres: (raw.genres ?? []).map(({ name }) => name),
    imageUrl: safeHttps(raw.main_picture?.large ?? raw.main_picture?.medium),
    score: raw.mean && raw.mean > 0 ? raw.mean : null,
    popularity: raw.num_list_users ?? raw.popularity ?? 0,
    description: raw.synopsis ?? '',
    source: raw.source ?? null,
  }
}

function isAdult(record: MalAnime): boolean {
  return /(^|\b)rx\b|hentai/i.test(record.rating ?? '')
    || (record.genres ?? []).some(({ name }) => /hentai|erotica/i.test(name))
}

export type MalCatalogOptions = {
  clientId: string
  identity: AnimeIdentityMap
  cache?: StaleCache
  fetch?: FetchLike
}

export function createMalCatalog({ clientId, identity, cache = new StaleCache(), fetch: fetchImpl = fetch }: MalCatalogOptions): AnimeMetadataFallback {
  if (!clientId.trim()) throw new Error('MAL_CLIENT_ID is required for the official MyAnimeList API adapter.')

  async function request<T>(path: string, key: string, schema: z.ZodType<T>): Promise<T> {
    const cached = await cache.get<T>(`mal:v1:${key}`, malCachePolicy, async () => {
      let response: Response
      try {
        response = await fetchImpl(`${apiOrigin}${path}`, {
          headers: { accept: 'application/json', 'user-agent': userAgent, 'X-MAL-CLIENT-ID': clientId },
          signal: AbortSignal.timeout(requestTimeoutMs),
        })
      } catch (error) {
        return unavailableFallback('MyAnimeList', error)
      }
      if (response.status === 404) throw new AnimeError('ANIME_NOT_FOUND', 'MyAnimeList has no matching anime record.')
      if (!response.ok) return unavailableFallback('MyAnimeList', `HTTP ${response.status}`)
      let payload: unknown
      try { payload = await response.json() } catch (error) { return unavailableFallback('MyAnimeList', error) }
      const parsed = schema.safeParse(payload)
      if (!parsed.success) return unavailableFallback('MyAnimeList', 'MyAnimeList returned invalid anime metadata.')
      return parsed.data
    })
    return cached.value
  }

  async function page(path: string, key: string, pageNumber: number, perPage: number) {
    const data = await request(path, key, malPageSchema)
    const records = data.data.map(({ node }) => node).filter((record) => !isAdult(record)).map(normalize)
    const mapped = await mapAnimeMetadataPage(records, pageNumber, data.paging?.next ? pageNumber + 1 : pageNumber, pageNumber * perPage + (data.paging?.next ? 1 : 0), identity)
    return mapped
  }

  function listPath(resource: string, params: URLSearchParams): string {
    params.set('nsfw', 'white')
    params.set('fields', 'id,title,alternative_titles,main_picture,start_date,mean,popularity,num_list_users,num_episodes,media_type,status,start_season,genres,average_episode_duration,synopsis,rating,source')
    return `/${resource}?${params}`
  }

  return {
    provider: 'mal',
    async title(anilistId, malId) {
      if (!malId) return unavailableFallback('MyAnimeList', 'No exact MAL mapping is known for this AniList title.')
      const params = new URLSearchParams({ fields: 'id,title,alternative_titles,main_picture,start_date,mean,popularity,num_list_users,num_episodes,media_type,status,start_season,genres,average_episode_duration,synopsis,rating,source', nsfw: 'white' })
      const result = await request(`/anime/${malId}?${params}`, `detail:${malId}`, malDetailSchema)
      const record = 'data' in result ? result.data : result
      if (isAdult(record)) throw new AnimeError('ANIME_NOT_FOUND', `Anime not found: ${anilistId}`)
      return mapAnimeMetadataDetail(anilistId, normalize(record))
    },
    async search(query, pageNumber, perPage) {
      const params = new URLSearchParams({ q: query, limit: String(perPage), offset: String((pageNumber - 1) * perPage) })
      return page(listPath('anime', params), `search:${query}:${pageNumber}:${perPage}`, pageNumber, perPage)
    },
    async trending(pageNumber, perPage) {
      const { season, year } = currentAnimeSeason()
      return { ...await this.seasonal(season, year, pageNumber, perPage), discoveryBasis: 'seasonal-popularity' }
    },
    async seasonal(season: AnimeSeason, year: number, pageNumber, perPage) {
      const params = new URLSearchParams({ sort: 'anime_num_list_users', limit: String(perPage), offset: String((pageNumber - 1) * perPage) })
      return page(listPath(`anime/season/${year}/${season.toLowerCase()}`, params), `season:${year}:${season}:${pageNumber}:${perPage}`, pageNumber, perPage)
    },
  }
}
