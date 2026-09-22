import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { CatalogApiError, getCatalogTitle } from '@/lib/catalog-api'

import { CatalogUnavailableScreen } from '../../../catalog/catalog-ui'
import { sanitizePinnedProvider, WatchScreen } from '../../watch-screen'

type MovieWatchPageProps = {
  params: Promise<{ tmdbId: string }>
  searchParams: Promise<{ provider?: string | string[] | undefined }>
}

export async function generateMetadata({ params }: MovieWatchPageProps): Promise<Metadata> {
  const noindex = { robots: { follow: false, index: false } } as const
  const id = Number((await params).tmdbId)
  if (!Number.isInteger(id) || id <= 0) return { ...noindex, title: 'Watch · Consumit' }
  try { const { item } = await getCatalogTitle('movie', id); return { ...noindex, title: `Watch ${item.title} · Consumit` } } catch { return { ...noindex, title: 'Watch · Consumit' } }
}

export default async function MovieWatchPage({ params, searchParams }: MovieWatchPageProps) {
  const id = Number((await params).tmdbId)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const pinnedProvider = sanitizePinnedProvider((await searchParams).provider)
  let response
  try { response = await getCatalogTitle('movie', id) } catch (error) { if (error instanceof CatalogApiError && error.status === 404) notFound(); return <CatalogUnavailableScreen error={error} /> }
  if (response.item.kind !== 'movie') notFound()
  return <WatchScreen interactive title={response.item} {...(pinnedProvider ? { pinnedProvider } : {})} />
}
