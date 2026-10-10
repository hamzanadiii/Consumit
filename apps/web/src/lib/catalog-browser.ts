import {
  apiErrorResponseSchema,
  catalogBatchSchema,
  catalogPageSchema,
  catalogSeasonResponseSchema,
  catalogTitleResponseSchema,
  type CatalogKind,
  type CatalogFeed,
  type CatalogRef,
  type CatalogTitleSummary,
} from '@consumit/contracts'

export class BrowserCatalogError extends Error {
  readonly retryable: boolean

  constructor(message: string, retryable = true) {
    super(message)
    this.name = 'BrowserCatalogError'
    this.retryable = retryable
  }
}

function errorName(error: unknown) {
  return typeof error === 'object' && error !== null && 'name' in error && typeof error.name === 'string'
    ? error.name
    : undefined
}

async function request(path: string, signal?: AbortSignal) {
  let response: Response
  try {
    const timeout = AbortSignal.timeout(8_000)
    response = await fetch(path, {
      headers: { accept: 'application/json' },
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    })
  } catch (cause) {
    const name = errorName(cause)
    if (name === 'AbortError') throw cause
    throw new BrowserCatalogError(
      name === 'TimeoutError'
        ? 'The catalog took too long to respond.'
        : 'The catalog could not be reached.',
    )
  }

  if (!response.ok) {
    const parsed = apiErrorResponseSchema.safeParse(await response.json().catch(() => null))
    throw new BrowserCatalogError(
      parsed.success ? parsed.data.error.message : 'The catalog is temporarily unavailable.',
      parsed.success ? parsed.data.error.retryable : response.status >= 500,
    )
  }
  return response.json() as Promise<unknown>
}

export async function browserSearchCatalog(
  query: string,
  kind: CatalogKind | 'all' = 'all',
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ kind, q: query.trim().slice(0, 100) })
  const parsed = catalogPageSchema.safeParse(await request(`/v1/titles/search?${params}`, signal))
  if (!parsed.success) throw new BrowserCatalogError('The catalog returned an invalid search response.')
  return parsed.data
}

export async function browserCatalogSeason(
  seriesId: number,
  season: number,
  signal?: AbortSignal,
) {
  const parsed = catalogSeasonResponseSchema.safeParse(await request(`/v1/titles/series/${seriesId}/seasons/${season}`, signal))
  if (!parsed.success) throw new BrowserCatalogError('The catalog returned an invalid season response.')
  return parsed.data
}

export async function browserCatalogBatch(refs: readonly CatalogRef[], signal?: AbortSignal) {
  const params = new URLSearchParams({ refs: refs.map((ref) => `${ref.kind}:${ref.id}`).join(',') })
  const parsed = catalogBatchSchema.safeParse(await request(`/v1/titles/batch?${params}`, signal))
  if (!parsed.success) throw new BrowserCatalogError('The catalog returned an invalid batch response.')
  return parsed.data
}

export async function browserCatalogTitle(ref: CatalogRef, signal?: AbortSignal) {
  const parsed = catalogTitleResponseSchema.safeParse(await request(`/v1/titles/${ref.kind}/${ref.id}`, signal))
  if (!parsed.success || parsed.data.item.id !== ref.id || parsed.data.item.kind !== ref.kind) {
    throw new BrowserCatalogError('The catalog returned an invalid title response.')
  }
  return parsed.data.item
}

/** Resolve at most 120 unique titles, respecting the 24-title route limit and
 * keeping no more than three catalog requests in flight at once. */
export async function browserCatalogBatches(refs: readonly CatalogRef[], signal?: AbortSignal): Promise<CatalogTitleSummary[]> {
  const unique = [...new Map(refs.map((ref) => [`${ref.kind}:${ref.id}`, ref])).values()].slice(0, 120)
  const titles: CatalogTitleSummary[] = []
  for (let start = 0; start < unique.length; start += 72) {
    const requests: Promise<Awaited<ReturnType<typeof browserCatalogBatch>>>[] = []
    for (let offset = start; offset < Math.min(start + 72, unique.length); offset += 24) {
      requests.push(browserCatalogBatch(unique.slice(offset, offset + 24), signal))
    }
    const results = await Promise.all(requests)
    titles.push(...results.flatMap((result) => result.items))
  }
  return titles
}

export type BrowseCatalogQuery = {
  kind: CatalogKind
  feed: CatalogFeed
  genre?: string | undefined
  year?: number | undefined
}

export async function browserDiscoverCatalog(query: BrowseCatalogQuery, page: number, signal?: AbortSignal) {
  const params = new URLSearchParams({ kind: query.kind, feed: query.feed, page: String(page) })
  if (query.genre) params.set('genre', query.genre)
  if (query.year) params.set('year', String(query.year))
  const parsed = catalogPageSchema.safeParse(await request(`/v1/titles/discover?${params}`, signal))
  if (!parsed.success || parsed.data.page !== page || parsed.data.items.some((title) => title.kind !== query.kind)) {
    throw new BrowserCatalogError('The catalog returned an invalid discovery response.')
  }
  return parsed.data
}
