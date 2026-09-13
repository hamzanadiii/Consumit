import { z } from 'zod'

import {
  animeDetailResponseSchema,
  animePageSchema,
  type AnimeDetail,
  type AnimeRelationType,
} from '@consumit/contracts'

import type { Anilist, AnimeSearchQuery } from './anilist.ts'
import { AnilistError } from './errors.ts'
import { StaleCache, type CachePolicy } from '../catalog/stale-cache.ts'
import { lookupTitlesFor, mediaIdentityForAnime } from './shared.ts'

const endpoint = 'https://graphql.anilist.co'
const requestTimeoutMs = 8_000

const cachePolicies = {
  detail: { freshForMs: 21_600_000, staleForMs: 604_800_000 },
  search: { freshForMs: 600_000, staleForMs: 3_600_000 },
} satisfies Record<string, CachePolicy>

const httpsUrl = z.string().max(4096).refine((value) => /^https:\/\//.test(value))
const nullableHttpsUrl = httpsUrl.nullable().catch(null)

const anilistTitleSchema = z.object({
  romaji: z.string().nullable().catch(null),
  english: z.string().nullable().catch(null),
  native: z.string().nullable().catch(null),
}).catch({ romaji: null, english: null, native: null })

const anilistRelationNodeSchema = z.object({
  id: z.number().int().positive(),
  title: anilistTitleSchema,
  format: z.string().nullable().catch(null),
  status: z.string().nullable().catch(null),
})

const anilistRelationEdgeSchema = z.object({
  relationType: z.string().catch('OTHER'),
  node: anilistRelationNodeSchema,
})

const anilistMediaSchema = z.object({
  id: z.number().int().positive(),
  idMal: z.number().int().positive().nullable().catch(null),
  title: anilistTitleSchema,
  description: z.string().nullable().catch(null),
  coverImage: z.object({ large: nullableHttpsUrl.optional() }).catch({}),
  bannerImage: nullableHttpsUrl.optional(),
  format: z.string().nullable().catch(null),
  status: z.string().nullable().catch(null),
  season: z.string().nullable().catch(null),
  seasonYear: z.number().int().min(1900).max(2200).nullable().catch(null),
  episodes: z.number().int().nonnegative().nullable().catch(null),
  averageScore: z.number().int().min(0).max(100).nullable().catch(null),
  genres: z.array(z.string()).catch([]),
  tags: z.array(z.object({ name: z.string().min(1) })).catch([]),
  relations: z.object({ edges: z.array(anilistRelationEdgeSchema).catch([]) }).catch({ edges: [] }),
})

const anilistPageSchema = z.object({
  data: z.object({
    Page: z.object({
      media: z.array(anilistMediaSchema),
    }),
  }),
})

const anilistSingleSchema = z.object({
  data: z.object({
    Media: anilistMediaSchema.nullable(),
  }),
})

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export type AnilistAdapterOptions = {
  cache?: StaleCache | undefined
  fetch?: FetchLike | undefined
  sleep?: ((milliseconds: number) => Promise<void>) | undefined
}

const DETAIL_QUERY = `query($id:Int){
  Media(id:$id,type:ANIME){
    id idMal title{romaji english native} description coverImage{large} bannerImage
    format status season seasonYear episodes averageScore genres tags{name rank}
    relations{edges{relationType node{id title{romaji english native} format status}}}
  }
}`

const SEARCH_QUERY = `query($search:String,$page:Int,$perPage:Int){
  Page(page:$page,perPage:$perPage){
    media(search:$search,type:ANIME,sort:SEARCH_MATCH){
      id idMal title{romaji english native} description coverImage{large} bannerImage
      format status season seasonYear episodes averageScore genres tags{name rank}
      relations{edges{relationType node{id title{romaji english native} format status}}}
    }
  }
}`

function relationTypeOf(raw: string): AnimeRelationType {
  const normalized = raw.trim().toLocaleLowerCase('en-US')
  switch (normalized) {
    case 'sequel': return 'sequel'
    case 'prequel': return 'prequel'
    case 'parent': return 'parent'
    case 'side_story': return 'side_story'
    case 'spin_off': case 'spinoff': return 'spin_off'
    case 'adaptation': return 'adaptation'
    case 'alternative': return 'alternative'
    case 'character': return 'character'
    case 'summary': return 'summary'
    default: return 'other'
  }
}

function plainText(html: string | null): string {
  if (!html) return ''
  return html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/?(i|b|em|strong)>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2000)
}

function displayTitle(titles: { romaji: string | null; english: string | null; native: string | null }, fallbackId: number) {
  return titles.english?.trim() || titles.romaji?.trim() || titles.native?.trim() || `Anime ${fallbackId}`
}

