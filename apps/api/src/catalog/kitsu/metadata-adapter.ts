import { z } from 'zod'
import type { AnimeBrowseQuery, AnimeRelationType, AnimeTitleDetail, AnimeTitleSummary } from '@consumit/contracts'
import { AnimeError } from '../../anime/errors.ts'
import { StaleCache, type CachePolicy } from '../stale-cache.ts'
import { currentAnimeSeason, mapAnimeMetadataDetail, type AnimeIdentityMap, type AnimeMetadataFallback, unavailableFallback } from '../../anime/anime-metadata.ts'
import type { KitsuCatalogOptions } from './adapter.ts'

const apiOrigin = 'https://kitsu.io/api/edge'
const pagePolicy = { freshForMs: 15 * 60_000, staleForMs: 24 * 60 * 60_000 } satisfies CachePolicy
const detailPolicy = { freshForMs: 6 * 60 * 60_000, staleForMs: null } satisfies CachePolicy
const idSchema = z.string().regex(/^[1-9]\d{0,14}$/)
const linkageSchema = z.object({ id: idSchema, type: z.string().max(80) })
const resourceSchema = linkageSchema.extend({
  attributes: z.record(z.string(), z.unknown()),
  relationships: z.record(z.string(), z.object({
    data: z.union([linkageSchema, z.array(linkageSchema).max(100), z.null()]).optional(),
  })).optional(),
})
const documentSchema = z.object({
  data: z.union([resourceSchema, z.array(resourceSchema).max(100)]),
  included: z.array(resourceSchema).max(2_000).optional().default([]),
  meta: z.object({ count: z.int().nonnegative() }).optional(),
  links: z.object({ next: z.string().nullable().optional() }).optional(),
})
const textSchema = z.string().max(20_000).nullable().optional()
const imageSchema = z.object({ original: textSchema, large: textSchema }).nullable().optional()
const animeAttributesSchema = z.object({
  canonicalTitle: z.string().trim().min(1).max(500),
  titles: z.object({ en: textSchema, en_us: textSchema, en_jp: textSchema, ja_jp: textSchema }).optional(),
  synopsis: textSchema,
  subtype: z.string().max(40),
  status: z.string().max(40),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  episodeCount: z.int().nonnegative().nullable().optional(),
  episodeLength: z.int().nonnegative().nullable().optional(),
  averageRating: z.string().regex(/^\d+(\.\d+)?$/).nullable().optional(),
  userCount: z.int().nonnegative().optional(),
  ageRating: z.string().max(40).nullable().optional(),
  nsfw: z.boolean(),
  posterImage: imageSchema,
  coverImage: imageSchema,
  youtubeVideoId: textSchema,
})
const mappingAttributesSchema = z.object({ externalSite: z.string().max(100), externalId: idSchema })
type Resource = z.infer<typeof resourceSchema>
type Document = z.infer<typeof documentSchema>

function httpsUrl(value: string | null | undefined): string | null {
  try {
    const url = new URL(value ?? '')
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null
  } catch { return null }
}

/** Uses only linked JSON:API resources, never upstream URLs or title guesses. */
function related(resource: Resource, relation: string, included: Resource[]): Resource[] {
  const links = resource.relationships?.[relation]?.data
  const references = Array.isArray(links) ? links : links ? [links] : []
  return references.flatMap((ref) => included.filter((item) => item.type === ref.type && item.id === ref.id))
}

function externalId(mappings: Resource[], site: string): number | null {
  const ids = new Set(mappings.flatMap((resource) => {
    if (resource.type !== 'mappings') return []
    const parsed = mappingAttributesSchema.safeParse(resource.attributes)
    return parsed.success && parsed.data.externalSite === site ? [Number(parsed.data.externalId)] : []
  }))
  return ids.size === 1 ? [...ids][0]! : null
}

