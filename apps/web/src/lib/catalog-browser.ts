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
  readonly status: number | undefined

  constructor(message: string, retryable = true, status?: number) {
    super(message)
    this.name = 'BrowserCatalogError'
    this.retryable = retryable
    this.status = status
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
      response.status,
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

export type BrowserCatalogResolution = {
  titles: CatalogTitleSummary[]
  missing: CatalogRef[]
  unavailable: boolean
}

type BrowserFallbackResult =
  | { item: CatalogTitleSummary }
  | { missing: CatalogRef }

const CATALOG_BATCH_SIZE = 24
const MAX_CONCURRENT_CATALOG_BATCHES = 3

/** Resolve as much artwork as possible when one source or reference is unavailable. */
export async function browserCatalogTitlesForRefs(refs: readonly CatalogRef[], signal?: AbortSignal): Promise<BrowserCatalogResolution> {
  const unique = [...new Map(refs.map((ref) => [`${ref.kind}:${ref.id}`, ref])).values()].slice(0, 120)
  const bySource = new Map<string, CatalogRef[]>()
  for (const ref of unique) {
    const source = ref.kind === 'anime' ? 'anilist' : 'tmdb'
    bySource.set(source, [...(bySource.get(source) ?? []), ref])
  }
  const chunks = [...bySource.values()].flatMap((group) => {
    const result: CatalogRef[][] = []
    for (let index = 0; index < group.length; index += CATALOG_BATCH_SIZE) result.push(group.slice(index, index + CATALOG_BATCH_SIZE))
    return result
  })

  const batches: Awaited<ReturnType<typeof browserCatalogBatch>>[] = []
  const failedRefs: CatalogRef[] = []
  for (let index = 0; index < chunks.length; index += MAX_CONCURRENT_CATALOG_BATCHES) {
    const wave = await Promise.allSettled(chunks.slice(index, index + MAX_CONCURRENT_CATALOG_BATCHES).map((chunk) => browserCatalogBatch(chunk, signal)))
    wave.forEach((result, offset) => {
      if (result.status === 'fulfilled') batches.push(result.value)
      else failedRefs.push(...chunks[index + offset]!)
    })
  }
  if (signal?.aborted) throw new DOMException('The catalog request was aborted.', 'AbortError')

  const resolveReference = async (ref: CatalogRef): Promise<BrowserFallbackResult> => {
    let batchError: unknown
    try {
      const batch = await browserCatalogBatch([ref], signal)
      const item = batch.items.find((title) => title.id === ref.id && title.kind === ref.kind)
      if (item) return { item }
      if (batch.missing.some((missing) => missing.id === ref.id && missing.kind === ref.kind)) return { missing: ref }
    } catch (error) {
      batchError = error
    }
    if (ref.kind === 'anime') {
      if (batchError) throw batchError
      throw new BrowserCatalogError('The catalog did not resolve this anime reference.')
    }
    try { return { item: await browserCatalogTitle(ref, signal) } }
    catch (error) { throw batchError ?? error }
  }

  const fallbackResults: PromiseSettledResult<BrowserFallbackResult>[] = []
  let fallbackRefs = failedRefs
  let stoppedFallbacks = false
  for (let index = 0; index < failedRefs.length; index += MAX_CONCURRENT_CATALOG_BATCHES) {
    const waveRefs = failedRefs.slice(index, index + MAX_CONCURRENT_CATALOG_BATCHES)
    const wave = await Promise.allSettled(waveRefs.map(resolveReference))
    if (signal?.aborted) throw new DOMException('The catalog request was aborted.', 'AbortError')
    fallbackResults.push(...wave)
    const allUnavailable = wave.length === MAX_CONCURRENT_CATALOG_BATCHES && wave.every((result) => (
      result.status === 'rejected' && !(result.reason instanceof BrowserCatalogError && result.reason.status === 404)
    ))
    if (allUnavailable) {
      fallbackRefs = failedRefs.slice(0, fallbackResults.length)
      stoppedFallbacks = fallbackResults.length < failedRefs.length
      break
    }
  }
  const fallbackTitles: CatalogTitleSummary[] = []
  const fallbackMissing: CatalogRef[] = []
  let unavailable = stoppedFallbacks
  for (let index = 0; index < fallbackResults.length; index += 1) {
    const result = fallbackResults[index]!
    if (result.status === 'fulfilled') {
      if ('item' in result.value) fallbackTitles.push(result.value.item)
      else fallbackMissing.push(result.value.missing)
    }
    else if (result.reason instanceof BrowserCatalogError && result.reason.status === 404) fallbackMissing.push(fallbackRefs[index]!)
    else if (errorName(result.reason) !== 'AbortError') unavailable = true
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
    titles: unique.flatMap((ref) => {
      const title = byRef.get(`${ref.kind}:${ref.id}`)
      return title ? [title] : []
    }),
    missing: [...missingByRef.values()],
    unavailable,
  }
}

/** Resolve at most 120 unique titles, respecting the 24-title route limit and
 * keeping no more than three catalog requests in flight at once. */
export async function browserCatalogBatches(refs: readonly CatalogRef[], signal?: AbortSignal): Promise<CatalogTitleSummary[]> {
  return (await browserCatalogTitlesForRefs(refs, signal)).titles
}

export type BrowseCatalogFeed = 'popular' | 'top-rated' | 'trending'

export function catalogBrowseFeed(value: string | string[] | undefined): BrowseCatalogFeed {
  return value === 'top-rated' || value === 'trending' ? value : 'popular'
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
