import type { AnimeTitleDetail, AnimeTitleSummary, AnimeFormat, AnimeStatus, AnimeSeason, AnimeBrowseQuery, AnimePage } from '@consumit/contracts'
import { AnimeError } from './errors.ts'
import type { StaleCache } from '../catalog/stale-cache.ts'

export type AnimeMetadataRecord = {
  malId: number | null
  title: string
  englishTitle: string | null
  japaneseTitle: string | null
  format: string | null
  status: string | null
  season: string | null
  year: number | null
  episodes: number | null
  durationMinutes: number | null
  genres: string[]
  imageUrl: string | null
  score: number | null
  popularity: number
  description: string
  source: string | null
}

export type AnimeMetadataFallback = {
  readonly provider: 'mal' | 'kitsu'
  title(anilistId: number, malId: number | null): Promise<AnimeTitleDetail>
  search(query: string, page: number, perPage: number): Promise<{ items: AnimeTitleSummary[]; page: number; totalPages: number; totalResults: number }>
  trending(page: number, perPage: number): Promise<AnimePage>
  seasonal(season: AnimeSeason, year: number, page: number, perPage: number): Promise<{ items: AnimeTitleSummary[]; page: number; totalPages: number; totalResults: number }>
  browse?(query: AnimeBrowseQuery, perPage: number): Promise<{ items: AnimeTitleSummary[]; page: number; totalPages: number; totalResults: number }>
  relations?(anilistId: number, malId: number | null): Promise<{ main: AnimeTitleSummary; relations: Array<{ type: import('@consumit/contracts').AnimeRelationType; anime: AnimeTitleSummary }> }>
}

export function currentAnimeSeason(now = new Date()): { season: AnimeSeason; year: number } {
  return { season: (['WINTER', 'SPRING', 'SUMMER', 'FALL'] as const)[Math.floor(now.getUTCMonth() / 3)]!, year: now.getUTCFullYear() }
}

const identityPolicy = { freshForMs: 24 * 60 * 60_000, staleForMs: 0 } as const
const unknownIdentityPolicy = { freshForMs: 5 * 60_000, staleForMs: 0 } as const

export type AnimeIdentityMap = {
  remember(anilistId: number, malId: number | null | undefined): Promise<void>
  malIdForAniList(anilistId: number): Promise<number | null>
  aniListIdForMal(malId: number): Promise<number | null>
}

export function createAnimeIdentityMap(
  cache: StaleCache,
  resolveAniListId: (malId: number) => Promise<number | null>,
): AnimeIdentityMap {
  const anilistToMal = new Map<number, number>()
  const malToAnilist = new Map<number, number>()

  return {
    async remember(anilistId, malId) {
      if (!Number.isInteger(anilistId) || anilistId <= 0 || !Number.isInteger(malId) || !malId || malId <= 0) return
      anilistToMal.set(anilistId, malId)
      malToAnilist.set(malId, anilistId)
      await Promise.all([
        cache.set(`anime:crosswalk:anilist:${anilistId}`, malId, identityPolicy),
        cache.set(`anime:crosswalk:mal:${malId}`, anilistId, identityPolicy),
      ])
    },

    async malIdForAniList(anilistId) {
      const inMemory = anilistToMal.get(anilistId)
      if (inMemory) return inMemory
      const result = await cache.get<number | null>(
        `anime:crosswalk:anilist:${anilistId}`,
        unknownIdentityPolicy,
        async () => null,
      )
      if (result.value && Number.isInteger(result.value) && result.value > 0) {
        anilistToMal.set(anilistId, result.value)
        malToAnilist.set(result.value, anilistId)
        return result.value
      }
      return null
    },

    async aniListIdForMal(malId) {
      const inMemory = malToAnilist.get(malId)
      if (inMemory) return inMemory
      const result = await cache.get<number | null>(
        `anime:crosswalk:mal:${malId}`,
        identityPolicy,
        async () => resolveAniListId(malId),
      )
      if (result.value && Number.isInteger(result.value) && result.value > 0) {
        anilistToMal.set(result.value, malId)
        malToAnilist.set(malId, result.value)
        return result.value
      }
      return null
    },
  }
}

function safeUrl(value: string | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null
  } catch {
    return null
  }
}

function cleanText(value: string): string {
  return value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim().slice(0, 20_000)
}

function mapFormat(value: string | null): AnimeFormat {
  const normalized = value?.trim().toUpperCase().replace(/[ -]+/g, '_')
  if (normalized === 'TV_SHORT' || normalized === 'MOVIE' || normalized === 'OVA' || normalized === 'ONA' || normalized === 'SPECIAL') return normalized
  return 'TV'
}

