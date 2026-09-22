import { describe, expect, it } from 'vitest'

import { mapAiringNode, mapTitleDetail, mapTitleSummary } from './mapper.ts'

const media = {
  id: 42,
  idMal: null,
  title: { romaji: 'Example', english: 'Example', native: null },
  format: 'TV',
  status: 'FINISHED',
  season: 'SPRING',
  seasonYear: 2024,
  episodes: 12,
  duration: 24,
  genres: ['Drama'],
  coverImage: { large: null, color: '#abcdef' },
  bannerImage: 'javascript:alert(1)',
  averageScore: 85,
  popularity: 1_000,
  description: '<p>A safe description.</p>',
  nextAiringEpisode: { episode: 4, airingAt: 1_700_000_000 },
  trailer: { id: 'trailer', site: 'youtube', thumbnail: 'javascript:alert(1)' },
  characters: null,
  staff: null,
  streamingEpisodes: [{ title: 'Episode 1', thumbnail: 'https://cdn.example.test/episode.jpg', site: 'Crunchyroll' }],
  externalLinks: [
    { id: 1, site: 'Official', url: 'https://example.test', color: null },
    { id: 2, site: 'Unsafe', url: 'javascript:alert(1)', color: null },
  ],
}

describe('AniList mapper', () => {
  it('preserves status semantics and never substitutes a color for an image URL', () => {
    const summary = mapTitleSummary(media)

    expect(summary.status).toBe('FINISHED')
    expect(summary.coverImage).toEqual({ color: '#abcdef', url: null })
    expect(summary.bannerImage).toBeNull()
    expect(summary.nextAiringEpisode?.airingAt).toBe('2023-11-14T22:13:20.000Z')
  })

  it('only exposes HTTP(S) URLs from the external metadata service', () => {
    const detail = mapTitleDetail(media)

    expect(detail.trailer?.thumbnail).toBeNull()
    expect(detail.streamingEpisodes[0]?.thumbnail).toBe('https://cdn.example.test/episode.jpg')
    expect(detail.externalLinks).toEqual([{ id: 1, site: 'Official', url: 'https://example.test/', color: null }])
  })

  it('converts AniList Unix timestamps to the public ISO contract', () => {
    expect(mapAiringNode({
      episode: 4,
      airingAt: 1_700_000_000,
      timeUntilAiring: 600,
      media: { id: 42, title: { english: 'Example', romaji: null } },
    }).airingAt).toBe('2023-11-14T22:13:20.000Z')
  })
})
