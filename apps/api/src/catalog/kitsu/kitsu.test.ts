import { describe, expect, it, vi } from 'vitest'
import { createKitsuCatalog } from './adapter.ts'
import { createFakeKitsuCatalog } from './fake-kitsu.ts'

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

function json(text: string, status = 200) {
  return { status, ok: status >= 200 && status < 300, text: async () => text, json: async () => JSON.parse(text) } as unknown as Response
}

function client(routes: { match: string; text: string; status?: number }[]) {
  const fetchMock = vi.fn<FetchLike>(async (input) => {
    const url = String(input)
    const route = routes.find((entry) => url.includes(entry.match))
    if (!route) throw new Error(`Unexpected Kitsu request ${url}`)
    return json(route.text, route.status ?? 200)
  })
  return fetchMock
}

const MAPPING = JSON.stringify({
  data: [{ relationships: { item: { links: { related: 'https://kitsu.io/api/edge/mappings/1/relationships/item' } } } }],
})
const LINKAGE = JSON.stringify({ data: { id: '9', type: 'anime' } })
const EPISODE = JSON.stringify({
  data: [{ attributes: {
    number: 5,
    canonicalTitle: 'Ballad of Fallen Angels',
    synopsis: 'Spike stares down his past.',
    airdate: '1998-05-01',
    thumbnail: { original: 'https://media.kitsu.app/episodes/thumbnails/9/original.jpeg' },
  } }],
  meta: { count: 1 },
})

describe('Kitsu episode-art adapter', () => {
  it('resolves an episode through the MAL mapping', async () => {
    const fetchMock = client([
      { match: '/mappings?', text: MAPPING },
      { match: '/relationships/item', text: LINKAGE },
      { match: '/episodes?', text: EPISODE },
    ])
    const catalog = createKitsuCatalog({ fetch: fetchMock })
    const art = await catalog.episodeByMalId(4, 5)
    expect(art).toMatchObject({
      kitsuId: '9',
      episode: 5,
      title: 'Ballad of Fallen Angels',
      stillUrl: 'https://media.kitsu.app/episodes/thumbnails/9/original.jpeg',
    })
    expect(fetchMock.mock.calls[0]?.[0]).toContain('filter[externalId]=4')
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('filter[number]=5'))).toBe(true)
  })

  it('returns null for unknown mappings, episodes, and ids', async () => {
    const empty = createKitsuCatalog({ fetch: client([{ match: '/mappings?', text: JSON.stringify({ data: [] }) }]) })
    expect(await empty.episodeByMalId(999, 1)).toBeNull()
    expect(await empty.episodeByMalId(0, 1)).toBeNull()
    expect(await empty.episodeByMalId(4, 0)).toBeNull()
    const mismatch = createKitsuCatalog({ fetch: client([
      { match: '/mappings?', text: MAPPING },
      { match: '/relationships/item', text: LINKAGE },
      { match: '/episodes?', text: JSON.stringify({ data: [{ attributes: { number: 6, canonicalTitle: null, synopsis: null, airdate: null, thumbnail: null } }], meta: { count: 1 } }) },
    ]) })
    expect(await mismatch.episodeByMalId(4, 5)).toBeNull()
  })

  it('rejects non-https thumbnails', async () => {
    const fetchMock = client([
      { match: '/mappings?', text: MAPPING },
      { match: '/relationships/item', text: LINKAGE },
      { match: '/episodes?', text: JSON.stringify({ data: [{ attributes: { number: 5, canonicalTitle: 'T', synopsis: null, airdate: null, thumbnail: { original: 'http://cdn.example/ep.jpg' } } }] }) },
    ])
    const art = await createKitsuCatalog({ fetch: fetchMock }).episodeByMalId(4, 5)
    expect(art?.stillUrl).toBeNull()
    expect(art?.title).toBe('T')
  })
})

describe('fake Kitsu catalog', () => {
  it('serves canned art by mal id and episode', async () => {
    const catalog = createFakeKitsuCatalog({ '4:5': { kitsuId: '9', title: 'Ballad', synopsis: null, stillUrl: null, airDate: null } })
    expect(await catalog.episodeByMalId(4, 5)).toMatchObject({ episode: 5, title: 'Ballad' })
    expect(await catalog.episodeByMalId(4, 6)).toBeNull()
  })
})
