import { describe, expect, it, vi } from 'vitest'
import { animePageSchema, animeTitleDetailSchema } from '@consumit/contracts'
import { createKitsuMetadataCatalog } from './metadata-adapter.ts'
import { createAnimeIdentityMap, type AnimeIdentityMap } from '../../anime/anime-metadata.ts'
import { StaleCache } from '../stale-cache.ts'

function identity(): AnimeIdentityMap {
  return { remember: vi.fn(async () => undefined), malIdForAniList: async () => null, aniListIdForMal: async () => null }
}

function resourceId(id: string): string {
  return ({ a: '100', m: '101', g: '102', source: '103', other: '104', a2: '105' } as Record<string, string>)[id] ?? id
}

function mapping(id: string, externalSite: string, externalId: number, kitsuId?: string) {
  return {
    id: resourceId(id), type: 'mappings', attributes: { externalSite, externalId: String(externalId) },
    ...(kitsuId ? { relationships: { item: { data: { id: kitsuId, type: 'anime' } } } } : {}),
  }
}

function anime(id = '42765', attributes: Record<string, unknown> = {}, mappingIds = ['a', 'm']) {
  return {
    id, type: 'anime',
    attributes: {
      canonicalTitle: 'Jujutsu Kaisen', titles: { en: 'Sorcery Fight', en_jp: 'Jujutsu Kaisen', ja_jp: '呪術廻戦' },
      synopsis: '<b>A curse.</b>', subtype: 'TV', status: 'current', startDate: '2020-10-03',
      episodeCount: 24, episodeLength: 24, averageRating: '85.9', userCount: 123,
      nsfw: false, ageRating: 'R', posterImage: { original: 'https://media.kitsu.app/poster.jpg' },
      coverImage: { original: 'https://media.kitsu.app/banner.jpg' }, youtubeVideoId: 'VpO6APNqY1c',
      ...attributes,
    },
    relationships: {
      mappings: { data: mappingIds.map((id) => ({ id: resourceId(id), type: 'mappings' })) },
      genres: { data: [{ id: '102', type: 'genres' }] },
    },
  }
}

const included = [mapping('a', 'anilist/anime', 113415), mapping('m', 'myanimelist/anime', 40748), { id: '102', type: 'genres', attributes: { name: 'Action' } }]
const detail = { data: anime(), included }
const page = { data: [anime()], included, meta: { count: 41 } }
const match = { data: [mapping('source', 'anilist/anime', 113415, '42765')], meta: { count: 1 } }

function client(handler: (url: URL) => unknown | Response = (url) => url.pathname.endsWith('/mappings') ? match : detail) {
  return vi.fn(async (input: string | URL | Request, _init?: RequestInit) => {
    const result = handler(new URL(String(input)))
    return result instanceof Response ? result : Response.json(result)
  })
}

