import {
  catalogBatchSchema,
  catalogPageSchema,
  catalogSeasonResponseSchema,
  catalogTitleResponseSchema,
  type CatalogKind,
  type CatalogPerson,
  type CatalogRef,
  type CatalogResponseMeta,
  type CatalogTitleDetail,
  type CatalogTitleSummary,
} from '@consumit/contracts'
import { z } from 'zod'

import type {
  Catalog,
  DiscoverCatalogQuery,
  SearchCatalogQuery,
} from './catalog.ts'
import { CatalogError } from './errors.ts'
import { StaleCache, type CachePolicy, type CachedValue } from './stale-cache.ts'

const tmdbBaseUrl = 'https://api.themoviedb.org/3'
const imageHostname = 'image.tmdb.org'
const requestTimeoutMs = 5_000

const cachePolicies = {
  configuration: { freshForMs: 86_400_000, staleForMs: null },
  detail: { freshForMs: 21_600_000, staleForMs: null },
  discover: { freshForMs: 900_000, staleForMs: 86_400_000 },
  search: { freshForMs: 300_000, staleForMs: 3_600_000 },
} satisfies Record<string, CachePolicy>

const nullableString = z.string().nullish().transform((value) => value ?? null)
const nonNegativeNumber = z.number().nonnegative().catch(0)
const nonNegativeInteger = z.number().int().nonnegative().catch(0)

/**
 * Canonical catalog boundary: TMDB serves movies and series only.
 * Anime is an AniList domain (own ids, episode identity, airing state).
 * The TMDB adapter must never normalize TV results as `anime`.
 */
function assertNonAnimeKind(kind: CatalogKind | 'all') {
  if (kind === 'anime') {
    throw new CatalogError('CATALOG_INVALID_QUERY', 'Anime titles come from AniList, not TMDB.', {
      statusCode: 400,
    })
  }
}

const tmdbMovieSchema = z.object({
  adult: z.boolean(),
  backdrop_path: nullableString,
  genre_ids: z.array(z.number().int()).catch([]),
  id: z.number().int().positive(),
  original_title: z.string().catch(''),
  overview: z.string().catch(''),
  popularity: nonNegativeNumber,
  poster_path: nullableString,
  release_date: nullableString,
  title: z.string().catch(''),
  vote_average: z.number().min(0).max(10).catch(0),
  vote_count: nonNegativeInteger,
})

const tmdbSeriesSchema = z.object({
  adult: z.boolean(),
  backdrop_path: nullableString,
  first_air_date: nullableString,
  genre_ids: z.array(z.number().int()).catch([]),
  id: z.number().int().positive(),
  name: z.string().catch(''),
  original_name: z.string().catch(''),
  overview: z.string().catch(''),
  popularity: nonNegativeNumber,
  poster_path: nullableString,
  vote_average: z.number().min(0).max(10).catch(0),
  vote_count: nonNegativeInteger,
})

const tmdbPageSchema = z.object({
  page: z.number().int().positive(),
  results: z.array(z.unknown()),
  total_pages: nonNegativeInteger,
  total_results: nonNegativeInteger,
})

const tmdbFindSchema = z.object({ movie_results: z.array(z.unknown()) })

const tmdbImageConfigurationSchema = z.object({
  images: z.object({
    backdrop_sizes: z.array(z.string()).min(1),
    logo_sizes: z.array(z.string()).min(1),
    poster_sizes: z.array(z.string()).min(1),
    profile_sizes: z.array(z.string()).min(1),
    secure_base_url: z.url(),
    still_sizes: z.array(z.string()).min(1),
  }),
})

const tmdbGenreListSchema = z.object({
  genres: z.array(z.object({ id: z.number().int().positive(), name: z.string().min(1) })),
})

const tmdbCreditSchema = z.object({
  character: nullableString.optional(),
  id: z.number().int().positive(),
  job: nullableString.optional(),
  known_for_department: nullableString.optional(),
  name: z.string().min(1),
  profile_path: nullableString,
})

const tmdbAggregateCastSchema = tmdbCreditSchema.extend({
  roles: z.array(z.object({ character: z.string().catch('') })).catch([]),
})

const tmdbLogoSchema = z.object({
  file_path: z.string().min(1),
  iso_639_1: z.string().nullable().catch(null),
})

const tmdbBackdropSchema = z.object({
  file_path: z.string().min(1),
  iso_639_1: z.string().nullable().catch(null),
  vote_average: z.number().catch(0),
  vote_count: z.number().int().catch(0),
  width: z.number().int().catch(0),
})

