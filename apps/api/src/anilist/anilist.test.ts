import { describe, expect, it, vi } from 'vitest'

import { createAnilistAdapter } from './anilist-adapter.ts'
import { createFakeAnilist, fakeAnimeFixtures } from './fake-anilist.ts'
import { consumitIdForAnilist, mediaIdentityForAnime } from './media-identity.ts'
import { lookupTitlesFor } from './shared.ts'

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    headers: { 'content-type': 'application/json' },
    ...init,
  })
}

const media = {
  id: 1,
  idMal: 1,
  title: { romaji: 'Cowboy Bebop', english: 'Cowboy Bebop', native: 'カウボーイビバップ' },
  description: 'In the year 2071, <b>bounty hunters</b> travel the solar system.',
  coverImage: { large: 'https://cdn.example/cowboy-bebop.jpg' },
  bannerImage: null,
  format: 'TV',
  status: 'FINISHED',
  season: 'SPRING',
  seasonYear: 1998,
  episodes: 26,
  averageScore: 86,
  genres: ['Action', 'Sci-Fi'],
  tags: [{ name: 'Space', rank: 90 }],
  relations: { edges: [
    { relationType: 'SUMMARY', node: { id: 5, title: { romaji: null, english: 'Cowboy Bebop: The Movie', native: null }, format: 'MOVIE', status: 'FINISHED' } },
  ] },
}

describe('consumit media identity', () => {
  it('keeps one permanent internal id with external ids as mappings', () => {
    const first = mediaIdentityForAnime({ anilistId: 1, malId: 1 })
    const second = mediaIdentityForAnime({ anilistId: 1, malId: 1 })
    expect(first.consumitId).toBe(second.consumitId)
    expect(first.consumitId).toMatch(/^c_[A-Za-z0-9_-]{8,64}$/)
    expect(first.anilistId).toBe(1)
    expect(first.malId).toBe(1)
    expect(consumitIdForAnilist(1)).not.toBe(consumitIdForAnilist(5))
  })

  it('orders provider lookup titles english-first', () => {
    expect(lookupTitlesFor(fakeAnimeFixtures[0]!)).toEqual(['Cowboy Bebop', 'カウボーイビバップ'])
  })
})

describe('fake anilist adapter', () => {
  it('serves detail, search, and relations without network access', async () => {
    const anilist = createFakeAnilist()
    await expect(anilist.anime(1)).resolves.toMatchObject({ item: { anilistId: 1, malId: 1 } })
    await expect(anilist.anime(999_999)).rejects.toMatchObject({ code: 'CATALOG_NOT_FOUND' })
    await expect(anilist.searchAnime({ query: 'bebop', page: 1 })).resolves.toMatchObject({ totalResults: 1 })
    await expect(anilist.searchAnime({ query: 'zzz-no-such-title', page: 1 })).resolves.toMatchObject({ totalResults: 0 })
    const { item } = await anilist.anime(5114)
    expect(item.relations.map((relation) => relation.relationType)).toContain('adaptation')
  })
})

describe('anilist adapter', () => {
  it('normalizes hostile upstream output and maps franchise relations', async () => {
    const fetchMock = vi.fn(async () => json({ data: { Media: media } }))
    const anilist = createAnilistAdapter({ fetch: fetchMock })
    const { item } = await anilist.anime(1)
    expect(item.title).toBe('Cowboy Bebop')
    expect(item.description).toBe('In the year 2071, bounty hunters travel the solar system.')
    expect(item.identity).toMatchObject({ anilistId: 1, malId: 1 })
    expect(item.identity.consumitId).toMatch(/^c_/)
    expect(item.relations).toMatchObject([{ relationType: 'summary', anilistId: 5 }])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    // Cached detail does not refetch.
    await anilist.anime(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('searches by title and validates the page contract', async () => {
    const fetchMock = vi.fn(async () => json({ data: { Page: { media: [media] } } }))
    const anilist = createAnilistAdapter({ fetch: fetchMock })
    const page = await anilist.searchAnime({ query: 'Cowboy Bebop', page: 1 })
    expect(page.items).toHaveLength(1)
    expect(page.meta.source).toBe('anilist')
    await expect(anilist.searchAnime({ query: '  ', page: 1 })).rejects.toMatchObject({ code: 'CATALOG_INVALID_QUERY' })
  })

  it('treats missing media as not found and retries rate limits once', async () => {
    const missing = createAnilistAdapter({ fetch: vi.fn(async () => json({ data: { Media: null } })) })
    await expect(missing.anime(999_999)).rejects.toMatchObject({ code: 'CATALOG_NOT_FOUND' })

    const flaky = vi.fn()
      .mockResolvedValueOnce(new Response('slow down', { status: 429 }))
      .mockResolvedValueOnce(json({ data: { Page: { media: [] } } }))
    const recovered = createAnilistAdapter({ fetch: flaky, sleep: async () => undefined })
    await expect(recovered.searchAnime({ query: 'bebop', page: 1 })).resolves.toMatchObject({ totalResults: 0 })
    expect(flaky).toHaveBeenCalledTimes(2)
  })
})
