import { animeTitleDetailSchema, recommendationDismissalsSchema, watchHistoryPageSchema, type CatalogRef, type CatalogTitleSummary } from '@consumit/contracts'
import { browserCatalogTitle } from './catalog-browser'
import { readOwnedProgress } from './continue-watching'

export const recommendationKey = (ref: CatalogRef) => `${ref.kind}:${ref.id}`

const MAX_SEEDS = 8
const MAX_RECOMMENDATIONS_PER_SEED = 24
const MAX_FILTERED_RECOMMENDATIONS = 24

export function readWatchedSeeds(memberId?: string): CatalogRef[] {
  return [...new Map(readOwnedProgress(memberId)
    .filter(row => row.completed || Boolean(row.durationSeconds && row.positionSeconds / row.durationSeconds >= .95))
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .map(row => [recommendationKey(row), { kind: row.kind, id: row.id }])).values()]
}

async function privateRequest(path: string, signal: AbortSignal, method = 'GET', body?: unknown) {
  const response = await fetch(`/v1/me/${path}`, { method, credentials: 'same-origin', cache: 'no-store', ...(body ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}), signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]) })
  if (!response.ok) throw new Error('Your recommendations could not sync. Try again.')
  return response.status === 204 ? null : response.json()
}

export async function watchedSeeds(memberId: string, signal: AbortSignal) {
  const latest = new Map<string, { ref: CatalogRef; at: number }>()
  const add = (ref: CatalogRef, at: string) => { const key = recommendationKey(ref), stamp = Date.parse(at); if (!latest.has(key) || latest.get(key)!.at < stamp) latest.set(key, { ref: { kind: ref.kind, id: ref.id }, at: stamp }) }
  for (const row of readOwnedProgress(memberId)) if (row.completed || Boolean(row.durationSeconds && row.positionSeconds / row.durationSeconds >= .95)) add(row, row.updatedAt)
  let cursor: string | null = null
  for (let index = 0; index < 5; index++) {
    const page = watchHistoryPageSchema.parse(await privateRequest(`watch-history?${new URLSearchParams({ limit: '50', ...(cursor ? { cursor } : {}) })}`, signal))
    page.items.forEach(row => add(row, row.completedAt)); cursor = page.nextCursor
    if (!cursor || latest.size >= 20) break
  }
  return [...latest.values()].sort((a, b) => b.at - a.at).slice(0, 20).map(row => row.ref)
}

export async function recommendationDismissals(signal: AbortSignal) {
  return recommendationDismissalsSchema.parse(await privateRequest('recommendation-dismissals', signal)).items
}

export async function changeRecommendationDismissal(ref?: CatalogRef, dismissed = true) {
  await privateRequest('recommendation-dismissals', AbortSignal.timeout(5000), dismissed && ref ? 'PUT' : 'DELETE', ref)
}

