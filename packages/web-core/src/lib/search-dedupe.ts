import type { AnimeTitleSummary, CatalogPage } from '@consumit/contracts'

function normalizeTitle(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

/** Twin-page dedupe: a TMDB series matching an anime result on normalized
 *  title + year is the same work showing twice. The anime page wins — it
 *  owns playback and episode identity — so the TMDB twin drops out of
 *  search. Movies never dedupe, and records without a year never dedupe:
 *  a wrong merge is worse than a duplicate. */
export function dedupeTwinSeries(
  catalogItems: CatalogPage['items'],
  animeItems: readonly AnimeTitleSummary[],
): CatalogPage['items'] {
  if (catalogItems.length === 0 || animeItems.length === 0) return catalogItems
  const animeKeys = new Set<string>()
  for (const anime of animeItems) {
    if (anime.seasonYear == null) continue
    for (const title of [anime.titles.preferred, anime.titles.english, anime.titles.romaji]) {
      if (!title) continue
      animeKeys.add(`${normalizeTitle(title)}|${anime.seasonYear}`)
    }
  }
  if (animeKeys.size === 0) return catalogItems
  return catalogItems.filter((item) => {
    if (item.kind !== 'series' || item.year == null) return true
    if (animeKeys.has(`${normalizeTitle(item.title)}|${item.year}`)) return false
    return !animeKeys.has(`${normalizeTitle(item.originalTitle)}|${item.year}`)
  })
}