export function createKitsuMetadataCatalog({ cache = new StaleCache(), fetch: fetchImpl = fetch }: KitsuCatalogOptions = {}) {
  async function request(path: string, policy: CachePolicy = pagePolicy): Promise<Document> {
    const key = `kitsu:metadata:v1:${path}`
    const load = async () => {
      try {
        const response = await fetchImpl(`${apiOrigin}${path}`, {
          headers: { accept: 'application/vnd.api+json', 'user-agent': 'Consumit/1.0 (anime metadata fallback)' },
          signal: AbortSignal.timeout(5_000),
        })
        if (response.status === 404) throw new AnimeError('ANIME_NOT_FOUND', 'Kitsu has no matching anime record.')
        if (!response.ok) return unavailableFallback('Kitsu', `HTTP ${response.status}`)
        const parsed = documentSchema.safeParse(await response.json())
        if (!parsed.success) return unavailableFallback('Kitsu', 'Invalid metadata document.')
        return parsed.data
      } catch (error) {
        if (error instanceof AnimeError) throw error
        return unavailableFallback('Kitsu', error)
      }
    }
    const cached = await cache.get(key, policy, load)
    const parsed = documentSchema.safeParse(cached.value)
    if (parsed.success) return parsed.data
    await cache.delete(key)
    return (await cache.get(key, policy, load)).value
  }

  async function kitsuIdFor(site: string, id: number): Promise<string | null> {
    if (!Number.isSafeInteger(id) || id <= 0) return null
    const params = new URLSearchParams({ 'filter[externalSite]': site, 'filter[externalId]': String(id), include: 'item', 'page[limit]': '2' })
    const document = await request(`/mappings?${params}`)
    if (!Array.isArray(document.data) || (document.meta?.count ?? 0) > 2) return null
    const ids = new Set<string>()
    for (const resource of document.data) {
      const parsed = mappingAttributesSchema.safeParse(resource.attributes)
      if (resource.type !== 'mappings' || !parsed.success || parsed.data.externalSite !== site || Number(parsed.data.externalId) !== id) return null
      const item = resource.relationships?.item?.data
      if (!item || Array.isArray(item) || item.type !== 'anime') return null
      ids.add(item.id)
    }
    return ids.size === 1 ? [...ids][0]! : null
  }

  async function animeDocument(id: string) {
    const document = await request(`/anime/${id}?include=mappings%2Cgenres`, detailPolicy)
    if (Array.isArray(document.data) || document.data.type !== 'anime' || document.data.id !== id) return unavailableFallback('Kitsu', 'Mismatched anime record.')
    return document
  }

  function mapAnime(resource: Resource, included: Resource[]): AnimeTitleDetail | null {
    if (resource.type !== 'anime') return null
    const parsed = animeAttributesSchema.safeParse(resource.attributes)
    if (!parsed.success) return unavailableFallback('Kitsu', 'Invalid anime metadata.')
    const raw = parsed.data
    if (raw.nsfw || raw.ageRating?.toUpperCase() === 'R18') return null
    const mappings = related(resource, 'mappings', included)
    const anilistId = externalId(mappings, 'anilist/anime')
    if (!anilistId) return null
    const malId = externalId(mappings, 'myanimelist/anime')
    const month = Number(raw.startDate?.slice(5, 7))
    const detail = mapAnimeMetadataDetail(anilistId, {
      malId, title: raw.titles?.en_jp || raw.canonicalTitle,
      englishTitle: raw.titles?.en || raw.titles?.en_us || null, japaneseTitle: raw.titles?.ja_jp ?? null,
      format: raw.subtype, status: raw.status,
      season: month >= 1 && month <= 12 ? ['WINTER', 'SPRING', 'SUMMER', 'FALL'][Math.floor((month - 1) / 3)]! : null,
      year: raw.startDate ? Number(raw.startDate.slice(0, 4)) : null,
      episodes: raw.episodeCount ?? null, durationMinutes: raw.episodeLength ?? null,
      genres: related(resource, 'genres', included).flatMap((genre) => genre.type === 'genres' && typeof genre.attributes.name === 'string' ? [genre.attributes.name] : []),
      imageUrl: httpsUrl(raw.posterImage?.original ?? raw.posterImage?.large),
      score: raw.averageRating ? Number(raw.averageRating) / 10 : null,
      popularity: raw.userCount ?? 0, description: raw.synopsis ?? '', source: null,
    })
    detail.bannerImage = httpsUrl(raw.coverImage?.original ?? raw.coverImage?.large)
    if (raw.youtubeVideoId && /^[\w-]{11}$/.test(raw.youtubeVideoId)) detail.trailer = { id: raw.youtubeVideoId, site: 'youtube', thumbnail: null }
    return detail
  }

  async function page(params: URLSearchParams, identity: AnimeIdentityMap, pageNumber: number, perPage: number) {
    perPage = Math.max(1, Math.min(20, perPage))
    params.set('include', 'mappings,genres')
    params.set('page[limit]', String(perPage))
    params.set('page[offset]', String((pageNumber - 1) * perPage))
    const document = await request(`/anime?${params}`)
    if (!Array.isArray(document.data)) return unavailableFallback('Kitsu', 'Invalid anime page.')
    const mapped = document.data.map((resource) => mapAnime(resource, document.included))
    const items = [...new Map(mapped.filter((item): item is AnimeTitleDetail => item !== null).map((item) => [item.anilistId, item])).values()]
    if (document.data.length && !items.length) return unavailableFallback('Kitsu', 'No safe anime records with exact AniList mappings.')
    await Promise.all(items.map((item) => identity.remember(item.anilistId, item.malId)))
    const total = document.meta?.count ?? ((pageNumber - 1) * perPage + document.data.length + (document.links?.next ? 1 : 0))
    return { items, page: pageNumber, totalPages: Math.max(1, Math.ceil(total / perPage)), totalResults: total }
  }

  return {
    async aniListIdForMal(malId: number): Promise<number | null> {
      const id = await kitsuIdFor('myanimelist/anime', malId)
      if (!id) return null
      const document = await animeDocument(id)
      if (Array.isArray(document.data)) return null
      const mappings = related(document.data, 'mappings', document.included)
      if (externalId(mappings, 'myanimelist/anime') !== malId) return null
      return externalId(mappings, 'anilist/anime')
    },
    fallback(identity: AnimeIdentityMap): AnimeMetadataFallback {
      async function title(anilistId: number, malId: number | null): Promise<AnimeTitleDetail> {
        const id = await kitsuIdFor('anilist/anime', anilistId)
        if (!id) return unavailableFallback('Kitsu', 'No exact AniList mapping.')
        const document = await animeDocument(id)
        if (Array.isArray(document.data)) return unavailableFallback('Kitsu', 'Invalid anime detail.')
        const detail = mapAnime(document.data, document.included)
        if (!detail) throw new AnimeError('ANIME_NOT_FOUND', 'Kitsu has no safe matching anime record.')
        if (detail.anilistId !== anilistId || (malId !== null && detail.malId !== null && detail.malId !== malId)) return unavailableFallback('Kitsu', 'Conflicting anime mapping.')
        detail.malId ??= malId
        await identity.remember(detail.anilistId, detail.malId)
        return detail
      }
      return {
        provider: 'kitsu', title,
        search(query, pageNumber, perPage) { return page(new URLSearchParams({ 'filter[text]': query }), identity, pageNumber, perPage) },
        async trending(pageNumber, perPage) {
          const { season, year } = currentAnimeSeason()
          return { ...await this.seasonal(season, year, pageNumber, perPage), discoveryBasis: 'seasonal-popularity' }
        },
        seasonal(season, year, pageNumber, perPage) {
          return page(new URLSearchParams({ sort: '-userCount', 'filter[season]': season.toLowerCase(), 'filter[seasonYear]': String(year) }), identity, pageNumber, perPage)
        },
        async browse(query: AnimeBrowseQuery, perPage) {
          const sort = { popular: '-userCount', 'top-rated': '-averageRating', new: '-startDate', old: 'startDate' }[query.sort]
          const params = new URLSearchParams({ sort })
          if (query.year) params.set('filter[seasonYear]', String(query.year))
          if (query.genre) {
            const normalized = query.genre.toLowerCase().replace(/\s+/g, '-')
            const slug = normalized === 'sci-fi' ? 'science-fiction' : normalized
            // Kitsu silently ignores unknown category slugs. Prove the slug
            // first so a filtered browse can never turn into an unfiltered page.
            const categories = await request(`/categories?${new URLSearchParams({ 'filter[slug]': slug, 'page[limit]': '2' })}`)
            if (!Array.isArray(categories.data) || !categories.data.some((resource) => resource.type === 'categories' && resource.attributes.slug === slug)) {
              return { items: [], page: query.page, totalPages: 1, totalResults: 0 }
            }
            params.set('filter[categories]', slug)
          }
          if (query.format === 'TV_SHORT') return unavailableFallback('Kitsu', 'TV_SHORT is not an exact Kitsu subtype.')
          if (query.format) params.set('filter[subtype]', query.format)
          return page(params, identity, query.page, perPage)
        },
        async relations(anilistId, malId) {
          const main = await title(anilistId, malId)
          const id = await kitsuIdFor('anilist/anime', anilistId)
          const document = await request(`/anime/${id}/media-relationships?include=destination&page%5Blimit%5D=20`)
          if (!Array.isArray(document.data)) return unavailableFallback('Kitsu', 'Invalid anime relations.')
          const typeMap: Record<string, AnimeRelationType> = { prequel: 'PREQUEL', sequel: 'SEQUEL', side_story: 'SIDE_STORY', parent_story: 'PARENT', spinoff: 'SPIN_OFF', alternative_version: 'ALTERNATIVE', alternative_setting: 'ALTERNATIVE', summary: 'SUMMARY', other: 'OTHER' }
          const relations: Array<{ type: AnimeRelationType; anime: AnimeTitleSummary }> = []
          for (const relation of document.data.filter((resource) => resource.type === 'mediaRelationships').slice(0, 8)) {
            const role = typeof relation.attributes.role === 'string' ? typeMap[relation.attributes.role] : undefined
            const target = relation.relationships?.destination?.data
            if (!role || !target || Array.isArray(target) || target.type !== 'anime') continue
            try {
              const destination = await animeDocument(target.id)
              if (Array.isArray(destination.data)) continue
              const anime = mapAnime(destination.data, destination.included)
              if (anime) {
                await identity.remember(anime.anilistId, anime.malId)
                relations.push({ type: role, anime })
              }
            } catch { /* Missing related metadata does not hide the known title. */ }
          }
          return { main, relations }
        },
      }
    },
  }
}
