import type { Catalog } from './catalog.ts'
import { unavailableCatalog } from './errors.ts'

export const unavailableCatalogAdapter: Catalog = {
  batch: async () => unavailableCatalog(),
  discover: async () => unavailableCatalog(),
  movieByExternalId: async () => unavailableCatalog(),
  search: async () => unavailableCatalog(),
  season: async () => unavailableCatalog(),
  title: async () => unavailableCatalog(),
}
