import 'server-only'

import {
  animeAiringScheduleSchema,
  animeBatchSchema,
  animeFranchiseSchema,
  animeMatchSchema,
  animePageSchema,
  animeSearchResultSchema,
  animeTitleDetailSchema,
  apiErrorResponseSchema,
  type AnimeBrowseQuery,
  type AnimeSeason,
} from '@consumit/contracts'
import { connection } from 'next/server'
import { cache } from 'react'
import type { ZodType } from 'zod'

import { publicCatalogFetchOptions, PUBLIC_CATALOG_REQUEST_TIMEOUT_MS } from './public-catalog-cache'

export class AnimeApiError extends Error {
  readonly code: string
  readonly retryable: boolean
  readonly status: number

  constructor(message: string, options: { cause?: unknown; code: string; retryable: boolean; status: number }) {
    super(message, { cause: options.cause })
    this.name = 'AnimeApiError'
    this.code = options.code
    this.retryable = options.retryable
    this.status = options.status
  }
}

function apiBaseUrl() {
  return (process.env.CONSUMIT_API_URL ?? 'http://127.0.0.1:3001').replace(/\/$/, '')
}

type RenderMode = 'request' | 'cached-public'

async function request<T>(path: string, schema: ZodType<T>, renderMode: RenderMode = 'request'): Promise<T> {
  if (renderMode === 'request') await connection()

  let response: Response
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, {
      ...publicCatalogFetchOptions(),
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(PUBLIC_CATALOG_REQUEST_TIMEOUT_MS),
    })
  } catch (cause) {
    throw new AnimeApiError('The Consumit anime catalog could not be reached.', {
      cause,
      code: 'ANILIST_UNAVAILABLE',
      retryable: true,
      status: 503,
    })
  }

  if (!response.ok) {
    const parsed = apiErrorResponseSchema.safeParse(await response.json().catch(() => null))
    throw new AnimeApiError(
      parsed.success ? parsed.data.error.message : 'The Consumit anime catalog is temporarily unavailable.',
      {
        code: parsed.success ? parsed.data.error.code : 'ANILIST_UNAVAILABLE',
        retryable: parsed.success ? parsed.data.error.retryable : response.status >= 500,
        status: response.status,
      },
    )
  }

  const parsed = schema.safeParse(await response.json().catch(() => null))
  if (!parsed.success) {
    throw new AnimeApiError('The Consumit anime catalog returned an invalid response.', {
      code: 'ANILIST_UNAVAILABLE',
      retryable: true,
      status: 503,
    })
  }
  return parsed.data
}

export function getAnimeTrending(page = 1) {
  return request(`/v1/anime/trending?page=${page}`, animePageSchema)
}

export function getAnimeSeasonal(season: AnimeSeason, year: number, page = 1) {
  return request(`/v1/anime/seasonal/${season}/${year}?page=${page}`, animePageSchema)
}

/** Server-driven anime discovery for the browse grid. */
export function getAnimeBrowse(query: AnimeBrowseQuery) {
  const params = new URLSearchParams({ sort: query.sort, page: String(query.page) })
  if (query.genre) params.set('genre', query.genre)
  if (query.year !== undefined) params.set('year', String(query.year))
  if (query.format) params.set('format', query.format)
  return request(`/v1/anime/browse?${params}`, animePageSchema)
}

export const getAnimeTitle = cache((anilistId: number) => (
  request(`/v1/anime/${anilistId}`, animeTitleDetailSchema)
))

/** Public AniList detail used by the cacheable title route. */
export const getCachedAnimeTitle = cache((anilistId: number) => (
  request(`/v1/anime/${anilistId}`, animeTitleDetailSchema, 'cached-public')
))

export const getAnimeRelations = cache((anilistId: number) => (
  request(`/v1/anime/${anilistId}/relations`, animeFranchiseSchema)
))

export const getCachedAnimeRelations = cache((anilistId: number) => (
  request(`/v1/anime/${anilistId}/relations`, animeFranchiseSchema, 'cached-public')
))

export const getAnimeAiring = cache((anilistId: number) => (
  request(`/v1/anime/${anilistId}/airing`, animeAiringScheduleSchema)
))

export const getCachedAnimeAiring = cache((anilistId: number) => (
  request(`/v1/anime/${anilistId}/airing`, animeAiringScheduleSchema, 'cached-public')
))

export function searchAnime(query: string, page = 1) {
  const params = new URLSearchParams({ q: query.trim().slice(0, 100), page: String(page) })
  return request(`/v1/anime/search?${params}`, animeSearchResultSchema)
}

export function getAnimeBatch(ids: number[]) {
  return request(`/v1/anime/batch?ids=${ids.join(',')}`, animeBatchSchema)
}

/** Confident AniList match for a TMDB title, or null when nothing matches.
 *  Misses (including 404s) are normal — the caller keeps its honest page. */
async function matchAnimeTitle(
  title: string,
  originalTitle: string | null,
  year: number | null,
  renderMode: RenderMode,
): Promise<number | null> {
  const params = new URLSearchParams({ title: title.trim().slice(0, 200) })
  if (originalTitle?.trim()) params.set('originalTitle', originalTitle.trim().slice(0, 200))
  if (year !== null) params.set('year', String(year))
  try {
    const { anilistId } = await request(`/v1/anime/match?${params}`, animeMatchSchema, renderMode)
    return anilistId
  } catch {
    return null
  }
}

export function getAnimeMatch(title: string, originalTitle: string | null, year: number | null) {
  return matchAnimeTitle(title, originalTitle, year, 'request')
}

export function getCachedAnimeMatch(title: string, originalTitle: string | null, year: number | null) {
  return matchAnimeTitle(title, originalTitle, year, 'cached-public')
}
