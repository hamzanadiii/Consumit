import type { Metadata } from 'next'
import type { CatalogRef, CatalogTitleSummary } from '@consumit/contracts'
import { FavoritesOnboardingScreen } from '../onboarding-screens'
import { getCatalogBatchForRefs } from '@/lib/catalog-api'
import { editorialRefs } from '@/lib/catalog-registry'
import { getServerSession } from '@/lib/identity-server'
import { getPublicProfile } from '@/lib/member-server'
import { internalNextPath } from '@/lib/internal-next-path'
export const metadata: Metadata = { title: 'Your Favorites · Consumit', robots: { index: false, follow: false } }
export default async function FavoritesPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const session = await getServerSession()
  let initialFavorites: CatalogRef[] = [], initialTitles: CatalogTitleSummary[] = [], favoritesUnavailable = false
  if (session.member) {
    try { initialFavorites = (await getPublicProfile(session.member.username)).favorites.map(({ id, kind }) => ({ id, kind })) }
    catch { favoritesUnavailable = true }
  }
  try { initialTitles = (await getCatalogBatchForRefs([...initialFavorites, ...editorialRefs]))?.items ?? [] } catch { /* Search and Skip remain usable during catalog failure. */ }
  return <FavoritesOnboardingScreen key={`${session.member?.id ?? 'guest'}:${favoritesUnavailable}:${initialFavorites.map(ref => `${ref.kind}:${ref.id}`).join(',')}`} initialTitles={initialTitles} initialFavorites={initialFavorites} favoritesUnavailable={favoritesUnavailable} next={internalNextPath((await searchParams).next)} />
}
