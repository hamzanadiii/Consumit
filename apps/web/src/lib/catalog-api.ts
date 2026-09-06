import 'server-only'

import {
  catalogBatchSchema,
  catalogErrorResponseSchema,
  catalogPageSchema,
  catalogSeasonResponseSchema,
  catalogTitleResponseSchema,
  type CatalogFeed,
  type CatalogKind,
  type CatalogRef,
} from '@consumit/contracts'
import { connection } from 'next/server'
import { cache } from 'react'
import type { ZodType } from 'zod'

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
    throw new CatalogApiError('The Consumit catalog service could not be reached.', {
      code: 'CATALOG_UNAVAILABLE',
      retryable: true,
      status: 503,
      cause,
    })
  }

  if (!response.ok) {
    const parsed = catalogErrorResponseSchema.safeParse(await response.json().catch(() => null))
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

export const getCatalogSeason = cache((seriesId: number, season: number) => (
  request(`/v1/titles/series/${seriesId}/seasons/${season}`, catalogSeasonResponseSchema)
))

export const getCatalogBatch = cache((refsKey: string) => (
  request(`/v1/titles/batch?refs=${encodeURIComponent(refsKey)}`, catalogBatchSchema)
))

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

export function publicCatalogApiUrl() {
  return (process.env.NEXT_PUBLIC_CONSUMIT_API_URL ?? 'http://127.0.0.1:3001').replace(/\/$/, '')
}
