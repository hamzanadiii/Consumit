import {
  animeEpisodeSchema,
  animeSearchResultSchema,
  apiErrorResponseSchema,
  animePageSchema,
  type AnimeBrowseQuery,
  type AnimeEpisode,
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

async function request(path: string, signal?: AbortSignal, timeoutMs = 8_000) {
  let response: Response
  try {
    const timeout = AbortSignal.timeout(timeoutMs)
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

/** Server-driven anime discovery: sort plus genre, year, and format filters. */
export async function browserAnimeBrowse(query: AnimeBrowseQuery, signal?: AbortSignal) {
  const params = new URLSearchParams({ sort: query.sort, page: String(query.page) })
  if (query.genre) params.set('genre', query.genre)
  if (query.year !== undefined) params.set('year', String(query.year))
  if (query.format) params.set('format', query.format)
  const parsed = animePageSchema.safeParse(await request(`/v1/anime/browse?${params}`, signal))
  if (!parsed.success) throw new BrowserAnimeError('The anime catalog returned an invalid response.')
  return parsed.data
}

/** AniList title search for the command palette and other browser surfaces.
 *  TMDB never serves anime, so this stays a separate best-effort call. */
export async function browserSearchAnime(query: string, page = 1, signal?: AbortSignal) {
  const params = new URLSearchParams({ q: query.trim().slice(0, 100), page: String(page) })
  const parsed = animeSearchResultSchema.safeParse(await request(`/v1/anime/search?${params}`, signal))
  if (!parsed.success) throw new BrowserAnimeError('The anime catalog returned an invalid response.')
  return parsed.data
}

/** Canonical episode metadata (Kitsu title/synopsis/still) for one anime
 *  episode. Null on any miss — callers fall back to streaming thumbnails,
 *  then the honest placeholder. */
export async function browserAnimeEpisode(anilistId: number, episode: number, signal?: AbortSignal): Promise<AnimeEpisode | null> {
  let response: Response
  try {
    response = await fetch(`/v1/anime/${anilistId}/episodes/${episode}`, {
      headers: { accept: 'application/json' },
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8_000)]) : AbortSignal.timeout(8_000),
    })
  } catch {
    return null
  }
  if (!response.ok) return null
  const parsed = animeEpisodeSchema.safeParse(await response.json().catch(() => null))
  return parsed.success ? parsed.data : null
}

export async function browserAnimeEpisodes(anilistId: number, numbers: number[], signal?: AbortSignal): Promise<(AnimeEpisode | null)[]> {
  if (numbers.length === 0) return []
  if (numbers.length > 24 || !numbers.every((number) => Number.isInteger(number) && number > 0 && number <= 10000)) throw new BrowserAnimeError('Choose up to 24 valid episodes.', false)
  const raw = await request(`/v1/anime/${anilistId}/episodes?numbers=${numbers.join(',')}`, signal, 12_000)
  const parsed = animeEpisodeSchema.nullable().array().length(numbers.length).safeParse((raw as { episodes?: unknown })?.episodes)
  if (!parsed.success) throw new BrowserAnimeError('The anime catalog returned invalid episode details.')
  return parsed.data
}
