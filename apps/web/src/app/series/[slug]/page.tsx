import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

import { looksLikeAnime } from '../../catalog/catalog-ui'
import { SeriesDetailScreen } from '../../catalog/detail-screens'
import { CatalogUnavailableScreen } from '../../catalog/catalog-ui'

import { getAnimeMatch } from '@/lib/anime-api'
import { CatalogApiError, getCatalogSeason, getCatalogTitle } from '@/lib/catalog-api'
import { serializeJsonLd } from '@/lib/json-ld'

type SeriesDetailPageProps = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: SeriesDetailPageProps): Promise<Metadata> {
  const { slug } = await params
  const id = Number(slug)
  if (!Number.isInteger(id) || id <= 0) return { title: 'Series not found · Consumit' }
  try {
    const { item } = await getCatalogTitle('series', id)
    return {
      alternates: { canonical: `/series/${id}` },
      description: item.overview,
      openGraph: { images: item.backdropUrl ? [item.backdropUrl] : [], title: item.title, type: 'video.tv_show', url: `/series/${id}` },
      title: `${item.title} · Consumit`,
    }
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
  const item = response.item
  // Japanese animation belongs to the anime domain (AniList ids, SUB/DUB
  // providers, episode art): a confident match redirects straight there
  // instead of stranding the member on the TMDB mirror.
  if (looksLikeAnime(item)) {
    const animeMatch = await getAnimeMatch(item.title, item.originalTitle, item.year).catch(() => null)
    if (animeMatch) redirect(`/anime/${animeMatch}`)
  }
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'TVSeries',
    ...(item.contentRating ? { contentRating: item.contentRating } : {}),
    ...(item.releaseDate ? { datePublished: item.releaseDate } : {}),
    ...(item.overview ? { description: item.overview } : {}),
    ...(item.genreNames.length ? { genre: item.genreNames } : {}),
    ...(item.backdropUrl ?? item.posterUrl ? { image: item.backdropUrl ?? item.posterUrl } : {}),
    name: item.title,
    ...(item.seasons.length ? { numberOfSeasons: item.seasons.length } : {}),
  }
  const firstSeason = response.item.seasons[0]?.number
  const seasonResponse = firstSeason ? await getCatalogSeason(id, firstSeason).catch(() => null) : null
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }} type="application/ld+json" />
      <SeriesDetailScreen detail={response.item} initialSeason={seasonResponse?.item ?? null} />
    </>
  )
}
