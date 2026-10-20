import { describe, expect, it } from 'vitest'
import type { CatalogTitleSummary } from '@consumit/contracts'
import { movieSummary } from '@/test/catalog-fixtures'
import { rankRecommendations, type RecommendationList } from './recommendations'

function title(id: number, titleText: string, kind: CatalogTitleSummary['kind'] = 'movie', genreNames: string[] = []): CatalogTitleSummary {
  return { ...movieSummary, id, title: titleText, kind, genreNames }
}

describe('recommendation ranking', () => {
  it('uses fresh-watch recency, cross-seed agreement, and genre affinity', () => {
    const recentSeed = title(1, 'Recent watch', 'anime', ['Action'])
    const olderSeed = title(2, 'Earlier watch', 'series', ['Drama'])
    const consensus = title(3, 'Shared pick', 'anime', ['Action', 'Drama'])
    const single = title(4, 'Single-list pick', 'movie', ['Action'])

    const ranked = rankRecommendations([
      { seed: recentSeed, items: [single, consensus] },
      { seed: olderSeed, items: [consensus] },
    ])

    expect(ranked.slice(0, 2)).toEqual([consensus, single])
    expect(ranked).not.toContain(recentSeed)
    expect(ranked).not.toContain(olderSeed)
  })

  it('breaks otherwise equal recommendations toward the more recent watch', () => {
    const recentSeed = title(11, 'Recent')
    const olderSeed = title(12, 'Older')
    const recentPick = title(13, 'Recent pick')
    const olderPick = title(14, 'Older pick')
    const ranked = rankRecommendations([
      { seed: recentSeed, items: [recentPick] },
      { seed: olderSeed, items: [olderPick] },
    ])
    expect(ranked.slice(0, 2)).toEqual([recentPick, olderPick])
  })

  it('interleaves genres and formats when relevance is close', () => {
    const seed = title(21, 'Seed')
    const action = title(22, 'Action one', 'movie', ['Action'])
    const moreAction = title(23, 'Action two', 'movie', ['Action'])
    const drama = title(24, 'Drama', 'anime', ['Drama'])
    const ranked = rankRecommendations([{ seed, items: [action, moreAction, drama] }])
    expect(ranked.slice(0, 2)).toEqual([action, drama])
  })

  it('bounds input to the eight freshest seed lists', () => {
    const lists: RecommendationList[] = Array.from({ length: 9 }, (_, index) => ({
      seed: title(30 + index, `Seed ${index}`),
      items: [title(50 + index, `Pick ${index}`)],
    }))
    expect(rankRecommendations(lists).map(item => item.title)).not.toContain('Pick 8')
  })
})
