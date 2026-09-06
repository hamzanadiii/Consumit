import {
  catalogBatchSchema,
  catalogPageSchema,
  catalogSeasonResponseSchema,
  catalogTitleResponseSchema,
  type CatalogResponseMeta,
  type CatalogSeason,
  type CatalogTitleDetail,
  type CatalogTitleSummary,
} from '@consumit/contracts'

import type { Catalog } from './catalog.ts'
import { CatalogError } from './errors.ts'

type FakeCatalogOptions = {
  fetchedAt?: string | undefined
  seasons?: readonly CatalogSeason[] | undefined
  stale?: boolean | undefined
  titles?: readonly CatalogTitleDetail[] | undefined
}

function summary(detail: CatalogTitleDetail): CatalogTitleSummary {
  return {
    backdropUrl: detail.backdropUrl,
    genreNames: detail.genreNames,
    id: detail.id,
    kind: detail.kind,
    originalTitle: detail.originalTitle,
    overview: detail.overview,
    popularity: detail.popularity,
    posterUrl: detail.posterUrl,
    releaseDate: detail.releaseDate,
    title: detail.title,
    tmdbRating: detail.tmdbRating,
    tmdbVoteCount: detail.tmdbVoteCount,
    year: detail.year,
  }
}

export function createFakeCatalog({
  fetchedAt = '2026-09-06T00:00:00.000Z',
  seasons = [],
  stale = false,
  titles = [],
}: FakeCatalogOptions = {}): Catalog {
  const meta: CatalogResponseMeta = { fetchedAt, language: 'en-US', region: 'US', source: 'tmdb', stale }
  const titleMap = new Map(titles.map((title) => [`${title.kind}:${title.id}`, title]))
  const seasonMap = new Map(seasons.map((season) => [`${season.seriesId}:${season.seasonNumber}`, season]))

  function page(items: readonly CatalogTitleSummary[], requestedPage: number) {
    return catalogPageSchema.parse({ items, meta, page: requestedPage, totalPages: items.length ? 1 : 0, totalResults: items.length })
  }

  return {
    async batch(refs) {
      const found = refs.flatMap((ref) => {
        const item = titleMap.get(`${ref.kind}:${ref.id}`)
        return item ? [summary(item)] : []
      })
      const missing = refs.filter((ref) => !titleMap.has(`${ref.kind}:${ref.id}`))
      return catalogBatchSchema.parse({ items: found, meta, missing })
    },
    async discover(query) {
      const items = titles.filter((title) => query.kind === 'all' || title.kind === query.kind).map(summary)
      return page(items, query.page)
    },
    async search(query) {
      const needle = query.query.trim().toLocaleLowerCase('en-US')
      const items = titles
        .filter((title) => query.kind === 'all' || title.kind === query.kind)
        .filter((title) => `${title.title} ${title.originalTitle}`.toLocaleLowerCase('en-US').includes(needle))
        .map(summary)
      return page(items, query.page)
    },
    async season(seriesId, seasonNumber) {
      const item = seasonMap.get(`${seriesId}:${seasonNumber}`)
      if (!item) throw new CatalogError('CATALOG_NOT_FOUND', 'The requested season was not found.', { statusCode: 404 })
      return catalogSeasonResponseSchema.parse({ item, meta })
    },
    async title(kind, id) {
      const item = titleMap.get(`${kind}:${id}`)
      if (!item) throw new CatalogError('CATALOG_NOT_FOUND', 'The requested title was not found.', { statusCode: 404 })
      return catalogTitleResponseSchema.parse({ item, meta })
    },
  }
}
