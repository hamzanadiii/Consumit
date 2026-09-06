import type { CatalogRef, CatalogTitleSummary } from '@consumit/contracts'

export const editorialCatalog = {
  movies: [
    { id: 693134, kind: 'movie' },
    { id: 329865, kind: 'movie' },
    { id: 666277, kind: 'movie' },
    { id: 843, kind: 'movie' },
    { id: 531428, kind: 'movie' },
    { id: 157336, kind: 'movie' },
  ],
  series: [
    { id: 95396, kind: 'series' },
    { id: 70523, kind: 'series' },
    { id: 136315, kind: 'series' },
    { id: 126308, kind: 'series' },
    { id: 87108, kind: 'series' },
    { id: 94605, kind: 'series' },
  ],
} as const satisfies Record<string, readonly CatalogRef[]>

export const editorialRefs: readonly CatalogRef[] = [
  ...editorialCatalog.movies,
  ...editorialCatalog.series,
]

export function catalogKey(title: CatalogRef) {
  return `${title.kind}:${title.id}`
}

export function catalogMap(items: readonly CatalogTitleSummary[]) {
  return new Map(items.map((item) => [catalogKey(item), item]))
}
