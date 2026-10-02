import 'server-only'

import {
  catalogBatchSchema,
  apiErrorResponseSchema,
  catalogPageSchema,
  catalogSeasonResponseSchema,
  catalogTitleResponseSchema,
  type CatalogFeed,
  type CatalogBatch,
  type CatalogKind,
  type CatalogRef,
} from '@consumit/contracts'
import { connection } from 'next/server'
import { cache } from 'react'
import type { ZodType } from 'zod'

import { publicCatalogFetchOptions } from './public-catalog-cache'

export class CatalogApiError extends Error {
  readonly code: string
  readonly retryable: boolean
  readonly status: number

  constructor(message: string, options: { cause?: unknown; code: string; retryable: boolean; status: number }) {
    super(message, { cause: options.cause })
    this.name = 'CatalogApiError'
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
      ...(renderMode === 'cached-public' ? publicCatalogFetchOptions() : { cache: 'no-store' as const }),
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(6_000),
    })
  } catch (cause) {
    throw new CatalogApiError('The Consumit catalog service could not be reached.', {
      code: 'CATALOG_UNAVAILABLE',
      retryable: true,
      status: 503,
      cause,
    })
  }

  if (!response.ok) {
    const parsed = apiErrorResponseSchema.safeParse(await response.json().catch(() => null))
    throw new CatalogApiError(
      parsed.success ? parsed.data.error.message : 'The Consumit catalog is temporarily unavailable.',
      {
        code: parsed.success ? parsed.data.error.code : 'CATALOG_UNAVAILABLE',
        retryable: parsed.success ? parsed.data.error.retryable : response.status >= 500,
        status: response.status,
      },
    )
  }

  const parsed = schema.safeParse(await response.json().catch(() => null))
  if (!parsed.success) {
    throw new CatalogApiError('The Consumit catalog returned an invalid response.', {
      code: 'CATALOG_UNAVAILABLE',
      retryable: true,
      status: 503,
    })
  }
  return parsed.data
}

export const getCatalogTitle = cache((kind: CatalogKind, id: number) => (
  request(`/v1/titles/${kind}/${id}`, catalogTitleResponseSchema)
))

/** Public title data for ISR pages. It contains no member or request state. */
export const getCachedCatalogTitle = cache((kind: CatalogKind, id: number) => (
  request(`/v1/titles/${kind}/${id}`, catalogTitleResponseSchema, 'cached-public')
))

export const getCatalogSeason = cache((seriesId: number, season: number) => (
  request(`/v1/titles/series/${seriesId}/seasons/${season}`, catalogSeasonResponseSchema)
))

export const getCachedCatalogSeason = cache((seriesId: number, season: number) => (
  request(`/v1/titles/series/${seriesId}/seasons/${season}`, catalogSeasonResponseSchema, 'cached-public')
))

export const getCatalogBatch = cache((refsKey: string) => (
  request(`/v1/titles/batch?refs=${encodeURIComponent(refsKey)}`, catalogBatchSchema)
))

export const CATALOG_BATCH_SIZE = 24
export const MAX_PAGE_CATALOG_ENRICHMENT = 120
const MAX_CONCURRENT_CATALOG_BATCHES = 3

/**
 * Resolve a bounded set of page references without violating the batch route's
 * 24-title limit or fanning out an unbounded imported library in one render.
 */
export async function getCatalogBatchForRefs(
  refs: readonly CatalogRef[],
  maxTitles = MAX_PAGE_CATALOG_ENRICHMENT,
): Promise<CatalogBatch | null> {
  const unique = [...new Map(refs.map((ref) => [`${ref.kind}:${ref.id}`, ref])).values()]
    .slice(0, Math.max(0, maxTitles))
  if (unique.length === 0) return null

  const chunks: string[] = []
  for (let index = 0; index < unique.length; index += CATALOG_BATCH_SIZE) {
    chunks.push(refsKey(unique.slice(index, index + CATALOG_BATCH_SIZE)))
  }

  const batches: CatalogBatch[] = []
  for (let index = 0; index < chunks.length; index += MAX_CONCURRENT_CATALOG_BATCHES) {
    const wave = await Promise.all(chunks.slice(index, index + MAX_CONCURRENT_CATALOG_BATCHES).map(getCatalogBatch))
    batches.push(...wave)
  }

  const first = batches[0]
  if (!first) return null
  return {
    items: batches.flatMap((batch) => batch.items),
    meta: { ...first.meta, stale: batches.some((batch) => batch.meta.stale) },
    missing: batches.flatMap((batch) => batch.missing),
  }
}

export function getCatalogDiscovery(options: {
  feed: CatalogFeed
  kind: CatalogKind | 'all'
  page?: number
}) {
  const query = new URLSearchParams({
    feed: options.feed,
    kind: options.kind,
    page: String(options.page ?? 1),
  })
  return request(`/v1/titles/discover?${query}`, catalogPageSchema)
}

export function searchCatalog(queryValue: string, kind: CatalogKind | 'all' = 'all', page = 1) {
  const query = new URLSearchParams({ kind, page: String(page), q: queryValue.trim().slice(0, 100) })
  return request(`/v1/titles/search?${query}`, catalogPageSchema)
}

export function refsKey(refs: readonly CatalogRef[]) {
  return refs.map((reference) => `${reference.kind}:${reference.id}`).join(',')
}
