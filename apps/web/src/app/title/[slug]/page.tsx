import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { TitleDetailScreen } from '../../catalog/detail-screens'
import { CatalogUnavailableScreen } from '../../catalog/catalog-ui'

import { CatalogApiError, getCatalogTitle } from '@/lib/catalog-api'

type TitleDetailPageProps = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: TitleDetailPageProps): Promise<Metadata> {
  const { slug } = await params
  const id = Number(slug)
  if (!Number.isInteger(id) || id <= 0) return { title: 'Title not found · Consumit' }
  try {
    const { item } = await getCatalogTitle('movie', id)
    return { description: item.overview, openGraph: { images: item.backdropUrl ? [item.backdropUrl] : [], title: item.title }, title: `${item.title} · Consumit` }
  } catch { return { title: 'Movie · Consumit' } }
}

export default async function TitleDetailPage({ params }: TitleDetailPageProps) {
  const { slug } = await params
  const id = Number(slug)
  if (!Number.isInteger(id) || id <= 0) notFound()
  let response
  try {
    response = await getCatalogTitle('movie', id)
  } catch (error) {
    if (error instanceof CatalogApiError && error.status === 404) notFound()
    return <CatalogUnavailableScreen error={error} />
  }
  if (response.item.kind !== 'movie') notFound()
  return <TitleDetailScreen detail={response.item} stale={response.meta.stale} />
}
