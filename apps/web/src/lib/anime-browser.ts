import {
  apiErrorResponseSchema,
  animePageSchema,
  type AnimeSeason,
} from '@consumit/contracts'

export class BrowserAnimeError extends Error {
  readonly retryable: boolean

  constructor(message: string, retryable = true) {
    super(message)
    this.name = 'BrowserAnimeError'
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
    throw new BrowserAnimeError(
      name === 'TimeoutError'
        ? 'The anime catalog took too long to respond.'
        : 'The anime catalog could not be reached.',
    )
  }

  if (!response.ok) {
    const parsed = apiErrorResponseSchema.safeParse(await response.json().catch(() => null))
    throw new BrowserAnimeError(
      parsed.success ? parsed.data.error.message : 'The anime catalog is temporarily unavailable.',
      parsed.success ? parsed.data.error.retryable : response.status >= 500,
    )
  }
  return response.json() as Promise<unknown>
}

export async function browserAnimeSeasonal(season: AnimeSeason, year: number, page: number, signal?: AbortSignal) {
  const parsed = animePageSchema.safeParse(await request(`/v1/anime/seasonal/${season}/${year}?page=${page}`, signal))
  if (!parsed.success) throw new BrowserAnimeError('The anime catalog returned an invalid response.')
  return parsed.data
}

export async function browserAnimeTrending(page: number, signal?: AbortSignal) {
  const parsed = animePageSchema.safeParse(await request(`/v1/anime/trending?page=${page}`, signal))
  if (!parsed.success) throw new BrowserAnimeError('The anime catalog returned an invalid response.')
  return parsed.data
}
