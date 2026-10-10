import { catalogRefSchema, MAX_MEMBER_FAVORITES, type CatalogRef } from '@consumit/contracts'
const key = (owner: string) => `consumit.guide.favorites.${owner}`
export function readFavoritesDraft(owner: string, fallback: readonly CatalogRef[]): readonly CatalogRef[] {
  try {
    const raw = sessionStorage.getItem(key(owner))
    if (!raw) return fallback
    const parsed = catalogRefSchema.array().max(MAX_MEMBER_FAVORITES).parse(JSON.parse(raw))
    return [...new Map(parsed.map(ref => [`${ref.kind}:${ref.id}`, ref])).values()]
  } catch { return fallback }
}
export function storeFavoritesDraft(owner: string, refs: readonly CatalogRef[]) {
  try { sessionStorage.setItem(key(owner), JSON.stringify(refs)) } catch { /* Back navigation remains optional when device storage is denied. */ }
}
export function clearFavoritesDraft(owner: string) {
  try { sessionStorage.removeItem(key(owner)) } catch { /* Optional device storage. */ }
}
