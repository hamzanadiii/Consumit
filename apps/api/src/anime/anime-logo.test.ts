import { describe, expect, it, vi } from 'vitest'
import { createAnimeService } from './anime-service.ts'
import type { AnimeCatalog } from '../catalog/anilist/adapter.ts'
import type { AnimeTitleDetail } from '@consumit/contracts'

const base: AnimeTitleDetail = { anilistId: 1, kind: 'anime', titles: { preferred: 'Example', english: 'Example', romaji: 'Example', native: null }, format: 'TV', status: 'FINISHED', season: 'SPRING', seasonYear: 2020, episodes: 12, episodeDuration: 24, genres: [], coverImage: { url: null, color: null }, bannerImage: null, averageScore: null, popularity: 0, description: '', nextAiringEpisode: null, malId: null, logoUrl: null, source: null, countryOfOrigin: null, trailer: null, characters: [], staff: [], streamingEpisodes: [], externalLinks: [], recommendations: [] }
const sequel = { ...base, anilistId: 2, seasonYear: 2026, titles: { ...base.titles, english: 'Example Season 2', preferred: 'Example Season 2' } }
function setup(cycle = false) {
  const relations = vi.fn(async (id: number) => ({ main: id === 2 ? sequel : base, relations: id === 2 ? [{ type: 'PREQUEL' as const, anime: base }] : cycle ? [{ type: 'PREQUEL' as const, anime: sequel }] : [] }))
  const catalog = { title: async () => sequel, relations } as unknown as AnimeCatalog
  const titleLogo = vi.fn(async (id: number) => id === 1 && !cycle ? { tmdbId: 100, kind: 'series' as const, logoUrl: 'https://image.tmdb.org/t/p/w500/base-logo.png' } : null)
  return { service: createAnimeService(catalog, { tmdbEpisodeArt: { episodeByTitle: async () => null, titleLogo } }), relations, titleLogo }
}
describe('later-season logo fallback', () => {
  it('inherits a logo from an explicitly related prequel without changing season identity', async () => {
    const { service, titleLogo } = setup()
    const detail = await service.title(2)
    expect(detail.logoUrl).toBe('https://image.tmdb.org/t/p/w500/base-logo.png')
    expect(detail.anilistId).toBe(2)
    expect(detail.titles.preferred).toBe('Example Season 2')
    expect(titleLogo).toHaveBeenLastCalledWith(1, expect.objectContaining({ english: 'Example' }), 2020)
  })
  it('terminates cyclic franchise links and keeps an honest missing logo', async () => {
    const { service, relations } = setup(true)
    expect((await service.title(2)).logoUrl).toBeNull()
    expect(relations.mock.calls.length).toBeLessThanOrEqual(4)
  })
  it('keeps movies separate and ignores unrelated recommendations', async () => {
    const { titleLogo } = setup()
    const relations = vi.fn()
    const catalog = { title: async () => ({ ...sequel, format: 'MOVIE', recommendations: [base] }), relations } as unknown as AnimeCatalog
    const service = createAnimeService(catalog, { tmdbEpisodeArt: { episodeByTitle: async () => null, titleLogo } })
    expect((await service.title(2)).logoUrl).toBeNull()
    expect(relations).not.toHaveBeenCalled()
  })
})