function mapStatus(value: string | null): AnimeStatus {
  const normalized = value?.trim().toLowerCase()
  if (normalized?.includes('currently') || normalized === 'current' || normalized === 'releasing') return 'RELEASING'
  if (normalized?.includes('not yet') || normalized === 'unreleased' || normalized === 'tba' || normalized === 'upcoming' || normalized === 'not_yet_released' || normalized === 'not_yet_aired') return 'NOT_YET_RELEASED'
  if (normalized?.includes('hiatus')) return 'HIATUS'
  if (normalized?.includes('cancel')) return 'CANCELLED'
  return 'FINISHED'
}

function mapSeason(value: string | null): AnimeSeason | null {
  const normalized = value?.trim().toUpperCase()
  return normalized === 'WINTER' || normalized === 'SPRING' || normalized === 'SUMMER' || normalized === 'FALL'
    ? normalized
    : null
}

export function mapAnimeMetadataSummary(anilistId: number, raw: AnimeMetadataRecord): AnimeTitleSummary {
  const preferred = raw.englishTitle?.trim() || raw.title.trim() || raw.japaneseTitle?.trim() || `Anime ${anilistId}`
  const score = raw.score === null || !Number.isFinite(raw.score) ? null : Math.max(0, Math.min(100, Math.round(raw.score * 10)))
  const seasonYear = raw.year !== null && Number.isInteger(raw.year) && raw.year >= 1870 && raw.year <= 2200 ? raw.year : null
  const episodeCount = raw.episodes !== null && Number.isInteger(raw.episodes) && raw.episodes > 0 ? raw.episodes : null
  const duration = raw.durationMinutes !== null && Number.isInteger(raw.durationMinutes) && raw.durationMinutes > 0 ? raw.durationMinutes : null

  return {
    anilistId,
    malId: raw.malId,
    kind: 'anime',
    titles: {
      preferred,
      english: raw.englishTitle?.trim() || null,
      romaji: raw.title.trim() || null,
      native: raw.japaneseTitle?.trim() || null,
    },
    format: mapFormat(raw.format),
    status: mapStatus(raw.status),
    season: mapSeason(raw.season),
    seasonYear,
    episodes: episodeCount,
    episodeDuration: duration,
    genres: [...new Set(raw.genres.map((genre) => cleanText(genre)).filter(Boolean))].slice(0, 32),
    coverImage: { url: safeUrl(raw.imageUrl), color: null },
    bannerImage: null,
    averageScore: score,
    popularity: Number.isInteger(raw.popularity) && raw.popularity > 0 ? raw.popularity : 0,
    description: cleanText(raw.description),
    nextAiringEpisode: null,
  }
}

export function mapAnimeMetadataDetail(anilistId: number, raw: AnimeMetadataRecord): AnimeTitleDetail {
  return {
    ...mapAnimeMetadataSummary(anilistId, raw),
    malId: raw.malId,
    logoUrl: null,
    source: raw.source ? cleanText(raw.source).slice(0, 200) : null,
    countryOfOrigin: null,
    trailer: null,
    characters: [],
    staff: [],
    streamingEpisodes: [],
    externalLinks: [],
    recommendations: [],
  }
}

export async function mapAnimeMetadataPage(
  records: AnimeMetadataRecord[],
  page: number,
  totalPages: number,
  totalResults: number,
  identity: AnimeIdentityMap,
) {
  const summaries = await Promise.all(records.map(async (record) => {
    if (!record.malId) return null
    const anilistId = await identity.aniListIdForMal(record.malId)
    if (!anilistId) return null
    return mapAnimeMetadataSummary(anilistId, record)
  }))
  const items = summaries.filter((item): item is AnimeTitleSummary => item !== null)
  const unique = [...new Map(items.map((item) => [item.anilistId, item])).values()]
  if (records.length > 0 && unique.length === 0) {
    throw new AnimeError('ANILIST_UNAVAILABLE', 'Fallback anime records had no exact AniList ID crosswalk.', { retryable: true })
  }
  return {
    items: unique,
    page,
    totalPages: Math.max(1, totalPages),
    totalResults: Math.max(unique.length, totalResults),
  }
}

export function unavailableFallback(provider: string, cause?: unknown): never {
  throw new AnimeError('ANILIST_UNAVAILABLE', `${provider} anime metadata is temporarily unavailable.`, { cause, retryable: true })
}

export function noFallbackTitle(anilistId: number): AnimeError {
  return new AnimeError('ANIME_NOT_FOUND', `Anime not found: ${anilistId}`)
}
