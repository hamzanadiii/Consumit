import { describe, expect, it, vi } from 'vitest'
import { AnimeError } from './errors.ts'
import { createAnilistCatalog } from '../catalog/anilist/adapter.ts'
import type { AnilistClient } from '../catalog/anilist/client.ts'
import { assembleAnimeCapability } from './capability.ts'
import { createAnimeIdentityMap, type AnimeIdentityMap, type AnimeMetadataFallback } from './anime-metadata.ts'
import { createKitsuMetadataCatalog } from '../catalog/kitsu/metadata-adapter.ts'
import { createMalCatalog } from '../catalog/mal/adapter.ts'
import { StaleCache } from '../catalog/stale-cache.ts'

function setup(error = new AnimeError('ANILIST_UNAVAILABLE', 'AniList outage.')) {
  const query: AnilistClient['query'] = vi.fn(async () => { throw error })
  const primary = createAnilistCatalog({ query } as AnilistClient)
  const fetch = vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input))
    if (url.pathname.endsWith('/mappings')) return Response.json({ data: [{
      id: '1', type: 'mappings',
      attributes: { externalSite: 'anilist/anime', externalId: '113415' },
      relationships: { item: { data: { id: '42765', type: 'anime' } } },
    }] })
    return Response.json({
      data: { id: '42765', type: 'anime', attributes: { canonicalTitle: 'Jujutsu Kaisen', subtype: 'TV', status: 'finished', nsfw: false }, relationships: { mappings: { data: [{ id: '2', type: 'mappings' }, { id: '3', type: 'mappings' }] } } },
      included: [
        { id: '2', type: 'mappings', attributes: { externalSite: 'anilist/anime', externalId: '113415' } },
        { id: '3', type: 'mappings', attributes: { externalSite: 'myanimelist/anime', externalId: '40748' } },
      ],
    })
  })
  const kitsu = createKitsuMetadataCatalog({ fetch })
  const identity = createAnimeIdentityMap(new StaleCache(), kitsu.aniListIdForMal)
  return { primary, fetch, identity, kitsu }
}

function capability(primary: ReturnType<typeof createAnilistCatalog>, fallbacks: AnimeMetadataFallback[], identity: AnimeIdentityMap) {
  return assembleAnimeCapability({ primaryCatalog: primary, fallbacks, identity, episodeArt: { async episodeByMalId() { return null } } })
}

describe('anime metadata fallback chain', () => {
  it('preserves the primary contract and errors when no fallbacks are configured', async () => {
    const { primary, identity, fetch } = setup()
    const anime = capability(primary, [], identity)
    const catalog = anime.catalog
    expect(anime.service).toBeDefined()
    expect(anime.providerResolvers.title).toBeTypeOf('function')
    expect(catalog).toBe(primary)
    await expect(catalog.batch([113415])).rejects.toMatchObject({ code: 'ANILIST_UNAVAILABLE' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('recovers a cold AniList detail from Kitsu and learns the MAL crosswalk', async () => {
    const { primary, fetch, identity, kitsu } = setup()
    const catalog = capability(primary, [kitsu.fallback(identity)], identity).catalog
    expect(await identity.malIdForAniList(113415)).toBeNull()
    expect(await catalog.title(113415)).toMatchObject({ anilistId: 113415, malId: 40748 })
    expect(await identity.malIdForAniList(113415)).toBe(40748)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('keeps healthy AniList results without querying a fallback', async () => {
    const { primary, identity, kitsu, fetch } = setup()
    const source = kitsu.fallback(identity)
    const detail = await source.title(113415, null)
    fetch.mockClear()
    vi.spyOn(primary, 'title').mockResolvedValue(detail)
    const fallbackTitle = vi.spyOn(source, 'title')
    const catalog = capability(primary, [source], identity).catalog
    expect(await catalog.title(113415)).toEqual(detail)
    expect(fallbackTitle).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('tries MAL before Kitsu and falls through when MAL is unavailable', async () => {
    const { primary, identity, kitsu, fetch } = setup()
    await identity.remember(113415, 40748)
    const malFetch = vi.fn(async () => new Response('', { status: 503 }))
    const mal = createMalCatalog({ clientId: 'test-client', identity, fetch: malFetch })
    const catalog = capability(primary, [mal, kitsu.fallback(identity)], identity).catalog
    expect(await catalog.title(113415)).toMatchObject({ anilistId: 113415, malId: 40748 })
    expect(malFetch).toHaveBeenCalledTimes(1)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('does not send unknown MAL ids and still reaches Kitsu', async () => {
    const { primary, identity, kitsu } = setup()
    const malFetch = vi.fn(async () => new Response('', { status: 503 }))
    const mal = createMalCatalog({ clientId: 'test-client', identity, fetch: malFetch })
    const catalog = capability(primary, [mal, kitsu.fallback(identity)], identity).catalog
    expect(await catalog.title(113415)).toMatchObject({ anilistId: 113415 })
    expect(malFetch).not.toHaveBeenCalled()
  })

  it('preserves primary not-found behavior without consulting fallbacks', async () => {
    const { primary, identity, kitsu, fetch } = setup(new AnimeError('ANIME_NOT_FOUND', 'Missing title.'))
    const catalog = capability(primary, [kitsu.fallback(identity)], identity).catalog
    await expect(catalog.title(113415)).rejects.toMatchObject({ code: 'ANIME_NOT_FOUND' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('keeps a failed Kitsu request as unavailable instead of fabricating metadata', async () => {
    const { primary, identity, kitsu, fetch } = setup()
    fetch.mockImplementation(async () => new Response('', { status: 429 }))
    const catalog = capability(primary, [kitsu.fallback(identity)], identity).catalog
    await expect(catalog.title(113415)).rejects.toMatchObject({ code: 'ANILIST_UNAVAILABLE' })
  })

  it('keeps outage batch work bounded and retains missing AniList references', async () => {
    const { primary, identity, kitsu } = setup()
    const fallback = kitsu.fallback(identity)
    const title = vi.spyOn(fallback, 'title')
    const catalog = capability(primary, [fallback], identity).catalog
    const ids = [113415, 21, 22, 23, 24, 25, 26, 27, 28, 29]
    const result = await catalog.batch(ids)
    expect(result.items.map((item) => item.anilistId)).toEqual([113415])
    expect(result.missing).toEqual(ids.slice(1))
    expect(title).toHaveBeenCalledTimes(8)
  })
})