const tmdbImagesSchema = z.object({
  backdrops: z.array(tmdbBackdropSchema).catch([]),
  logos: z.array(tmdbLogoSchema).catch([]),
}).catch({ backdrops: [], logos: [] })

const tmdbMovieDetailSchema = tmdbMovieSchema.omit({ genre_ids: true }).extend({
  credits: z.object({
    cast: z.array(tmdbCreditSchema).catch([]),
    crew: z.array(tmdbCreditSchema).catch([]),
  }),
  genres: z.array(z.object({ id: z.number().int(), name: z.string().min(1) })).catch([]),
  homepage: nullableString,
  images: tmdbImagesSchema,
  production_countries: z.array(z.object({ name: z.string().min(1) })).catch([]),
  recommendations: tmdbPageSchema,
  release_dates: z.object({
    results: z.array(z.object({
      iso_3166_1: z.string(),
      release_dates: z.array(z.object({
        certification: z.string().catch(''),
        type: z.number().int().catch(0),
      })).catch([]),
    })).catch([]),
  }),
  runtime: z.number().int().positive().nullable().catch(null),
  spoken_languages: z.array(z.object({ english_name: z.string().min(1) })).catch([]),
  status: nullableString,
  tagline: nullableString,
})

const tmdbSeriesDetailSchema = tmdbSeriesSchema.omit({ genre_ids: true }).extend({
  aggregate_credits: z.object({
    cast: z.array(tmdbAggregateCastSchema).catch([]),
    crew: z.array(tmdbCreditSchema).catch([]),
  }),
  content_ratings: z.object({
    results: z.array(z.object({ iso_3166_1: z.string(), rating: z.string() })).catch([]),
  }),
  created_by: z.array(tmdbCreditSchema).catch([]),
  episode_run_time: z.array(z.number().int().positive()).catch([]),
  genres: z.array(z.object({ id: z.number().int(), name: z.string().min(1) })).catch([]),
  homepage: nullableString,
  images: tmdbImagesSchema,
  origin_country: z.array(z.string()).catch([]),
  recommendations: tmdbPageSchema,
  seasons: z.array(z.object({
    air_date: nullableString,
    episode_count: nonNegativeInteger,
    name: z.string().min(1),
    poster_path: nullableString,
    season_number: z.number().int(),
  })).catch([]),
  spoken_languages: z.array(z.object({ english_name: z.string().min(1) })).catch([]),
  status: nullableString,
  tagline: nullableString,
})

const tmdbSeasonSchema = z.object({
  episodes: z.array(z.object({
    air_date: nullableString,
    episode_number: z.number().int().positive(),
    id: z.number().int().positive(),
    name: z.string().catch(''),
    overview: z.string().catch(''),
    runtime: z.number().int().positive().nullable().catch(null),
    season_number: z.number().int().positive(),
    still_path: nullableString,
  })),
  name: z.string().min(1),
  overview: z.string().catch(''),
  poster_path: nullableString,
  season_number: z.number().int().positive(),
})

type ImageConfiguration = z.infer<typeof tmdbImageConfigurationSchema>['images']
type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

export type TmdbCatalogOptions = {
  cache?: StaleCache | undefined
  fetch?: FetchLike | undefined
  language?: string | undefined
  region?: string | undefined
  sleep?: ((milliseconds: number) => Promise<void>) | undefined
  token: string
}

function yearFromDate(date: string | null) {
  if (!date) return null
  const year = Number(date.slice(0, 4))
  return Number.isInteger(year) && year >= 1870 && year <= 2200 ? year : null
}

function titleFor(kind: CatalogKind, value: z.infer<typeof tmdbMovieSchema> | z.infer<typeof tmdbSeriesSchema>) {
  if (kind === 'movie') {
    const movie = tmdbMovieSchema.parse(value)
    return {
      date: movie.release_date,
      originalTitle: movie.original_title || movie.title || `Movie ${movie.id}`,
      title: movie.title || movie.original_title || `Movie ${movie.id}`,
    }
  }

  const series = tmdbSeriesSchema.parse(value)
  return {
    date: series.first_air_date,
    originalTitle: series.original_name || series.name || `Series ${series.id}`,
    title: series.name || series.original_name || `Series ${series.id}`,
  }
}

function chooseImageSize(sizes: readonly string[], preferred: string) {
  if (sizes.includes(preferred)) return preferred
  return sizes.findLast((size) => size !== 'original') ?? 'original'
}