async function catalogRecommendations(ref: CatalogRef, signal: AbortSignal): Promise<CatalogTitleSummary[]> {
  if (ref.kind !== 'anime') return (await browserCatalogTitle(ref, signal)).recommendations

  const response = await fetch(`/v1/anime/${ref.id}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) })
  if (!response.ok) throw new Error('Anime recommendations are unavailable.')
  const detail = animeTitleDetailSchema.parse(await response.json())
  return detail.recommendations.map(anime => ({
    kind: 'anime', id: anime.anilistId, title: anime.titles.preferred, originalTitle: anime.titles.native ?? anime.titles.preferred,
    year: anime.seasonYear, posterUrl: anime.coverImage.url, backdropUrl: anime.bannerImage, overview: anime.description,
    tmdbRating: anime.averageScore === null ? null : anime.averageScore / 10, tmdbVoteCount: 0, genreNames: anime.genres,
    logoUrl: null, popularity: anime.popularity, releaseDate: anime.seasonYear ? `${anime.seasonYear}-01-01` : null,
  }))
}

export type RecommendationList = { seed: CatalogTitleSummary; items: readonly CatalogTitleSummary[] }

/**
 * Weighted reciprocal-rank fusion combines independent catalog suggestions.
 * Newer completed watches carry more weight; agreement across different seeds
 * lifts a title, genre overlap resolves ties, and a light diversity pass avoids
 * filling the row with one format or near-identical genre clusters.
 */
export function rankRecommendations(lists: readonly RecommendationList[]): CatalogTitleSummary[] {
  const boundedLists = lists.slice(0, MAX_SEEDS)
  const genreWeights = new Map<string, number>()
  const scores = new Map<string, { title: CatalogTitleSummary; relevance: number; supportingSeeds: Set<string> }>()

  boundedLists.forEach(({ seed, items }, seedIndex) => {
    const recencyWeight = Math.exp(-seedIndex / 4)
    for (const genre of new Set(seed.genreNames ?? [])) genreWeights.set(genre, (genreWeights.get(genre) ?? 0) + recencyWeight)

    const seenInList = new Set<string>()
    items.slice(0, MAX_RECOMMENDATIONS_PER_SEED).forEach((title, rank) => {
      const key = recommendationKey(title)
      if (key === recommendationKey(seed) || seenInList.has(key)) return
      seenInList.add(key)
      const candidate = scores.get(key) ?? { title, relevance: 0, supportingSeeds: new Set<string>() }
      candidate.relevance += recencyWeight / Math.log2(rank + 2)
      candidate.supportingSeeds.add(recommendationKey(seed))
      scores.set(key, candidate)
    })
  })

  const totalGenreWeight = [...genreWeights.values()].reduce((sum, value) => sum + value, 0)
  const ranked = [...scores.entries()].map(([key, candidate]) => {
    const genreScore = totalGenreWeight === 0 ? 0 : (candidate.title.genreNames ?? []).reduce((sum, genre) => sum + (genreWeights.get(genre) ?? 0), 0) / totalGenreWeight
    const consensusScore = Math.log2(candidate.supportingSeeds.size + 1) * 0.18
    return { key, ...candidate, score: candidate.relevance + genreScore * 0.3 + consensusScore }
  })

  const diverse: typeof ranked = []
  while (ranked.length && diverse.length < 32) {
    let bestIndex = 0
    let bestScore = Number.NEGATIVE_INFINITY
    ranked.forEach((candidate, index) => {
      const sameKind = diverse.filter(item => item.title.kind === candidate.title.kind).length
      const candidateGenres = new Set(candidate.title.genreNames ?? [])
      const maxGenreOverlap = diverse.reduce((maximum, item) => {
        const genres = new Set(item.title.genreNames ?? [])
        const union = new Set([...genres, ...candidateGenres])
        const overlap = union.size ? [...candidateGenres].filter(genre => genres.has(genre)).length / union.size : 0
        return Math.max(maximum, overlap)
      }, 0)
      const adjusted = candidate.score - Math.min(sameKind, 4) * 0.07 - maxGenreOverlap * 0.28
      if (adjusted > bestScore) { bestScore = adjusted; bestIndex = index }
    })
    diverse.push(ranked.splice(bestIndex, 1)[0]!)
  }
  return diverse.map(({ title }) => title)
}

export async function recommendationsForHistory(seeds: readonly CatalogTitleSummary[], signal: AbortSignal): Promise<CatalogTitleSummary[]> {
  const selectedSeeds = seeds.slice(0, MAX_SEEDS)
  const settled = await Promise.allSettled(selectedSeeds.map(async seed => ({ seed, items: await catalogRecommendations(seed, signal) })))
  if (signal.aborted) throw signal.reason
  const lists = settled.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])
  if (!lists.length && settled.length) throw new Error('Recommendations could not load.')

  const ranked = rankRecommendations(lists)
  const candidates = ranked.slice(0, MAX_FILTERED_RECOMMENDATIONS)
  if (!candidates.length) return []
  const eligible = recommendationDismissalsSchema.parse(await privateRequest('recommendations/filter', signal, 'POST', {
    items: candidates.map(item => ({ kind: item.kind, id: item.id })),
  })).items
  const allowed = new Set(eligible.map(recommendationKey))
  return candidates.filter(item => allowed.has(recommendationKey(item)))
}
