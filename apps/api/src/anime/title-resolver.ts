import type { AnimeCatalog } from '../catalog/anilist/adapter.ts'
import type { AnimeTitleVariantsResolver } from '@consumit/provider-sdk'

export type AnimeTitleResolver = (anilistId: number, signal: AbortSignal) => Promise<string>

const CACHE_TTL_MS = 6 * 3_600_000
const CACHE_MAX = 1000

/** Server-owned canonical anime title for adapters that match by title in
 *  addition to AniList ids. Backed by the anime catalog; the signal is
 *  accepted for interface parity (the catalog bounds its own upstream work).
 *  Secrets stay server-side. */
export function createAnimeTitleResolver(catalog: AnimeCatalog): AnimeTitleResolver {
  const meta = createAnimeMetaResolver(catalog)
  return async (anilistId: number, signal: AbortSignal) => meta(anilistId, signal).then(({ title }) => title)
}

/** AniList title aliases for anime providers whose catalogs index alternate
 *  English, romaji, or native names. The catalog client caches this detail. */
export function createAnimeTitleVariantsResolver(catalog: AnimeCatalog): AnimeTitleVariantsResolver {
  return async (anilistId) => {
    const detail = await catalog.title(anilistId)
    return [...new Set([
      detail.titles.english,
      detail.titles.romaji,
      detail.titles.native,
      detail.titles.preferred,
    ].map((title) => title?.trim()).filter((title): title is string => Boolean(title)))]
  }
}

export type AnimeMetaResolver = (anilistId: number, signal: AbortSignal) => Promise<{ title: string; malId: number | null }>

/** Title plus MAL id for adapters addressed by external identities (Zoko
 *  speaks MAL ids). Shares the title cache shape; one catalog read serves
 *  both fields. */
export function createAnimeMetaResolver(catalog: AnimeCatalog): AnimeMetaResolver {
  const cache = new Map<number, { title: string; malId: number | null; expires: number }>()
  return async (anilistId: number) => {
    const cached = cache.get(anilistId)
    if (cached && cached.expires > Date.now()) return { title: cached.title, malId: cached.malId }
    const detail = await catalog.title(anilistId)
    const title = detail.titles.preferred.trim()
    if (!title) throw new Error('Anime title metadata incomplete.')
    const malId = typeof detail.malId === 'number' && Number.isFinite(detail.malId) ? detail.malId : null
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value!)
    cache.set(anilistId, { title, malId, expires: Date.now() + CACHE_TTL_MS })
    return { title, malId }
  }
}
