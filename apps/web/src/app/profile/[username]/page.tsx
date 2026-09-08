import type { Metadata } from 'next'
import type { CatalogTitleSummary, MemberProfileData } from '@consumit/contracts'

import { ProfileScreen } from '../public-profile-screen'
import { notFound, redirect } from 'next/navigation'

import { getCatalogBatch, refsKey } from '@/lib/catalog-api'
import { getServerSession } from '@/lib/identity-server'
import { getPublicProfile, MemberApiError } from '@/lib/member-server'

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
  let profile: MemberProfileData
  try {
    profile = await getPublicProfile(normalizedUsername)
  } catch (error) {
    if (error instanceof MemberApiError && error.status === 404) notFound()
    throw error
  }
  if (profile.canonicalUsername !== normalizedUsername) redirect(`/profile/${profile.canonicalUsername}`)
  const refs = [...profile.favorites, ...profile.diary, ...profile.reviews]
  let titles: CatalogTitleSummary[] = []
  let catalogUnavailable = false
  try { titles = refs.length ? (await getCatalogBatch(refsKey(refs))).items : [] } catch { catalogUnavailable = true }
  return <ProfileScreen catalogUnavailable={catalogUnavailable} data={profile} owner={session.status === 'authenticated' && session.member.username === profile.canonicalUsername} titles={titles} />
}
