import type {
  AnimeAiringSchedule,
  AnimeBatch,
  AnimeFranchise,
  AnimePage,
  AnimeSearchResult,
  AnimeTitleDetail,
  AnimeTitleSummary,
} from '@consumit/contracts'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { buildApp } from '../app.ts'
import type { AnimeCatalog } from '../catalog/anilist/adapter.ts'
import { AnimeError } from './errors.ts'

const summary: AnimeTitleSummary = {
  anilistId: 1,
  averageScore: 85,
  bannerImage: null,
  coverImage: { color: null, url: null },
  description: 'A show.',
  episodeDuration: 24,
  episodes: 12,
  format: 'TV',
  genres: ['Drama'],
  kind: 'anime',
  nextAiringEpisode: null,
  popularity: 1_000,
  season: 'SPRING',
  seasonYear: 2024,
  status: 'FINISHED',
  titles: { english: 'Example', native: null, preferred: 'Example', romaji: 'Example' },
}

const detail: AnimeTitleDetail = {
  ...summary,
  characters: [],
  countryOfOrigin: 'JP',
  externalLinks: [],
  logoUrl: null,
  malId: null,
  recommendations: [],
  source: null,
  staff: [],
  streamingEpisodes: [],
  trailer: null,
}
const page: AnimePage = { items: [summary], page: 1, totalPages: 1, totalResults: 1 }
const search: AnimeSearchResult = page
const franchise: AnimeFranchise = { main: summary, relations: [] }
const airing: AnimeAiringSchedule = { episodes: [], page: 1, totalPages: 0 }
const batch: AnimeBatch = { items: [summary], missing: [] }

function fakeAnimeCatalog(): AnimeCatalog {
  return {
    airingSchedule: vi.fn(async () => airing),
    batch: vi.fn(async () => batch),
    relations: vi.fn(async () => franchise),
    search: vi.fn(async () => search),
    seasonal: vi.fn(async () => page),
    title: vi.fn(async () => detail),
    trending: vi.fn(async () => page),
  }
}

const openApps: Awaited<ReturnType<typeof buildApp>>[] = []

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()))
})