/**
 * Picks the hero logo from TMDB artwork: English first, then language-free
 * artwork, then anything usable. List responses never carry logos, so they
 * resolve to null and heroes fall back to the serif title.
 */
function pickLogoUrl(
  logos: readonly z.infer<typeof tmdbLogoSchema>[],
  configuration: ImageConfiguration,
) {
  const preferred = logos.find((logo) => logo.iso_639_1 === 'en')
    ?? logos.find((logo) => logo.iso_639_1 === null)
    ?? logos[0]
  return preferred ? imageUrl(preferred.file_path, configuration, 'logo') : null
}

/**
 * Picks hero banner art from the TMDB backdrops gallery: titled key art
 * first (the character-and-logo frames members recognize from the media
 * tab), then textless frames, with community votes deciding inside each
 * group. Fullscreen-grade frames only. The default backdrop is skipped while
 * a distinct gallery frame clears the bar, so heroes stop repeating the
 * catalog thumbnail. List responses never carry galleries, so those heroes
 * keep the default art.
 */
function pickHeroBackdropUrl(
  backdrops: readonly z.infer<typeof tmdbBackdropSchema>[],
  configuration: ImageConfiguration,
  currentPath: string | null,
) {
  const ranked = backdrops
    .filter((backdrop) => backdrop.width >= 1280 && backdrop.file_path !== currentPath)
    .sort((left, right) => {
      const leftTitled = left.iso_639_1 !== null
      const rightTitled = right.iso_639_1 !== null
      if (leftTitled !== rightTitled) return leftTitled ? -1 : 1
      if (right.vote_average !== left.vote_average) return right.vote_average - left.vote_average
      return right.vote_count - left.vote_count
    })
  const preferred = ranked[0]
  return preferred ? imageUrl(preferred.file_path, configuration, 'backdrop') : null
}

function imageUrl(
  path: string | null,
  configuration: ImageConfiguration,
  type: 'backdrop' | 'logo' | 'poster' | 'profile' | 'still',
) {
  if (!path?.startsWith('/')) return null

  const sizes = configuration[`${type}_sizes`]
  const preferred = {
    backdrop: 'w1280',
    logo: 'w500',
    poster: 'w500',
    profile: 'w185',
    still: 'w780',
  }[type]
  const url = new URL(`${chooseImageSize(sizes, preferred)}${path}`, configuration.secure_base_url)
  return url.protocol === 'https:' && url.hostname === imageHostname ? url.toString() : null
}

function meta(
  cached: Pick<CachedValue<unknown>, 'fetchedAt' | 'stale'>,
  language: string,
  region: string,
): CatalogResponseMeta {
  return {
    fetchedAt: cached.fetchedAt.toISOString(),
    language,
    region,
    source: 'tmdb',
    stale: cached.stale,
  }
}

function interleave<T>(left: readonly T[], right: readonly T[]) {
  const result: T[] = []
  const count = Math.max(left.length, right.length)
  for (let index = 0; index < count; index += 1) {
    const first = left[index]
    const second = right[index]
    if (first !== undefined) result.push(first)
    if (second !== undefined) result.push(second)
  }
  return result
}

function summaryFromDetail(detail: CatalogTitleDetail): CatalogTitleSummary {
  return {
    backdropUrl: detail.backdropUrl,
    genreNames: detail.genreNames,
    id: detail.id,
    kind: detail.kind,
    logoUrl: detail.logoUrl,
    originalTitle: detail.originalTitle,
    overview: detail.overview,
    popularity: detail.popularity,
    posterUrl: detail.posterUrl,
    releaseDate: detail.releaseDate,
    title: detail.title,
    tmdbRating: detail.tmdbRating,
    tmdbVoteCount: detail.tmdbVoteCount,
    year: detail.year,
  }
}

