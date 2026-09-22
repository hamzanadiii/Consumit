import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { TitleDetailScreen } from '../../catalog/detail-screens'
import { CatalogUnavailableScreen } from '../../catalog/catalog-ui'

import { CatalogApiError, getCatalogTitle } from '@/lib/catalog-api'
import { serializeJsonLd } from '@/lib/json-ld'

type TitleDetailPageProps = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: TitleDetailPageProps): Promise<Metadata> {
  const { slug } = await params
  const id = Number(slug)
  if (!Number.isInteger(id) || id <= 0) return { title: 'Title not found · Consumit' }
  try {
    const { item } = await getCatalogTitle('movie', id)
    return {
      alternates: { canonical: `/title/${id}` },
      description: item.overview,
      openGraph: { images: item.backdropUrl ? [item.backdropUrl] : [], title: item.title, type: 'video.movie', url: `/title/${id}` },
      title: `${item.title} · Consumit`,
    }
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
  const item = response.item
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Movie',
    ...(item.certification ? { contentRating: item.certification } : {}),
    ...(item.releaseDate ? { datePublished: item.releaseDate } : {}),
    ...(item.overview ? { description: item.overview } : {}),
    ...(item.genreNames.length ? { genre: item.genreNames } : {}),
    ...(item.backdropUrl ?? item.posterUrl ? { image: item.backdropUrl ?? item.posterUrl } : {}),
    name: item.title,
  }
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} type="application/ld+json" />
      <TitleDetailScreen detail={response.item} />
    </>
  )
}
