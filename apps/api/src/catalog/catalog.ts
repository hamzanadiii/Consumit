import type {
  CatalogBatch,
  CatalogFeed,
  CatalogKind,
  CatalogPage,
  CatalogRef,
  CatalogSeasonResponse,
  CatalogTitleSummary,
  CatalogTitleResponse,
} from '@consumit/contracts'

export type CatalogQuery = {
  kind: CatalogKind | 'all'
  page: number
}

export type DiscoverCatalogQuery = CatalogQuery & {
  feed: CatalogFeed
  genre?: string | undefined
  year?: number | undefined
}

export type SearchCatalogQuery = CatalogQuery & {
  query: string
}

export interface Catalog {
  recentEpisodes?(seriesId: number, since: Date): Promise<import('@consumit/contracts').ReleaseEpisode[]>
  batch(refs: readonly CatalogRef[]): Promise<CatalogBatch>
  discover(query: DiscoverCatalogQuery): Promise<CatalogPage>
  movieByExternalId(imdbId: string): Promise<CatalogTitleSummary | null>
  search(query: SearchCatalogQuery): Promise<CatalogPage>
  season(seriesId: number, seasonNumber: number): Promise<CatalogSeasonResponse>
  title(kind: CatalogKind, id: number): Promise<CatalogTitleResponse>
}
