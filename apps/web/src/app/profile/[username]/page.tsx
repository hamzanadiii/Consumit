import type { Metadata } from 'next'

import { OwnerProfileScreen, PublicProfileScreen } from '../public-profile-screen'
import { CatalogUnavailableScreen } from '../../catalog/catalog-ui'

import { getCatalogBatch, refsKey } from '@/lib/catalog-api'
import { editorialRefs } from '@/lib/catalog-registry'

type PublicProfilePageProps = {
  params: Promise<{ username: string }>
}

export const metadata: Metadata = {
  title: 'Profile · Consumit',
  description: 'A living record of taste, history, reviews, and lists.',
}

export default async function PublicProfilePage({ params }: PublicProfilePageProps) {
  const { username } = await params
  const normalizedUsername = username.trim().replace(/^@+/, '').toLowerCase()
  let response
  try {
    response = await getCatalogBatch(refsKey(editorialRefs))
  } catch (error) {
    return <CatalogUnavailableScreen error={error} />
  }

  return normalizedUsername === 'hamza'
    ? <OwnerProfileScreen stale={response.meta.stale} titles={response.items} username={username} />
    : <PublicProfileScreen stale={response.meta.stale} titles={response.items} username={username} />
}
