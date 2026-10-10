import type { Metadata } from 'next'
import type { CatalogRef, CatalogTitleSummary, ProfileReadResponse } from '@consumit/contracts'

import { VisitorProfileScreen } from '../visitor-profile-screen'
import { ProfileScreen } from '../public-profile-screen'
import { notFound, redirect } from 'next/navigation'

import { getCatalogBatchForRefs } from '@/lib/catalog-api'
import { getServerSession } from '@/lib/identity-server'
import { getMemberLibrarySnapshot, getMemberList, getProfileRead, MemberApiError } from '@/lib/member-server'

type PublicProfilePageProps = {
  params: Promise<{ username: string }>
}

export const metadata: Metadata = {
  title: 'Profile · Consumit',
  description: 'A living record of taste, history, reviews, and lists.',
  robots: { follow: false, index: false },
}

export default async function PublicProfilePage({ params }: PublicProfilePageProps) {
  const { username } = await params
  const normalizedUsername = username.trim().replace(/^@+/, '').toLowerCase()
  const session = await getServerSession()
  let profile: ProfileReadResponse
  try {
    profile = await getProfileRead(normalizedUsername)
  } catch (error) {
    if (error instanceof MemberApiError && error.status === 404) notFound()
    throw error
  }
  if (profile.canonicalUsername !== normalizedUsername) redirect(`/profile/${profile.canonicalUsername}`)
  const owner = session.status === 'authenticated' && session.member.username === profile.canonicalUsername
  if (!profile.viewerIsOwner) {
    let titles: CatalogTitleSummary[] = []
    try { titles = (await getCatalogBatchForRefs(profile.favorites))?.items ?? [] } catch { /* Favorites remain available without catalog details. */ }
    return <VisitorProfileScreen data={profile} titles={titles} />
  }
  if (!owner) notFound()
  let savedPreview: { hasMore: boolean; items: CatalogRef[] } | { unavailable: true } | undefined
  if (owner) {
    try {
      const library = await getMemberLibrarySnapshot()
      savedPreview = { hasMore: Boolean(library.saved.nextCursor) || library.saved.items.length > 5, items: library.saved.items.slice(0, 5) }
    } catch {
      savedPreview = { unavailable: true }
    }
  }
  const listCovers = await Promise.all(profile.lists.slice(0, 2).map(async (list) => {
    try {
      const detail = await getMemberList(list.slug)
      return [list.slug, detail.items.slice(0, 4).map(({ id, kind }) => ({ id, kind }))] as const
    } catch {
      return [list.slug, []] as const
    }
  }))
  const listCoverRefs = listCovers.flatMap(([, items]) => items)
  const savedRefs = savedPreview && 'items' in savedPreview ? savedPreview.items : []
  const refs = [...profile.favorites, ...profile.diary, ...profile.reviews, ...savedRefs, ...listCoverRefs]
  let titles: CatalogTitleSummary[] = []
  let catalogUnavailable = false
  try { titles = (await getCatalogBatchForRefs(refs))?.items ?? [] } catch { catalogUnavailable = true }
  return <ProfileScreen catalogUnavailable={catalogUnavailable} data={profile} listPosters={Object.fromEntries(listCovers.map(([slug, items]) => [slug, items.map((ref) => titles.find((title) => title.kind === ref.kind && title.id === ref.id)?.posterUrl ?? undefined)]))} owner={owner} titles={titles} {...(savedPreview ? { savedPreview } : {})} />
}
