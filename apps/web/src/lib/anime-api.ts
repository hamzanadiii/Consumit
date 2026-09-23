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
  type AnimeSeason,
} from '@consumit/contracts'
import { connection } from 'next/server'
import { cache } from 'react'
import type { ZodType } from 'zod'

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

async function request<T>(path: string, schema: ZodType<T>): Promise<T> {
  await connection()

  let response: Response
  try {
    response = await fetch(`${apiBaseUrl()}${path}`, {
      cache: 'no-store',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(6_000),
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

export const getAnimeTitle = cache((anilistId: number) => (
  request(`/v1/anime/${anilistId}`, animeTitleDetailSchema)
))

export const getAnimeRelations = cache((anilistId: number) => (
  request(`/v1/anime/${anilistId}/relations`, animeFranchiseSchema)
))

export const getAnimeAiring = cache((anilistId: number) => (
  request(`/v1/anime/${anilistId}/airing`, animeAiringScheduleSchema)
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
export async function getAnimeMatch(title: string, originalTitle: string | null, year: number | null): Promise<number | null> {
  const params = new URLSearchParams({ title: title.trim().slice(0, 200) })
  if (originalTitle?.trim()) params.set('originalTitle', originalTitle.trim().slice(0, 200))
  if (year !== null) params.set('year', String(year))
  try {
    const { anilistId } = await request(`/v1/anime/match?${params}`, animeMatchSchema)
    return anilistId
  } catch {
    return null
  }
}
