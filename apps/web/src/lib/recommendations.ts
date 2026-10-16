import { animeTitleDetailSchema, recommendationDismissalsSchema, watchHistoryPageSchema, type CatalogRef, type CatalogTitleSummary } from '@consumit/contracts'
import { browserCatalogTitle } from './catalog-browser'
import { readOwnedProgress } from './continue-watching'
export const recommendationKey = (ref: CatalogRef) => `${ref.kind}:${ref.id}`
export function readWatchedSeeds(memberId?: string): CatalogRef[] {
  return [...new Map(readOwnedProgress(memberId).filter(row => row.completed || Boolean(row.durationSeconds && row.positionSeconds / row.durationSeconds >= .95)).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)).map(row => [recommendationKey(row), { kind: row.kind, id: row.id }])).values()]
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
export async function recommendationDismissals(signal: AbortSignal) { return recommendationDismissalsSchema.parse(await privateRequest('recommendation-dismissals', signal)).items }
export async function changeRecommendationDismissal(ref?: CatalogRef, dismissed = true) { await privateRequest('recommendation-dismissals', AbortSignal.timeout(5000), dismissed && ref ? 'PUT' : 'DELETE', ref) }
export async function recommendedTitles(ref: CatalogRef, signal: AbortSignal): Promise<CatalogTitleSummary[]> {
  let items: CatalogTitleSummary[]
  if (ref.kind !== 'anime') items = (await browserCatalogTitle(ref, signal)).recommendations
  else {
    const response = await fetch(`/v1/anime/${ref.id}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]) })
    if (!response.ok) throw new Error('Anime recommendations are unavailable.')
    const detail = animeTitleDetailSchema.parse(await response.json())
    items = detail.recommendations.map(anime => ({ kind: 'anime', id: anime.anilistId, title: anime.titles.preferred, originalTitle: anime.titles.native ?? anime.titles.preferred, year: anime.seasonYear, posterUrl: anime.coverImage.url, backdropUrl: anime.bannerImage, overview: anime.description, tmdbRating: anime.averageScore === null ? null : anime.averageScore / 10, tmdbVoteCount: 0, genreNames: anime.genres, logoUrl: null, popularity: anime.popularity, releaseDate: anime.seasonYear ? `${anime.seasonYear}-01-01` : null }))
  }
  const eligible = recommendationDismissalsSchema.parse(await privateRequest('recommendations/filter', signal, 'POST', { items: items.slice(0, 24).map(item => ({ kind: item.kind, id: item.id })) })).items
  const keys = new Set(eligible.map(recommendationKey))
  return items.filter(item => keys.has(recommendationKey(item)))
}