describe('Kitsu metadata fallback', () => {
  it('uses current-season popularity with an honest discovery basis during an AniList outage', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-22T12:00:00Z'))
    try {
      const fetch = client(() => page)
      const result = await createKitsuMetadataCatalog({ fetch }).fallback(identity()).trending(1, 20)
      const url = new URL(String(fetch.mock.calls[0]![0]))
      expect(url.searchParams.get('filter[season]')).toBe('fall')
      expect(url.searchParams.get('filter[seasonYear]')).toBe('2026')
      expect(result).toMatchObject({ discoveryBasis: 'seasonal-popularity' })
    } finally { vi.useRealTimers() }
  })

  it('loads a cold AniList title without requiring a previously known MAL id', async () => {
    const fetch = client()
    const ids = identity()
    const source = createKitsuMetadataCatalog({ fetch }).fallback(ids)
    const result = await source.title(113415, null)
    expect(animeTitleDetailSchema.safeParse(result).success).toBe(true)
    expect(result).toMatchObject({ anilistId: 113415, malId: 40748, titles: { preferred: 'Sorcery Fight' }, status: 'RELEASING', averageScore: 86, season: 'FALL', seasonYear: 2020, genres: ['Action'], description: 'A curse.' })
    expect(ids.remember).toHaveBeenCalledWith(113415, 40748)
    expect(fetch).toHaveBeenCalledTimes(2)
    const url = new URL(String(fetch.mock.calls[0]![0]))
    expect(url.searchParams.get('filter[externalSite]')).toBe('anilist/anime')
    expect(url.searchParams.get('filter[externalId]')).toBe('113415')
    expect(fetch.mock.calls.every(([url]) => new URL(String(url)).hostname === 'kitsu.io')).toBe(true)
    expect(fetch.mock.calls[0]![1]?.headers).not.toHaveProperty('authorization')
  })

  it('can return an exact AniList title with no MAL mapping', async () => {
    const fetch = client((url) => url.pathname.endsWith('/mappings') ? match : { data: anime('42765', {}, ['a']), included: [included[0]] })
    expect(await createKitsuMetadataCatalog({ fetch }).fallback(identity()).title(113415, null)).toMatchObject({ anilistId: 113415, malId: null })
    expect(await createKitsuMetadataCatalog({ fetch }).fallback(identity()).title(113415, 40748)).toMatchObject({ anilistId: 113415, malId: 40748 })
  })

  it('maps discovery from linked resources in one request and caches the page', async () => {
    const fetch = client(() => page)
    const source = createKitsuMetadataCatalog({ fetch }).fallback(identity())
    const result = await source.search('Jujutsu Kaisen', 2, 20)
    expect(animePageSchema.safeParse(result).success).toBe(true)
    expect(result).toMatchObject({ page: 2, totalPages: 3, totalResults: 41, items: [{ anilistId: 113415 }] })
    const url = new URL(String(fetch.mock.calls[0]![0]))
    expect(url.searchParams.get('filter[text]')).toBe('Jujutsu Kaisen')
    expect(url.searchParams.get('include')).toBe('mappings,genres')
    expect(url.searchParams.get('page[offset]')).toBe('20')
    await source.search('Jujutsu Kaisen', 2, 20)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('preserves seasonal and browse filters, ordering, and pagination', async () => {
    const fetch = client((url) => url.pathname.endsWith('/categories') ? { data: [{ id: '155', type: 'categories', attributes: { slug: 'science-fiction' } }] } : page)
    const source = createKitsuMetadataCatalog({ fetch }).fallback(identity())
    await source.trending(1, 20)
    await source.seasonal('FALL', 2026, 2, 20)
    await source.browse!({ sort: 'top-rated', page: 3, year: 2020, genre: 'Science Fiction', format: 'MOVIE' }, 20)
    for (const sort of ['popular', 'new', 'old'] as const) await source.browse!({ sort, page: 1 }, 20)
    const urls = fetch.mock.calls.map(([input]) => new URL(String(input))).filter((url) => url.pathname.endsWith('/anime'))
    expect(urls.map((url) => url.searchParams.get('sort'))).toEqual(['-userCount', '-userCount', '-averageRating', '-userCount', '-startDate', 'startDate'])
    expect(urls[1]!.searchParams.get('filter[season]')).toBe('fall')
    expect(urls[1]!.searchParams.get('filter[seasonYear]')).toBe('2026')
    expect(urls[2]!.searchParams.get('filter[categories]')).toBe('science-fiction')
    expect(urls[2]!.searchParams.get('filter[subtype]')).toBe('MOVIE')
    expect(urls[2]!.searchParams.get('page[offset]')).toBe('40')
    await expect(source.browse!({ sort: 'popular', page: 1, format: 'TV_SHORT' }, 20)).rejects.toMatchObject({ code: 'ANILIST_UNAVAILABLE' })
  })

  it('never drops an unknown genre filter, and translates the Sci-Fi alias', async () => {
    const fetch = client((url) => url.pathname.endsWith('/categories')
      ? { data: url.searchParams.get('filter[slug]') === 'science-fiction' ? [{ id: '155', type: 'categories', attributes: { slug: 'science-fiction' } }] : [] }
      : page)
    const source = createKitsuMetadataCatalog({ fetch }).fallback(identity())
    expect(await source.browse!({ sort: 'popular', page: 1, genre: 'Unknown genre' }, 20)).toMatchObject({ items: [], totalResults: 0 })
    expect(fetch).toHaveBeenCalledTimes(1)
    await source.browse!({ sort: 'popular', page: 1, genre: 'Sci-Fi' }, 20)
    expect(new URL(String(fetch.mock.calls[2]![0])).searchParams.get('filter[categories]')).toBe('science-fiction')
  })

  it('drops adult, manga and unmapped records without inventing identity', async () => {
    const fetch = client(() => ({ ...page, data: [anime(), anime('2', { nsfw: true }), anime('3', { ageRating: 'R18' }), anime('4', {}, []), { ...anime('5'), type: 'manga' }] }))
    const result = await createKitsuMetadataCatalog({ fetch }).fallback(identity()).trending(1, 20)
    expect(result.items.map((item) => item.anilistId)).toEqual([113415])
  })

  it('does not use unrelated included mappings or ambiguous AniList mappings', async () => {
    const fetch = client(() => ({ data: [anime('42765', {}, ['m'])], included }))
    await expect(createKitsuMetadataCatalog({ fetch }).fallback(identity()).trending(1, 20)).rejects.toMatchObject({ code: 'ANILIST_UNAVAILABLE' })
    const conflicting = client(() => ({ data: [anime('42765', {}, ['a', 'a2'])], included: [...included, mapping('a2', 'anilist/anime', 21)] }))
    await expect(createKitsuMetadataCatalog({ fetch: conflicting }).fallback(identity()).trending(1, 20)).rejects.toMatchObject({ code: 'ANILIST_UNAVAILABLE' })
  })

  it.each([
    { ...match, data: [] },
    { data: [mapping('source', 'anilist/anime', 21, '42765')] },
    { data: [mapping('source', 'anilist/anime', 113415, '42765'), mapping('other', 'anilist/anime', 113415, '99')] },
    { ...match, meta: { count: 3 } },
    { data: [{ ...mapping('source', 'anilist/anime', 113415), relationships: { item: { data: { id: '9', type: 'manga' } } } }] },
  ])('refuses missing, mismatched or ambiguous exact mappings %#', async (document) => {
    const fetch = client(() => document)
    await expect(createKitsuMetadataCatalog({ fetch }).fallback(identity()).title(113415, null)).rejects.toMatchObject({ code: 'ANILIST_UNAVAILABLE' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('rejects conflicting title identity before remembering any crosswalk', async () => {
    const ids = identity()
    const source = createKitsuMetadataCatalog({ fetch: client() }).fallback(ids)
    await expect(source.title(113415, 21)).rejects.toMatchObject({ code: 'ANILIST_UNAVAILABLE' })
    expect(ids.remember).not.toHaveBeenCalled()
    const wrong = client((url) => url.pathname.endsWith('/mappings') ? match : { ...detail, included: [mapping('a', 'anilist/anime', 21), included[1]] })
    await expect(createKitsuMetadataCatalog({ fetch: wrong }).fallback(ids).title(113415, null)).rejects.toMatchObject({ code: 'ANILIST_UNAVAILABLE' })
    expect(ids.remember).not.toHaveBeenCalled()
  })

  it('resolves the MAL adapter crosswalk through Kitsu alone', async () => {
    const fetch = client((url) => url.pathname.endsWith('/mappings') ? { data: [mapping('source', 'myanimelist/anime', 40748, '42765')] } : detail)
    const catalog = createKitsuMetadataCatalog({ fetch })
    const ids = createAnimeIdentityMap(new StaleCache(), catalog.aniListIdForMal)
    expect(await ids.aniListIdForMal(40748)).toBe(113415)
    expect(await ids.malIdForAniList(113415)).toBe(40748)
    const mismatched = client((url) => url.pathname.endsWith('/mappings') ? { data: [mapping('source', 'myanimelist/anime', 99, '42765')] } : detail)
    expect(await createKitsuMetadataCatalog({ fetch: mismatched }).aniListIdForMal(40748)).toBeNull()
  })

  it.each([429, 403, 503])('reports HTTP %i as a retryable metadata outage', async (status) => {
    const fetch = client(() => new Response('', { status }))
    await expect(createKitsuMetadataCatalog({ fetch }).fallback(identity()).trending(1, 20)).rejects.toMatchObject({ code: 'ANILIST_UNAVAILABLE', retryable: true })
  })

  it.each([{}, { data: [{ id: '1', type: 'anime', attributes: {} }] }, new Response('<html>bad upstream</html>')])('rejects malformed payloads %#', async (payload) => {
    await expect(createKitsuMetadataCatalog({ fetch: client(() => payload) }).fallback(identity()).trending(1, 20)).rejects.toMatchObject({ code: 'ANILIST_UNAVAILABLE' })
  })

  it('reports network failure safely and attaches a bounded request deadline', async () => {
    const fetch = vi.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      expect(init?.signal).toBeInstanceOf(AbortSignal)
      throw new TypeError('offline')
    })
    await expect(createKitsuMetadataCatalog({ fetch }).fallback(identity()).trending(1, 20)).rejects.toMatchObject({ code: 'ANILIST_UNAVAILABLE', retryable: true })
  })

  it('retains stale metadata when Kitsu is unavailable', async () => {
    let now = 0
    const cache = new StaleCache(() => now)
    const fetch = client(() => page)
    const source = createKitsuMetadataCatalog({ cache, fetch }).fallback(identity())
    await source.trending(1, 20)
    now = 16 * 60_000
    fetch.mockImplementation(async () => { throw new Error('offline') })
    expect((await source.trending(1, 20)).items[0]?.anilistId).toBe(113415)
  })

  it('returns honest empty pages and rejects unsafe image URLs', async () => {
    const empty = createKitsuMetadataCatalog({ fetch: client(() => ({ data: [], meta: { count: 0 } })) }).fallback(identity())
    expect(await empty.search('unknown', 1, 20)).toEqual({ items: [], page: 1, totalPages: 1, totalResults: 0 })
    const unsafe = client((url) => url.pathname.endsWith('/mappings') ? match : { ...detail, data: anime('42765', { posterImage: { original: 'javascript:alert(1)' }, coverImage: { original: 'https://user:pass@example.com/image' } }) })
    expect(await createKitsuMetadataCatalog({ fetch: unsafe }).fallback(identity()).title(113415, null)).toMatchObject({ coverImage: { url: null }, bannerImage: null })
  })

  it('maps only anime franchise destinations and keeps missing relations out', async () => {
    const fetch = client((url) => {
      if (url.pathname.endsWith('/media-relationships')) return { data: [
        { id: '1', type: 'mediaRelationships', attributes: { role: 'sequel' }, relationships: { destination: { data: { id: '99', type: 'anime' } } } },
        { id: '2', type: 'mediaRelationships', attributes: { role: 'other' }, relationships: { destination: { data: { id: '10', type: 'manga' } } } },
      ] }
      if (url.pathname.endsWith('/anime/99')) return { data: anime('99'), included: [mapping('a', 'anilist/anime', 145064), mapping('m', 'myanimelist/anime', 51009)] }
      return url.pathname.endsWith('/mappings') ? match : detail
    })
    const result = await createKitsuMetadataCatalog({ fetch }).fallback(identity()).relations!(113415, null)
    expect(result).toMatchObject({ main: { anilistId: 113415 }, relations: [{ type: 'SEQUEL', anime: { anilistId: 145064 } }] })
    expect(fetch.mock.calls.some(([url]) => String(url).includes('/anime/10?'))).toBe(false)
  })
})
