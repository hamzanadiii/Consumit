import type { AnimeDetail, AnimePage } from '@consumit/contracts'

import type { Anilist, AnimeSearchQuery } from './anilist.ts'
import { AnilistError } from './errors.ts'
import { mediaIdentityForAnime } from './media-identity.ts'

const FETCHED_AT = '2026-09-13T00:00:00.000Z'

function detail(input: Omit<AnimeDetail, 'identity'>): AnimeDetail {
  return { ...input, identity: mediaIdentityForAnime({ anilistId: input.anilistId, malId: input.malId }) }
}

export const fakeAnimeFixtures: AnimeDetail[] = [
  detail({
    anilistId: 1,
    title: 'Cowboy Bebop',
    titles: { romaji: 'Cowboy Bebop', english: 'Cowboy Bebop', native: 'カウボーイビバップ' },
    coverUrl: 'https://cdn.example/cowboy-bebop.jpg',
    bannerUrl: null,
    format: 'TV',
    status: 'FINISHED',
    seasonYear: 1998,
    season: 'SPRING',
    episodes: 26,
    averageScore: 86,
    genres: ['Action', 'Sci-Fi'],
    description: 'In the year 2071, bounty hunters travel the solar system.',
    tags: ['Space', 'Bounty Hunters'],
    relations: [
      { relationType: 'summary', anilistId: 5, title: 'Cowboy Bebop: The Movie', format: 'MOVIE', status: 'FINISHED' },
    ],
    malId: 1,
  }),
  detail({
    anilistId: 5,
    title: 'Cowboy Bebop: The Movie',
    titles: { romaji: 'Cowboy Bebop: Tengoku no Tobira', english: 'Cowboy Bebop: The Movie', native: 'カウボーイビバップ天国の扉' },
    coverUrl: 'https://cdn.example/cowboy-bebop-movie.jpg',
    bannerUrl: null,
    format: 'MOVIE',
    status: 'FINISHED',
    seasonYear: 2001,
    season: null,
    episodes: 1,
    averageScore: 84,
    genres: ['Action', 'Sci-Fi'],
    description: 'A terrorist threatens Mars as the Bebop crew hunts the bounty.',
    tags: ['Space', 'Bounty Hunters'],
    relations: [
      { relationType: 'parent', anilistId: 1, title: 'Cowboy Bebop', format: 'TV', status: 'FINISHED' },
    ],
    malId: 5,
  }),
  detail({
    anilistId: 5114,
    title: 'Fullmetal Alchemist: Brotherhood',
    titles: { romaji: 'Hagane no Renkinjutsushi: Fullmetal Alchemist', english: 'Fullmetal Alchemist: Brotherhood', native: '鋼の錬金術師 FULLMETAL ALCHEMIST' },
    coverUrl: 'https://cdn.example/fmab.jpg',
    bannerUrl: null,
    format: 'TV',
    status: 'FINISHED',
    seasonYear: 2009,
    season: 'SPRING',
    episodes: 64,
    averageScore: 91,
    genres: ['Action', 'Adventure'],
    description: 'Two brothers search for the Philosopher\'s Stone.',
    tags: ['Military', 'Alchemy'],
    relations: [
      { relationType: 'alternative', anilistId: 121, title: 'Fullmetal Alchemist', format: 'TV', status: 'FINISHED' },
      { relationType: 'adaptation', anilistId: 25, title: 'Fullmetal Alchemist (Manga)', format: 'MANGA', status: 'FINISHED' },
    ],
    malId: 5114,
  }),
]

export function createFakeAnilist(fixtures: readonly AnimeDetail[] = fakeAnimeFixtures): Anilist {
  const byId = new Map(fixtures.map((item) => [item.anilistId, item]))
  return {
    async anime(anilistId: number) {
      const item = byId.get(anilistId)
      if (!item) throw new AnilistError('CATALOG_NOT_FOUND', 'The requested anime was not found.', { statusCode: 404 })
      return { item, meta: { fetchedAt: FETCHED_AT, stale: false } }
    },
    async searchAnime(query: AnimeSearchQuery): Promise<AnimePage> {
      const needle = query.query.trim().toLocaleLowerCase('en-US')
      const items = fixtures
        .filter((item) => [item.title, item.titles.romaji, item.titles.english, item.titles.native]
          .filter((value): value is string => Boolean(value))
          .some((value) => value.toLocaleLowerCase('en-US').includes(needle)))
        .map(({ description: _description, tags: _tags, season: _season, relations: _relations, malId: _malId, ...summary }) => summary)
      return {
        items,
        meta: { fetchedAt: FETCHED_AT, source: 'anilist', stale: false },
        page: query.page,
        totalResults: items.length,
      }
    },
    lookupTitles(candidate) {
      return [candidate.titles.english, candidate.titles.romaji, candidate.titles.native, candidate.title]
        .filter((value): value is string => Boolean(value?.trim()))
        .filter((value, index, all) => all.indexOf(value) === index)
    },
  }
}
