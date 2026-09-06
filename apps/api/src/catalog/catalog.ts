import type {
  CatalogBatch,
  CatalogFeed,
  CatalogKind,
  CatalogPage,
  CatalogRef,
  CatalogSeasonResponse,
  CatalogTitleResponse,
} from '@consumit/contracts'

export type CatalogQuery = {
  kind: CatalogKind | 'all'
  page: number
}

export type DiscoverCatalogQuery = CatalogQuery & {
  feed: CatalogFeed
}

export type SearchCatalogQuery = CatalogQuery & {
  query: string
}

export interface Catalog {
  batch(refs: readonly CatalogRef[]): Promise<CatalogBatch>
  discover(query: DiscoverCatalogQuery): Promise<CatalogPage>
  search(query: SearchCatalogQuery): Promise<CatalogPage>
  season(seriesId: number, seasonNumber: number): Promise<CatalogSeasonResponse>
  title(kind: CatalogKind, id: number): Promise<CatalogTitleResponse>
}