describe('anime routes', () => {
  it('validates route input before calling the metadata adapter', async () => {
    const animeCatalog = fakeAnimeCatalog()
    const app = await buildApp({ animeCatalog })
    openApps.push(app)

    const responses = await Promise.all([
      app.inject({ method: 'GET', url: '/v1/anime/search?q=a' }),
      app.inject({ method: 'GET', url: '/v1/anime/trending?page=501' }),
      app.inject({ method: 'GET', url: '/v1/anime/1.5' }),
      app.inject({ method: 'GET', url: '/v1/anime/batch?ids=1,nope' }),
    ])

    expect(responses.map((response) => response.statusCode)).toEqual([400, 400, 400, 400])
    expect(animeCatalog.search).not.toHaveBeenCalled()
    expect(animeCatalog.trending).not.toHaveBeenCalled()
    expect(animeCatalog.title).not.toHaveBeenCalled()
    expect(animeCatalog.batch).not.toHaveBeenCalled()
  })

  it('preserves upstream outages instead of answering with a false 404', async () => {
    const animeCatalog = fakeAnimeCatalog()
    vi.mocked(animeCatalog.title).mockRejectedValueOnce(new AnimeError('ANILIST_UNAVAILABLE', 'AniList is unavailable.', { retryable: true }))
    const app = await buildApp({ animeCatalog })
    openApps.push(app)

    const response = await app.inject({ method: 'GET', url: '/v1/anime/1' })

    expect(response.statusCode).toBe(503)
    expect(response.json()).toEqual({
      error: {
        code: 'ANILIST_UNAVAILABLE',
        message: 'AniList is unavailable.',
        requestId: expect.any(String),
        retryable: true,
      },
    })
  })

  it('exposes a contract-checked anime detail response', async () => {
    const app = await buildApp({ animeCatalog: fakeAnimeCatalog() })
    openApps.push(app)

    const response = await app.inject({ method: 'GET', url: '/v1/anime/1' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toMatchObject({ anilistId: 1, status: 'FINISHED', coverImage: { url: null } })
  })

  it('uses exact canonical episode metadata for a separately cataloged anime season', async () => {
    const animeCatalog = fakeAnimeCatalog()
    vi.mocked(animeCatalog.title).mockResolvedValue({ ...detail, anilistId: 142853, malId: null, episodeDuration: 24 })
    const episodeByAnilistId = vi.fn(async (id: number, number: number) => id === 142853 && number === 1
      ? { title: 'It Is What It Is', synopsis: 'Back in the present.', stillUrl: 'https://artworks.thetvdb.com/banners/season2-episode1.jpg', airDate: '2023-01-08' }
      : null)
    const app = await buildApp({
      animeCatalog,
      animeCanonicalEpisodeArt: { episodeByAnilistId },
      animeEpisodeArt: { episodeByMalId: async () => null },
      animeTmdbEpisodeArt: { titleLogo: async () => null, episodeByTitle: async () => null },
    })
    openApps.push(app)

    const hit = await app.inject({ method: 'GET', url: '/v1/anime/142853/episodes/1' })
    expect(hit.statusCode).toBe(200)
    expect(hit.json()).toMatchObject({ anilistId: 142853, number: 1, title: 'It Is What It Is', thumbnail: 'https://artworks.thetvdb.com/banners/season2-episode1.jpg', duration: 24 })
    expect(episodeByAnilistId).toHaveBeenCalledWith(142853, 1)
    expect((await app.inject({ method: 'GET', url: '/v1/anime/142853/episodes/99' })).statusCode).toBe(404)
  })

  it('fills partial canonical metadata from existing episode art', async () => {
    const animeCatalog = fakeAnimeCatalog()
    vi.mocked(animeCatalog.title).mockResolvedValue({ ...detail, malId: 21 })
    const app = await buildApp({
      animeCatalog,
      animeCanonicalEpisodeArt: { episodeByAnilistId: async () => ({ title: 'Canonical title', synopsis: null, stillUrl: null, airDate: '2023-01-08' }) },
      animeTmdbEpisodeArt: { titleLogo: async () => null, episodeByTitle: async () => ({ tmdbId: 1, season: 1, episode: 1, title: null, overview: 'Episode overview', stillUrl: 'https://image.tmdb.org/t/p/w780/episode.jpg', airDate: null }) },
      animeEpisodeArt: { episodeByMalId: async () => { throw new Error('Kitsu unavailable') } },
    })
    openApps.push(app)
    const hit = await app.inject({ method: 'GET', url: '/v1/anime/1/episodes/1' })
    expect(hit.statusCode).toBe(200)
    expect(hit.json()).toMatchObject({ title: 'Canonical title', thumbnail: 'https://image.tmdb.org/t/p/w780/episode.jpg', description: 'Episode overview', airDate: '2023-01-08' })
  })

  it('keeps a canonical still when a title fallback fails', async () => {
    const animeCatalog = fakeAnimeCatalog()
    vi.mocked(animeCatalog.title).mockResolvedValue({ ...detail, malId: 21 })
    const app = await buildApp({
      animeCatalog,
      animeCanonicalEpisodeArt: { episodeByAnilistId: async () => ({ title: null, synopsis: null, stillUrl: 'https://artworks.thetvdb.com/banners/episode.jpg', airDate: '2023-01-08' }) },
      animeTmdbEpisodeArt: { titleLogo: async () => null, episodeByTitle: async () => null },
      animeEpisodeArt: { episodeByMalId: async () => { throw new Error('Kitsu unavailable') } },
    })
    openApps.push(app)
    const hit = await app.inject({ method: 'GET', url: '/v1/anime/1/episodes/1' })
    expect(hit.statusCode).toBe(200)
    expect(hit.json()).toMatchObject({ title: null, thumbnail: 'https://artworks.thetvdb.com/banners/episode.jpg', airDate: '2023-01-08' })
  })

  it('falls back to existing art when canonical metadata is unavailable', async () => {
    const app = await buildApp({
      animeCatalog: fakeAnimeCatalog(),
      animeCanonicalEpisodeArt: { episodeByAnilistId: async () => { throw new Error('Mapping unavailable') } },
      animeTmdbEpisodeArt: { titleLogo: async () => null, episodeByTitle: async () => ({ tmdbId: 1, season: 1, episode: 1, title: 'Existing episode', overview: null, stillUrl: 'https://image.tmdb.org/t/p/w780/episode.jpg', airDate: null }) },
    })
    openApps.push(app)
    const hit = await app.inject({ method: 'GET', url: '/v1/anime/1/episodes/1' })
    expect(hit.statusCode).toBe(200)
    expect(hit.json()).toMatchObject({ title: 'Existing episode', thumbnail: 'https://image.tmdb.org/t/p/w780/episode.jpg' })
  })

  it('serves episode art through the Kitsu mapping and 404s misses', async () => {
    const animeCatalog = fakeAnimeCatalog()
    vi.mocked(animeCatalog.title).mockResolvedValue({ ...detail, malId: 21 })
    const episodeArt = {
      episodeByMalId: vi.fn(async (malId: number, episode: number) => (
        malId === 21 && episode === 5
          ? { kitsuId: '9', episode: 5, title: 'Ballad', synopsis: 'A past.', stillUrl: 'https://media.kitsu.app/x.jpeg', airDate: '1998-05-01' }
          : null
      )),
    }
    const app = await buildApp({ animeCatalog, animeEpisodeArt: episodeArt })
    openApps.push(app)

    const hit = await app.inject({ method: 'GET', url: '/v1/anime/21/episodes/5' })
    expect(hit.statusCode).toBe(200)
    expect(hit.json()).toMatchObject({ anilistId: 21, number: 5, title: 'Ballad', thumbnail: 'https://media.kitsu.app/x.jpeg' })
    expect(episodeArt.episodeByMalId).toHaveBeenCalledWith(21, 5)
    expect((await app.inject({ method: 'GET', url: '/v1/anime/21/episodes/6' })).statusCode).toBe(404)
    expect((await app.inject({ method: 'GET', url: '/v1/anime/21/episodes/0' })).statusCode).toBe(400)
  })

  it('batches only a bounded visible page and caches partial episode details', async () => {
    const animeCatalog = fakeAnimeCatalog()
    vi.mocked(animeCatalog.title).mockResolvedValue({ ...detail, malId: 21 })
    const episodeByMalId = vi.fn(async (_malId: number, episode: number) => episode === 5
      ? { kitsuId: '9', episode: 5, title: 'Ballad', synopsis: 'A past.', stillUrl: 'https://media.kitsu.app/x.jpeg', airDate: '1998-05-01' }
      : null)
    const app = await buildApp({ animeCatalog, animeEpisodeArt: { episodeByMalId } })
    openApps.push(app)
    const url = '/v1/anime/21/episodes?numbers=5,6'
    const first = await app.inject({ method: 'GET', url })
    expect(first.statusCode).toBe(200)
    expect(first.json().episodes).toMatchObject([{ number: 5, title: 'Ballad', description: 'A past.' }, null])
    expect((await app.inject({ method: 'GET', url })).statusCode).toBe(200)
    expect(episodeByMalId).toHaveBeenCalledTimes(2)
    expect((await app.inject({ method: 'GET', url: '/v1/anime/21/episodes?numbers=5,5' })).statusCode).toBe(400)
    expect((await app.inject({ method: 'GET', url: `/v1/anime/21/episodes?numbers=${Array.from({ length: 25 }, (_, index) => index + 1).join(',')}` })).statusCode).toBe(400)
  })

  it('404s episode art without a MAL mapping', async () => {
    const app = await buildApp({ animeCatalog: fakeAnimeCatalog(), animeEpisodeArt: { episodeByMalId: async () => null } })
    openApps.push(app)

    // detail.malId is null in the fixture.
    expect((await app.inject({ method: 'GET', url: '/v1/anime/1/episodes/1' })).statusCode).toBe(404)
  })

  it('prefers TMDB art as the primary source when both answer', async () => {
    const animeCatalog = fakeAnimeCatalog()
    vi.mocked(animeCatalog.title).mockResolvedValue({ ...detail, malId: 21 })
    const app = await buildApp({
      animeCatalog,
      animeEpisodeArt: {
        episodeByMalId: async () => ({ kitsuId: '9', episode: 5, title: 'Ballad', synopsis: 'A past.', stillUrl: 'https://media.kitsu.app/x.jpeg', airDate: '1998-05-01' }),
      },
      animeTmdbEpisodeArt: {
        titleLogo: async () => null,
        episodeByTitle: async () => ({ tmdbId: 34969, season: 1, episode: 5, title: 'Ballad of Fallen Angels', overview: 'Spike...', stillUrl: 'https://image.tmdb.org/t/p/w780/y.jpg', airDate: '1998-05-01' }),
      },
    })
    openApps.push(app)

    const hit = await app.inject({ method: 'GET', url: '/v1/anime/21/episodes/5' })
    expect(hit.statusCode).toBe(200)
    expect(hit.json()).toMatchObject({ thumbnail: 'https://image.tmdb.org/t/p/w780/y.jpg', title: 'Ballad of Fallen Angels' })
  })

  it('prefers TMDB stills when Kitsu knows the title but has no art', async () => {
    const animeCatalog = fakeAnimeCatalog()
    vi.mocked(animeCatalog.title).mockResolvedValue({ ...detail, malId: 820 })
    const app = await buildApp({
      animeCatalog,
      animeEpisodeArt: {
        episodeByMalId: async () => ({ kitsuId: '727', episode: 1, title: 'In the Eternal Night', synopsis: null, stillUrl: null, airDate: null }),
      },
      animeTmdbEpisodeArt: {
        titleLogo: async () => null,
        episodeByTitle: async () => ({ tmdbId: 27660, season: 1, episode: 1, title: 'In the Eternal Night', overview: 'Lupin...', stillUrl: 'https://image.tmdb.org/t/p/w780/logh.jpg', airDate: '1988-04-09' }),
      },
    })
    openApps.push(app)

    const hit = await app.inject({ method: 'GET', url: '/v1/anime/820/episodes/1' })
    expect(hit.statusCode).toBe(200)
    expect(hit.json()).toMatchObject({ anilistId: 820, number: 1, thumbnail: 'https://image.tmdb.org/t/p/w780/logh.jpg' })
  })

  it('enriches titles with TMDB hero logos without blocking on failure', async () => {
    const app = await buildApp({
      animeCatalog: fakeAnimeCatalog(),
      animeTmdbEpisodeArt: {
        titleLogo: async () => ({ tmdbId: 1, kind: 'series' as const, logoUrl: 'https://image.tmdb.org/t/p/w500/logo.png' }),
        episodeByTitle: async () => null,
      },
    })
    openApps.push(app)

    const hit = await app.inject({ method: 'GET', url: '/v1/anime/1' })
    expect(hit.statusCode).toBe(200)
    expect(hit.json()).toMatchObject({ logoUrl: 'https://image.tmdb.org/t/p/w500/logo.png' })

    const failing = await buildApp({
      animeCatalog: fakeAnimeCatalog(),
      animeTmdbEpisodeArt: {
        titleLogo: async () => { throw new Error('tmdb down') },
        episodeByTitle: async () => null,
      },
    })
    openApps.push(failing)
    const fallback = await failing.inject({ method: 'GET', url: '/v1/anime/1' })
    expect(fallback.statusCode).toBe(200)
    expect(fallback.json()).toMatchObject({ logoUrl: null })
  })

  it('matches TMDB titles to anime entries and 404s misses', async () => {
    const search = vi.fn(async (query: string) => ({
      items: query === 'Cowboy Bebop' ? [{
        anilistId: 1,
        kind: 'anime',
        titles: { english: 'Cowboy Bebop', romaji: 'Cowboy Bebop', native: null, preferred: 'Cowboy Bebop' },
        seasonYear: 1998,
      }] : [],
      page: 1, totalPages: 1, totalResults: 1,
    }))
    const app = await buildApp({ animeCatalog: { ...fakeAnimeCatalog(), search } as never })
    openApps.push(app)

    const hit = await app.inject({ method: 'GET', url: '/v1/anime/match?title=Cowboy%20Bebop&year=1998' })
    expect(hit.statusCode).toBe(200)
    expect(hit.json()).toEqual({ anilistId: 1 })
    expect((await app.inject({ method: 'GET', url: '/v1/anime/match?title=Something%20Else&year=1998' })).statusCode).toBe(404)
    expect((await app.inject({ method: 'GET', url: '/v1/anime/match' })).statusCode).toBe(400)
  })

  it('404s usable-empty art instead of serving blank tracks', async () => {
    const animeCatalog = fakeAnimeCatalog()
    vi.mocked(animeCatalog.title).mockResolvedValue({ ...detail, malId: 21 })
    const app = await buildApp({
      animeCatalog,
      animeEpisodeArt: {
        episodeByMalId: async () => ({ kitsuId: '9', episode: 1, title: null, synopsis: null, stillUrl: null, airDate: null }),
      },
    })
    openApps.push(app)

    expect((await app.inject({ method: 'GET', url: '/v1/anime/21/episodes/1' })).statusCode).toBe(404)
  })

  it('falls back to TMDB when Kitsu misses, staying a 404 on failure', async () => {
    const animeCatalog = fakeAnimeCatalog()
    vi.mocked(animeCatalog.title).mockResolvedValue({
      ...detail,
      malId: 21,
      titles: { english: 'Cowboy Bebop', native: null, preferred: 'Cowboy Bebop', romaji: 'Cowboy Bebop' },
      seasonYear: 1998,
    })
    const tmdbEpisodeArt = {
      titleLogo: vi.fn(async () => null),
      episodeByTitle: vi.fn(async (_anilistId: number, _titles: unknown, _year: number | null, episode: number) => (
        episode === 5
          ? { tmdbId: 34969, season: 1, episode: 5, title: 'Ballad', overview: 'A past.', stillUrl: 'https://image.tmdb.org/t/p/w780/x.jpg', airDate: '1998-05-01' }
          : null
      )),
    }
    const app = await buildApp({ animeCatalog, animeEpisodeArt: { episodeByMalId: async () => null }, animeTmdbEpisodeArt: tmdbEpisodeArt })
    openApps.push(app)

    const hit = await app.inject({ method: 'GET', url: '/v1/anime/21/episodes/5' })
    expect(hit.statusCode).toBe(200)
    expect(hit.json()).toMatchObject({ anilistId: 21, number: 5, title: 'Ballad', thumbnail: 'https://image.tmdb.org/t/p/w780/x.jpg' })
    expect((await app.inject({ method: 'GET', url: '/v1/anime/21/episodes/6' })).statusCode).toBe(404)
  })
})