function normalizeDetail(raw: z.infer<typeof anilistMediaSchema>): AnimeDetail {
  const titles = {
    romaji: raw.title.romaji?.trim() || null,
    english: raw.title.english?.trim() || null,
    native: raw.title.native?.trim() || null,
  }
  return {
    anilistId: raw.id,
    identity: mediaIdentityForAnime({ anilistId: raw.id, malId: raw.idMal }),
    title: displayTitle(titles, raw.id),
    titles,
    coverUrl: raw.coverImage?.large ?? null,
    bannerUrl: raw.bannerImage ?? null,
    format: raw.format,
    status: raw.status,
    seasonYear: raw.seasonYear,
    season: raw.season,
    episodes: raw.episodes,
    averageScore: raw.averageScore,
    genres: raw.genres.slice(0, 12),
    description: plainText(raw.description),
    tags: raw.tags.map((tag) => tag.name).slice(0, 20),
    relations: raw.relations.edges.slice(0, 50).map((edge) => ({
      relationType: relationTypeOf(edge.relationType),
      anilistId: edge.node.id,
      title: displayTitle({
        romaji: edge.node.title.romaji ?? null,
        english: edge.node.title.english ?? null,
        native: edge.node.title.native ?? null,
      }, edge.node.id),
      format: edge.node.format,
      status: edge.node.status,
    })),
    malId: raw.idMal,
  }
}

export function createAnilistAdapter({
  cache = new StaleCache(),
  fetch: fetchImpl = fetch,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
}: AnilistAdapterOptions = {}): Anilist {
  async function query<T>(body: unknown): Promise<T> {
    const deadline = Date.now() + requestTimeoutMs
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let response: Response
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: { accept: 'application/json', 'content-type': 'application/json' },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
        })
      } catch (error) {
        if (attempt === 0 && deadline - Date.now() > 250) {
          await sleep(250)
          continue
        }
        throw new AnilistError('CATALOG_UNAVAILABLE', 'AniList did not respond in time.', {
          cause: error, retryable: true, statusCode: 503,
        })
      }
      if (response.status === 404) {
        throw new AnilistError('CATALOG_NOT_FOUND', 'The requested anime was not found.', { statusCode: 404 })
      }
      if (response.status === 429 || response.status >= 500) {
        if (attempt === 0) {
          const retryAfter = Number(response.headers.get('retry-after')) * 1000
          await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 2000) : 500)
          continue
        }
        throw new AnilistError('CATALOG_UNAVAILABLE', 'AniList is temporarily unavailable.', {
          retryable: true, statusCode: 503,
        })
      }
      if (!response.ok) {
        throw new AnilistError('CATALOG_UNAVAILABLE', 'AniList is temporarily unavailable.', {
          retryable: false, statusCode: 503,
        })
      }
      try {
        const json = await response.json() as unknown
        if (typeof json === 'object' && json !== null && 'errors' in json) {
          const errors = (json as { errors?: Array<{ message?: string }> }).errors
          const notFound = errors?.some((entry) => /not found/i.test(entry.message ?? ''))
          throw new AnilistError(
            notFound ? 'CATALOG_NOT_FOUND' : 'CATALOG_UNAVAILABLE',
            notFound ? 'The requested anime was not found.' : 'AniList returned an error.',
            { statusCode: notFound ? 404 : 503, retryable: !notFound },
          )
        }
        return json as T
      } catch (error) {
        if (error instanceof AnilistError) throw error
        throw new AnilistError('CATALOG_UNAVAILABLE', 'AniList returned unreadable data.', {
          cause: error, retryable: true, statusCode: 503,
        })
      }
    }
    throw new AnilistError('CATALOG_UNAVAILABLE', 'AniList is temporarily unavailable.', {
      retryable: true, statusCode: 503,
    })
  }

  return {
    lookupTitles: lookupTitlesFor,
    async anime(anilistId: number) {
      const cached = await cache.get<AnimeDetail>(`anilist:anime:${anilistId}`, cachePolicies.detail, async () => {
        const json = await query<unknown>( { query: DETAIL_QUERY, variables: { id: anilistId } })
        const parsed = anilistSingleSchema.safeParse(json)
        if (!parsed.success || !parsed.data.data.Media) {
          throw new AnilistError('CATALOG_NOT_FOUND', 'The requested anime was not found.', { statusCode: 404 })
        }
        // Upstream output is hostile: prove the normalized contract before caching.
        return animeDetailResponseSchema.parse({
          item: normalizeDetail(parsed.data.data.Media),
          meta: { fetchedAt: new Date().toISOString(), source: 'anilist', stale: false },
        }).item
      })
      return { item: cached.value, meta: { fetchedAt: cached.fetchedAt.toISOString(), stale: cached.stale } }
    },
    async searchAnime(search: AnimeSearchQuery) {
      const normalized = search.query.trim().slice(0, 100)
      if (!normalized) {
        throw new AnilistError('CATALOG_INVALID_QUERY', 'Search queries must contain visible characters.', { statusCode: 400 })
      }
      const key = `anilist:search:${search.page}:${normalized.toLocaleLowerCase('en-US')}`
      const cached = await cache.get(key, cachePolicies.search, async () => {
        const json = await query<unknown>({
          query: SEARCH_QUERY,
          variables: { search: normalized, page: search.page, perPage: 20 },
        })
        const parsed = anilistPageSchema.safeParse(json)
        if (!parsed.success) {
          throw new AnilistError('CATALOG_UNAVAILABLE', 'AniList returned an invalid search page.', {
            cause: parsed.error, retryable: true, statusCode: 503,
          })
        }
        const items = parsed.data.data.Page.media.map(normalizeDetail)
        return animePageSchema.parse({
          items: items.map(({ description: _description, tags: _tags, season: _season, relations: _relations, malId: _malId, ...summary }) => summary),
          meta: { fetchedAt: new Date().toISOString(), source: 'anilist', stale: false },
          page: search.page,
          totalResults: items.length,
        })
      })
      return cached.value
    },
  }
}