export function createTmdbCatalog({
  cache = new StaleCache(),
  fetch: fetchImpl = fetch,
  language = 'en-US',
  region = 'US',
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  token,
}: TmdbCatalogOptions): Catalog {
  if (!token.trim()) {
    throw new CatalogError(
      'CATALOG_NOT_CONFIGURED',
      'TMDB_API_READ_TOKEN is required.',
      { statusCode: 503 },
    )
  }

  async function requestJson(path: string, params: Record<string, string | number | boolean | undefined> = {}) {
    const url = new URL(`${tmdbBaseUrl}${path}`)
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, String(value))
    }

    const deadline = Date.now() + requestTimeoutMs
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let response: Response
      try {
        response = await fetchImpl(url, {
          headers: {
            accept: 'application/json',
            authorization: `Bearer ${token}`,
          },
          signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
        })
      } catch (error) {
        if (attempt === 0 && deadline - Date.now() > 250) {
          await sleep(250)
          continue
        }
        throw new CatalogError('CATALOG_UNAVAILABLE', 'TMDB did not respond in time.', {
          cause: error,
          retryable: true,
          statusCode: 503,
        })
      }

      if (response.ok) {
        try {
          return await response.json() as unknown
        } catch (error) {
          throw new CatalogError('CATALOG_UNAVAILABLE', 'TMDB returned unreadable data.', {
            cause: error,
            retryable: true,
            statusCode: 503,
          })
        }
      }

      if (response.status === 404) {
        throw new CatalogError('CATALOG_NOT_FOUND', 'The requested title was not found.', {
          statusCode: 404,
        })
      }

      const retryable = response.status === 429 || response.status >= 500
      if (retryable && attempt === 0) {
        const retryAfter = response.headers.get('retry-after')
        const retryAfterSeconds = Number(retryAfter)
        const retryAfterDate = retryAfter ? Date.parse(retryAfter) : Number.NaN
        const delay = Number.isFinite(retryAfterSeconds)
          ? Math.max(retryAfterSeconds * 1_000, 0)
          : Number.isFinite(retryAfterDate) ? Math.max(retryAfterDate - Date.now(), 0) : 250
        if (delay < deadline - Date.now()) {
          await sleep(delay)
          continue
        }
      }

      throw new CatalogError(
        'CATALOG_UNAVAILABLE',
        response.status === 401 ? 'TMDB rejected the catalog credential.' : 'TMDB is temporarily unavailable.',
        { retryable, statusCode: 503 },
      )
    }

    throw new CatalogError('CATALOG_UNAVAILABLE', 'TMDB is temporarily unavailable.', {
      retryable: true,
      statusCode: 503,
    })
  }

  async function configuration() {
    return cache.get('tmdb:configuration', cachePolicies.configuration, async () => {
      const parsed = tmdbImageConfigurationSchema.safeParse(await requestJson('/configuration'))
      if (!parsed.success) {
        throw new CatalogError('CATALOG_UNAVAILABLE', 'TMDB image configuration was invalid.', {
          cause: parsed.error,
          retryable: true,
          statusCode: 503,
        })
      }
      return parsed.data.images
    })
  }

  async function genreMap(kind: CatalogKind) {
    return cache.get(`tmdb:genres:${kind}:${language}`, cachePolicies.configuration, async () => {
      const namespace = kind === 'movie' ? 'movie' : 'tv'
      const parsed = tmdbGenreListSchema.safeParse(
        await requestJson(`/genre/${namespace}/list`, { language }),
      )
      if (!parsed.success) {
        throw new CatalogError('CATALOG_UNAVAILABLE', 'TMDB genre data was invalid.', {
          cause: parsed.error,
          retryable: true,
          statusCode: 503,
        })
      }
      return Object.fromEntries(parsed.data.genres.map((genre) => [genre.id, genre.name] as const))
    })
  }

  async function normalizeSummary(kind: CatalogKind, raw: unknown): Promise<CatalogTitleSummary | null> {
    const parsed = kind === 'movie'
      ? tmdbMovieSchema.safeParse(raw)
      : tmdbSeriesSchema.safeParse(raw)
    if (!parsed.success || parsed.data.adult) return null

    const [images, genres] = await Promise.all([configuration(), genreMap(kind)])
    const value = parsed.data
    const identity = titleFor(kind, value)
    return {
      backdropUrl: imageUrl(value.backdrop_path, images.value, 'backdrop'),
      genreNames: value.genre_ids.map((id) => genres.value[String(id)]).filter((name): name is string => Boolean(name)),
      id: value.id,
      kind,
      logoUrl: null,
      originalTitle: identity.originalTitle,
      overview: value.overview,
      popularity: value.popularity,
      posterUrl: imageUrl(value.poster_path, images.value, 'poster'),
      releaseDate: identity.date,
      title: identity.title,
      tmdbRating: value.vote_count > 0 ? value.vote_average : null,
      tmdbVoteCount: value.vote_count,
      year: yearFromDate(identity.date),
    } satisfies CatalogTitleSummary
  }

  async function normalizePage(kind: CatalogKind, raw: unknown) {
    const page = tmdbPageSchema.safeParse(raw)
    if (!page.success) {
      throw new CatalogError('CATALOG_UNAVAILABLE', 'TMDB returned an invalid catalog page.', {
        cause: page.error,
        retryable: true,
        statusCode: 503,
      })
    }

    const items = await Promise.all(page.data.results.map((item) => normalizeSummary(kind, item)))
    return {
      items: items.filter((item): item is CatalogTitleSummary => item !== null),
      page: page.data.page,
      totalPages: Math.min(page.data.total_pages, 500),
      totalResults: page.data.total_results,
    }
  }

  async function normalizeMixedPage(raw: unknown) {
    const page = tmdbPageSchema.safeParse(raw)
    if (!page.success) {
      throw new CatalogError('CATALOG_UNAVAILABLE', 'TMDB returned an invalid mixed catalog page.', {
        cause: page.error,
        retryable: true,
        statusCode: 503,
      })
    }

    const items = await Promise.all(page.data.results.map(async (item) => {
      const mediaType = z.object({ media_type: z.string() }).safeParse(item)
      if (!mediaType.success) return null
      if (mediaType.data.media_type === 'movie') return normalizeSummary('movie', item)
      if (mediaType.data.media_type === 'tv') return normalizeSummary('series', item)
      return null
    }))
    return {
      items: items.filter((item): item is CatalogTitleSummary => item !== null),
      page: page.data.page,
      totalPages: Math.min(page.data.total_pages, 500),
      totalResults: page.data.total_results,
    }
  }

  function discoverPath(kind: CatalogKind, feed: DiscoverCatalogQuery['feed']) {
    const namespace = kind === 'movie' ? 'movie' : 'tv'
    const suffix = {
      'now-playing': kind === 'movie' ? 'now_playing' : null,
      'on-air': kind === 'series' ? 'on_the_air' : null,
      popular: 'popular',
      'top-rated': 'top_rated',
      trending: null,
    }[feed]

    if (feed === 'trending') return `/trending/${namespace}/week`
    if (!suffix) {
      throw new CatalogError('CATALOG_INVALID_QUERY', `${feed} is not available for ${kind}.`, {
        statusCode: 400,
      })
    }
    return `/${namespace}/${suffix}`
  }

  async function discoverOne(kind: CatalogKind, query: DiscoverCatalogQuery) {
    assertNonAnimeKind(kind)
    if (query.genre || query.year) {
      if (query.feed !== 'popular' && query.feed !== 'top-rated') {
        throw new CatalogError('CATALOG_INVALID_QUERY', 'Filters require popular or top-rated sorting.', { statusCode: 400 })
      }
      const genres = query.genre ? await genreMap(kind) : null
      const genreId = genres ? Object.entries(genres.value).find(([, name]) => name === query.genre)?.[0] : undefined
      if (query.genre && !genreId) {
        throw new CatalogError('CATALOG_INVALID_QUERY', 'Choose a genre from the catalog.', { statusCode: 400 })
      }
      const raw = await requestJson(`/discover/${kind === 'movie' ? 'movie' : 'tv'}`, {
        include_adult: false,
        language,
        page: query.page,
        sort_by: query.feed === 'top-rated' ? 'vote_average.desc' : 'popularity.desc',
        'vote_count.gte': query.feed === 'top-rated' ? 200 : undefined,
        with_genres: genreId,
        primary_release_year: kind === 'movie' ? query.year : undefined,
        first_air_date_year: kind === 'series' ? query.year : undefined,
      })
      return normalizePage(kind, raw)
    }
    const raw = await requestJson(discoverPath(kind, query.feed), {
      language,
      page: query.page,
      region: kind === 'movie' ? region : undefined,
    })
    return normalizePage(kind, raw)
  }

  function person(
    value: z.infer<typeof tmdbCreditSchema>,
    images: ImageConfiguration,
    details: { character?: string | null; role?: string | null } = {},
  ): CatalogPerson {
    return {
      character: details.character ?? value.character ?? null,
      id: value.id,
      name: value.name,
      profileUrl: imageUrl(value.profile_path, images, 'profile'),
      role: details.role ?? value.job ?? value.known_for_department ?? null,
    }
  }

  async function movieDetail(id: number) {
    const parsed = tmdbMovieDetailSchema.safeParse(await requestJson(`/movie/${id}`, {
      append_to_response: 'credits,recommendations,release_dates,images',
      include_image_language: 'en,null',
      language,
    }))
    if (parsed.success && parsed.data.adult) {
      throw new CatalogError('CATALOG_NOT_FOUND', 'The requested title was not found.', {
        statusCode: 404,
      })
    }
    if (!parsed.success) {
      throw new CatalogError('CATALOG_UNAVAILABLE', 'TMDB returned invalid movie details.', {
        cause: parsed.error,
        retryable: true,
        statusCode: 503,
      })
    }

    const images = await configuration()
    const value = parsed.data
    const release = value.release_dates.results.find((item) => item.iso_3166_1 === region)
    const certification = [...(release?.release_dates ?? [])]
      .sort((left, right) => [3, 2, 4, 6, 5, 1].indexOf(left.type) - [3, 2, 4, 6, 5, 1].indexOf(right.type))
      .find((item) => item.certification.trim())?.certification ?? null
    const recommendations = await Promise.all(
      value.recommendations.results.slice(0, 10).map((item) => normalizeSummary('movie', item)),
    )

    return {
      backdropUrl: imageUrl(value.backdrop_path, images.value, 'backdrop'),
      cast: value.credits.cast.slice(0, 12).map((credit) => person(credit, images.value)),
      certification,
      countries: value.production_countries.map((country) => country.name),
      creators: value.credits.crew
        .filter((credit) => credit.job === 'Director' || credit.job === 'Writer' || credit.job === 'Screenplay')
        .slice(0, 8)
        .map((credit) => person(credit, images.value)),
      genreNames: value.genres.map((genre) => genre.name),
      heroBackdropUrl: pickHeroBackdropUrl(value.images.backdrops, images.value, value.backdrop_path),
      // TMDB sends "" when no homepage exists; the contract only accepts a
      // real URL or null, so blank strings normalize to null here.
      homepageUrl: value.homepage || null,
      id: value.id,
      kind: 'movie',
      languages: value.spoken_languages.map((item) => item.english_name),
      logoUrl: pickLogoUrl(value.images.logos, images.value),
      originalTitle: value.original_title || value.title || `Movie ${value.id}`,
      overview: value.overview,
      popularity: value.popularity,
      posterUrl: imageUrl(value.poster_path, images.value, 'poster'),
      recommendations: recommendations.filter((item): item is CatalogTitleSummary => item !== null),
      releaseDate: value.release_date,
      runtimeMinutes: value.runtime,
      status: value.status,
      tagline: value.tagline,
      title: value.title || value.original_title || `Movie ${value.id}`,
      tmdbRating: value.vote_count > 0 ? value.vote_average : null,
      tmdbVoteCount: value.vote_count,
      year: yearFromDate(value.release_date),
    } satisfies CatalogTitleDetail
  }

  async function seriesDetail(id: number) {
    const parsed = tmdbSeriesDetailSchema.safeParse(await requestJson(`/tv/${id}`, {
      append_to_response: 'aggregate_credits,recommendations,content_ratings,images',
      include_image_language: 'en,null',
      language,
    }))
    if (parsed.success && parsed.data.adult) {
      throw new CatalogError('CATALOG_NOT_FOUND', 'The requested title was not found.', {
        statusCode: 404,
      })
    }
    if (!parsed.success) {
      throw new CatalogError('CATALOG_UNAVAILABLE', 'TMDB returned invalid series details.', {
        cause: parsed.error,
        retryable: true,
        statusCode: 503,
      })
    }

    const images = await configuration()
    const value = parsed.data
    const recommendations = await Promise.all(
      value.recommendations.results.slice(0, 10).map((item) => normalizeSummary('series', item)),
    )

    return {
      backdropUrl: imageUrl(value.backdrop_path, images.value, 'backdrop'),
      cast: value.aggregate_credits.cast.slice(0, 12).map((credit) => person(credit, images.value, {
        character: credit.roles[0]?.character || null,
      })),
      certification: null,
      contentRating: value.content_ratings.results.find((item) => item.iso_3166_1 === region)?.rating || null,
      countries: value.origin_country,
      creators: value.created_by.slice(0, 8).map((credit) => person(credit, images.value, { role: 'Creator' })),
      episodeRuntimeMinutes: value.episode_run_time[0] ?? null,
      genreNames: value.genres.map((genre) => genre.name),
      heroBackdropUrl: pickHeroBackdropUrl(value.images.backdrops, images.value, value.backdrop_path),
      // TMDB sends "" when no homepage exists; the contract only accepts a
      // real URL or null, so blank strings normalize to null here.
      homepageUrl: value.homepage || null,
      id: value.id,
      kind: 'series',
      languages: value.spoken_languages.map((item) => item.english_name),
      logoUrl: pickLogoUrl(value.images.logos, images.value),
      originalTitle: value.original_name || value.name || `Series ${value.id}`,
      overview: value.overview,
      popularity: value.popularity,
      posterUrl: imageUrl(value.poster_path, images.value, 'poster'),
      recommendations: recommendations.filter((item): item is CatalogTitleSummary => item !== null),
      releaseDate: value.first_air_date,
      seasons: value.seasons
        .filter((season) => season.season_number > 0)
        .map((season) => ({
          airDate: season.air_date,
          episodeCount: season.episode_count,
          name: season.name,
          number: season.season_number,
          posterUrl: imageUrl(season.poster_path, images.value, 'poster'),
        })),
      status: value.status,
      tagline: value.tagline,
      title: value.name || value.original_name || `Series ${value.id}`,
      tmdbRating: value.vote_count > 0 ? value.vote_average : null,
      tmdbVoteCount: value.vote_count,
      year: yearFromDate(value.first_air_date),
    } satisfies CatalogTitleDetail
  }

  async function title(kind: CatalogKind, id: number) {
    assertNonAnimeKind(kind)
    const cached = await cache.get<CatalogTitleDetail>(`tmdb:title:${kind}:${id}:${language}:${region}`, cachePolicies.detail, () => (
      kind === 'movie' ? movieDetail(id) : seriesDetail(id)
    ))
    return catalogTitleResponseSchema.parse({
      item: cached.value,
      meta: meta(cached, language, region),
    })
  }

  return {
    async batch(refs: readonly CatalogRef[]) {
      const results = await Promise.allSettled(refs.map((reference) => title(reference.kind, reference.id)))
      const items: CatalogTitleSummary[] = []
      const missing: CatalogRef[] = []
      const successful: CatalogResponseMeta[] = []

      results.forEach((result, index) => {
        const reference = refs[index]
        if (!reference) return
        if (result.status === 'fulfilled') {
          items.push(summaryFromDetail(result.value.item))
          successful.push(result.value.meta)
          return
        }
        if (result.reason instanceof CatalogError && result.reason.code === 'CATALOG_NOT_FOUND') {
          missing.push(reference)
          return
        }
        throw result.reason
      })

      const fetchedAt = successful.map((item) => item.fetchedAt).sort()[0] ?? new Date().toISOString()
      return catalogBatchSchema.parse({
        items,
        meta: {
          fetchedAt,
          language,
          region,
          source: 'tmdb',
          stale: successful.some((item) => item.stale),
        },
        missing,
      })
    },

    async discover(query: DiscoverCatalogQuery) {
      const key = `tmdb:discover:${query.kind}:${query.feed}:${query.page}:${language}:${region}:${encodeURIComponent(query.genre ?? '')}:${query.year ?? ''}`
      const cached = await cache.get(key, cachePolicies.discover, async () => {
        if (query.kind !== 'all') return discoverOne(query.kind, query)
        if (query.feed === 'now-playing' || query.feed === 'on-air') {
          throw new CatalogError('CATALOG_INVALID_QUERY', `${query.feed} requires a title kind.`, {
            statusCode: 400,
          })
        }
        const [movies, series] = await Promise.all([
          discoverOne('movie', query),
          discoverOne('series', query),
        ])
        return {
          items: interleave(movies.items, series.items),
          page: query.page,
          totalPages: Math.min(Math.max(movies.totalPages, series.totalPages), 500),
          totalResults: movies.totalResults + series.totalResults,
        }
      })

      return catalogPageSchema.parse({
        ...cached.value,
        meta: meta(cached, language, region),
      })
    },

    async movieByExternalId(imdbId: string) {
      const cached = await cache.get(`tmdb:external:imdb:${imdbId}:${language}:${region}`, cachePolicies.detail, async () => {
        const parsed = tmdbFindSchema.safeParse(await requestJson(`/find/${encodeURIComponent(imdbId)}`, {
          external_source: 'imdb_id',
          language,
        }))
        if (!parsed.success) {
          throw new CatalogError('CATALOG_UNAVAILABLE', 'TMDB returned invalid external-ID data.', {
            cause: parsed.error,
            retryable: true,
            statusCode: 503,
          })
        }
        const normalized = await Promise.all(parsed.data.movie_results.map((item) => normalizeSummary('movie', item)))
        return normalized.find((item): item is CatalogTitleSummary => item !== null) ?? null
      })
      return cached.value
    },

    async search(query: SearchCatalogQuery) {
      assertNonAnimeKind(query.kind)
      const normalizedQuery = query.query.trim().slice(0, 100)
      const key = `tmdb:search:${query.kind}:${query.page}:${language}:${normalizedQuery.toLowerCase()}`
      const cached = await cache.get(key, cachePolicies.search, async () => {
        const namespace = query.kind === 'movie' ? 'movie' : query.kind === 'series' ? 'tv' : 'multi'
        const raw = await requestJson(`/search/${namespace}`, {
          include_adult: false,
          language,
          page: query.page,
          query: normalizedQuery,
          region,
        })
        return query.kind === 'all'
          ? normalizeMixedPage(raw)
          : normalizePage(query.kind, raw)
      })

      return catalogPageSchema.parse({
        ...cached.value,
        meta: meta(cached, language, region),
      })
    },

    async recentEpisodes(seriesId: number, since: Date) {
      const now = Date.now()
      const cached = await cache.get(`tmdb:recent-episodes:${seriesId}:${language}`, { freshForMs: 15 * 60_000, staleForMs: 60 * 60_000 }, async () => {
        const series = z.object({ id: z.int().positive(), name: z.string().min(1), backdrop_path: nullableString,
          seasons: z.array(z.object({ season_number: z.int(), air_date: nullableString })).max(100),
        }).parse(await requestJson(`/tv/${seriesId}`, { language }))
        if (series.id !== seriesId) throw new Error('Mismatched series identity.')
        const seasons = series.seasons.filter(season => season.season_number > 0 && (!season.air_date || Date.parse(season.air_date) <= now))
          .sort((a, b) => b.season_number - a.season_number)
        const recent = seasons.filter((season, index) => index < 2 || (season.air_date && Date.parse(season.air_date) >= since.getTime()))
        if (recent.length > 6) throw new Error('Release season batch exceeded its limit.')
        const images = await configuration()
        const episodes: import('@consumit/contracts').ReleaseEpisode[] = []
        for (const season of recent) {
          const detail = tmdbSeasonSchema.parse(await requestJson(`/tv/${seriesId}/season/${season.season_number}`, { language }))
          if (detail.season_number !== season.season_number) throw new Error('Mismatched season identity.')
          for (const episode of detail.episodes) {
            if (!episode.air_date || !/^\d{4}-\d{2}-\d{2}$/.test(episode.air_date) || episode.season_number !== season.season_number) continue
            const at = Date.parse(`${episode.air_date}T00:00:00Z`)
            if (!Number.isFinite(at) || at < since.getTime() || at > now) continue
            episodes.push({ ref: { kind: 'series', id: seriesId, season: season.season_number, episode: episode.episode_number },
              title: series.name, episodeTitle: episode.name || null, imageUrl: imageUrl(episode.still_path ?? series.backdrop_path, images.value, 'still'),
              releasedAt: new Date(at).toISOString(), datePrecision: 'date', checkedAt: null })
          }
        }
        return episodes
      })
      return cached.value
    },

    async season(seriesId: number, seasonNumber: number) {
      const cached = await cache.get(
        `tmdb:season:${seriesId}:${seasonNumber}:${language}`,
        cachePolicies.detail,
        async () => {
          const parsed = tmdbSeasonSchema.safeParse(
            await requestJson(`/tv/${seriesId}/season/${seasonNumber}`, { language }),
          )
          if (!parsed.success) {
            throw new CatalogError('CATALOG_UNAVAILABLE', 'TMDB returned invalid season details.', {
              cause: parsed.error,
              retryable: true,
              statusCode: 503,
            })
          }
          const images = await configuration()
          return {
            episodes: parsed.data.episodes.map((episode) => ({
              airDate: episode.air_date,
              episodeNumber: episode.episode_number,
              id: episode.id,
              overview: episode.overview,
              runtimeMinutes: episode.runtime,
              seasonNumber: episode.season_number,
              stillUrl: imageUrl(episode.still_path, images.value, 'still'),
              title: episode.name || `Episode ${episode.episode_number}`,
            })),
            name: parsed.data.name,
            overview: parsed.data.overview,
            posterUrl: imageUrl(parsed.data.poster_path, images.value, 'poster'),
            seasonNumber: parsed.data.season_number,
            seriesId,
          }
        },
      )

      return catalogSeasonResponseSchema.parse({
        item: cached.value,
        meta: meta(cached, language, region),
      })
    },

    title,
  }
}
