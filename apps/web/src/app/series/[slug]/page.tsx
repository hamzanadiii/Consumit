import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { SeriesDetailScreen } from '../../catalog/detail-screens'
import { CatalogUnavailableScreen } from '../../catalog/catalog-ui'

import { CatalogApiError, getCatalogSeason, getCatalogTitle, publicCatalogApiUrl } from '@/lib/catalog-api'

type SeriesDetailPageProps = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: SeriesDetailPageProps): Promise<Metadata> {
  const { slug } = await params
  const id = Number(slug)
  if (!Number.isInteger(id) || id <= 0) return { title: 'Series not found · Consumit' }
  try {
    const { item } = await getCatalogTitle('series', id)
    return { description: item.overview, openGraph: { images: item.backdropUrl ? [item.backdropUrl] : [], title: item.title }, title: `${item.title} · Consumit` }
  } catch { return { title: 'Series · Consumit' } }
}

export default async function SeriesDetailPage({ params }: SeriesDetailPageProps) {
  const { slug } = await params
  const id = Number(slug)
  if (!Number.isInteger(id) || id <= 0) notFound()
  let response
  try {
    response = await getCatalogTitle('series', id)
  } catch (error) {
    if (error instanceof CatalogApiError && error.status === 404) notFound()
    return <CatalogUnavailableScreen activeHref="/series" error={error} />
  }
  if (response.item.kind !== 'series') notFound()
  const firstSeason = response.item.seasons[0]?.number
  const seasonResponse = firstSeason ? await getCatalogSeason(id, firstSeason).catch(() => null) : null
  return <SeriesDetailScreen apiBase={publicCatalogApiUrl()} detail={response.item} initialSeason={seasonResponse?.item ?? null} stale={response.meta.stale || Boolean(seasonResponse?.meta.stale)} />
}
