import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { AnimeApiError, getCachedAnimeTitle, getCachedAnimeRelations, getCachedAnimeAiring } from '@/lib/anime-api'
import { serializeJsonLd } from '@/lib/json-ld'
import { CatalogUnavailableScreen } from '../../catalog/catalog-ui'
import { AnimeDetailScreen } from './anime-detail-screen'

type AnimeDetailPageProps = {
  params: Promise<{ id: string }>
}

export const revalidate = 300

export function generateStaticParams() {
  return []
}

export async function generateMetadata({ params }: AnimeDetailPageProps): Promise<Metadata> {
  const { id } = await params
  const anilistId = Number(id)
  if (!Number.isInteger(anilistId) || anilistId <= 0) return { title: 'Anime not found · Consumit' }
  try {
    const detail = await getCachedAnimeTitle(anilistId)
    const title = detail.titles.preferred
    return {
      alternates: { canonical: `/anime/${anilistId}` },
      description: detail.description || `${title} on Consumit`,
      openGraph: {
        images: detail.coverImage.url ? [detail.coverImage.url] : [],
        title: `${title} · Consumit`,
        type: 'video.other',
        url: `/anime/${anilistId}`,
      },
      title: `${title} · Consumit`,
    }
  } catch {
    return { title: 'Anime · Consumit' }
  }
}

export default async function AnimeDetailPage({ params }: AnimeDetailPageProps) {
  const { id } = await params
  const anilistId = Number(id)
  if (!Number.isInteger(anilistId) || anilistId <= 0) notFound()

  let detail
  try {
    detail = await getCachedAnimeTitle(anilistId)
  } catch (error) {
    if (error instanceof AnimeApiError && error.status === 404) notFound()
    return <CatalogUnavailableScreen activeHref="/anime" error={error} />
  }

  let relations
  try {
    relations = await getCachedAnimeRelations(anilistId)
  } catch {
    relations = null
  }

  let airing
  try {
    airing = await getCachedAnimeAiring(anilistId)
  } catch {
    airing = null
  }

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'TVSeries',
    name: detail.titles.preferred,
    description: detail.description || undefined,
    image: detail.coverImage.url || undefined,
    genre: detail.genres.length ? detail.genres : undefined,
    datePublished: detail.seasonYear ? `${detail.seasonYear}` : undefined,
    numberOfEpisodes: detail.episodes || undefined,
    aggregateRating: detail.averageScore ? {
      '@type': 'AggregateRating',
      ratingValue: detail.averageScore,
      bestRating: 100,
    } : undefined,
  }

  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} type="application/ld+json" />
      <AnimeDetailScreen detail={detail} relations={relations} airing={airing} />
    </>
  )
}
