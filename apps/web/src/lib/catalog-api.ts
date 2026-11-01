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
  type CatalogTitleSummary,
} from '@consumit/contracts'
import { connection } from 'next/server'
import { cache } from 'react'
import type { ZodType } from 'zod'

import { publicCatalogFetchOptions, PUBLIC_CATALOG_REQUEST_TIMEOUT_MS } from './public-catalog-cache'

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
      ...publicCatalogFetchOptions(),
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(PUBLIC_CATALOG_REQUEST_TIMEOUT_MS),
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

export type CatalogBatchResolution = Pick<CatalogBatch, 'items' | 'meta' | 'missing'> & {
  unavailable: boolean
}

/**
 * Resolve a bounded set of page references without violating the batch route's
 * 24-title limit or fanning out an unbounded imported library in one render.
 */
export async function getCatalogBatchForRefs(
  refs: readonly CatalogRef[],
  maxTitles = MAX_PAGE_CATALOG_ENRICHMENT,
): Promise<CatalogBatchResolution | null> {
  const unique = [...new Map(refs.map((ref) => [`${ref.kind}:${ref.id}`, ref])).values()]
    .slice(0, Math.max(0, maxTitles))
  if (unique.length === 0) return null

  // Keep AniList failures from rejecting TMDB references in the same view.
  const bySource = new Map<string, CatalogRef[]>()
  for (const ref of unique) {
    const source = ref.kind === 'anime' ? 'anilist' : 'tmdb'
    bySource.set(source, [...(bySource.get(source) ?? []), ref])
  }
  const chunks = [...bySource.values()].flatMap((group) => {
    const result: CatalogRef[][] = []
    for (let index = 0; index < group.length; index += CATALOG_BATCH_SIZE) {
      result.push(group.slice(index, index + CATALOG_BATCH_SIZE))
    }
    return result
  })

  const batches: CatalogBatch[] = []
  const failedRefs: CatalogRef[] = []
  let firstError: unknown
  for (let index = 0; index < chunks.length; index += MAX_CONCURRENT_CATALOG_BATCHES) {
    const wave = await Promise.allSettled(chunks.slice(index, index + MAX_CONCURRENT_CATALOG_BATCHES).map((chunk) => getCatalogBatch(refsKey(chunk))))
    wave.forEach((result, offset) => {
      if (result.status === 'fulfilled') batches.push(result.value)
      else {
        firstError ??= result.reason
        failedRefs.push(...chunks[index + offset]!)
      }
    })
  }

  type FallbackResult = { item: CatalogTitleSummary; meta: CatalogBatch['meta'] } | { missing: CatalogRef; meta: CatalogBatch['meta'] }
  const resolveReference = async (ref: CatalogRef): Promise<FallbackResult> => {
    let batchError: unknown
    try {
      const batch = await getCatalogBatch(refsKey([ref]))
      const item = batch.items.find((title) => title.id === ref.id && title.kind === ref.kind)
      if (item) return { item, meta: batch.meta }
      if (batch.missing.some((missing) => missing.id === ref.id && missing.kind === ref.kind)) return { missing: ref, meta: batch.meta }
    } catch (error) {
      batchError = error
    }

    if (ref.kind === 'anime') {
      if (batchError) throw batchError
      throw new CatalogApiError('The catalog did not resolve this anime reference.', { code: 'CATALOG_UNAVAILABLE', retryable: true, status: 503 })
    }
    try {
      const response = await getCatalogTitle(ref.kind, ref.id)
      if (response.item.id !== ref.id || response.item.kind !== ref.kind) {
        throw new CatalogApiError('The Consumit catalog returned a different title than requested.', {
          code: 'CATALOG_UNAVAILABLE', retryable: true, status: 503,
        })
      }
      return { item: response.item, meta: response.meta }
    } catch (error) {
      throw batchError ?? error
    }
  }

  const fallbackResults: PromiseSettledResult<FallbackResult>[] = []
  let fallbackRefs = failedRefs
  let stoppedFallbacks = false
  for (let index = 0; index < failedRefs.length; index += MAX_CONCURRENT_CATALOG_BATCHES) {
    const waveRefs = failedRefs.slice(index, index + MAX_CONCURRENT_CATALOG_BATCHES)
    const wave = await Promise.allSettled(waveRefs.map(resolveReference))
    fallbackResults.push(...wave)
    const allUnavailable = wave.length === MAX_CONCURRENT_CATALOG_BATCHES && wave.every((result) => (
      result.status === 'rejected' && !(result.reason instanceof CatalogApiError && result.reason.status === 404)
    ))
    if (allUnavailable) {
      fallbackRefs = failedRefs.slice(0, fallbackResults.length)
      stoppedFallbacks = fallbackResults.length < failedRefs.length
      break
    }
  }
  const fallbackTitles: CatalogTitleSummary[] = []
  const fallbackMissing: CatalogRef[] = []
  const fallbackMeta = [] as Array<Awaited<ReturnType<typeof getCatalogTitle>>['meta']>
  let unavailable = stoppedFallbacks
  for (let index = 0; index < fallbackResults.length; index += 1) {
    const result = fallbackResults[index]!
    if (result.status === 'fulfilled') {
      if ('item' in result.value) fallbackTitles.push(result.value.item)
      else fallbackMissing.push(result.value.missing)
      fallbackMeta.push(result.value.meta)
    } else if (result.reason instanceof CatalogApiError && result.reason.status === 404) {
      fallbackMissing.push(fallbackRefs[index]!)
    } else {
      unavailable = true
    }
  }

  const meta = batches[0]?.meta ?? fallbackMeta[0]
  if (!meta) {
    if (firstError && unavailable) throw firstError
    return null
  }
  const requested = new Set(unique.map((ref) => `${ref.kind}:${ref.id}`))
  const byRef = new Map<string, CatalogTitleSummary>()
  for (const title of [...batches.flatMap((batch) => batch.items), ...fallbackTitles]) {
    const key = `${title.kind}:${title.id}`
    if (requested.has(key)) byRef.set(key, title)
  }
  const missingByRef = new Map<string, CatalogRef>()
  for (const ref of [...batches.flatMap((batch) => batch.missing), ...fallbackMissing]) {
    const key = `${ref.kind}:${ref.id}`
    if (requested.has(key)) missingByRef.set(key, ref)
  }
  return {
    items: unique.flatMap((ref) => {
      const title = byRef.get(`${ref.kind}:${ref.id}`)
      return title ? [title] : []
    }),
    meta: { ...meta, stale: [...batches.map((batch) => batch.meta), ...fallbackMeta].some((entry) => entry.stale) },
    missing: [...missingByRef.values()],
    unavailable,
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
