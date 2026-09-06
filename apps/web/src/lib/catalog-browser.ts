import {
  catalogErrorResponseSchema,
  catalogPageSchema,
  catalogSeasonResponseSchema,
  type CatalogKind,
} from '@consumit/contracts'

export class BrowserCatalogError extends Error {
  readonly retryable: boolean

  constructor(message: string, retryable = true) {
    super(message)
    this.name = 'BrowserCatalogError'
    this.retryable = retryable
  }
}

async function request(url: URL, signal?: AbortSignal) {
  let response: Response
  try {
    response = await fetch(url, {
      headers: { accept: 'application/json' },
      ...(signal ? { signal } : {}),
    })
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause
    throw new BrowserCatalogError('The catalog could not be reached.')
  }

  if (!response.ok) {
    const parsed = catalogErrorResponseSchema.safeParse(await response.json().catch(() => null))
    throw new BrowserCatalogError(
      parsed.success ? parsed.data.error.message : 'The catalog is temporarily unavailable.',
      parsed.success ? parsed.data.error.retryable : response.status >= 500,
    )
  }
  return response.json() as Promise<unknown>
}

export async function browserSearchCatalog(
  apiBase: string,
  query: string,
  kind: CatalogKind | 'all' = 'all',
  signal?: AbortSignal,
) {
  const url = new URL('/v1/titles/search', `${apiBase}/`)
  url.searchParams.set('q', query.trim().slice(0, 100))
  url.searchParams.set('kind', kind)
  const parsed = catalogPageSchema.safeParse(await request(url, signal))
  if (!parsed.success) throw new BrowserCatalogError('The catalog returned an invalid search response.')
  return parsed.data
}

export async function browserCatalogSeason(
  apiBase: string,
  seriesId: number,
  season: number,
  signal?: AbortSignal,
) {
  const url = new URL(`/v1/titles/series/${seriesId}/seasons/${season}`, `${apiBase}/`)
  const parsed = catalogSeasonResponseSchema.safeParse(await request(url, signal))
  if (!parsed.success) throw new BrowserCatalogError('The catalog returned an invalid season response.')
  return parsed.data
}
