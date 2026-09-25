import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { getAnimeTitle } from '@/lib/anime-api'

import { TitleReviewsPage } from '../../../catalog/title-reviews-page'

type AnimeReviewsPageProps = {
  params: Promise<{ id: string }>
  searchParams: Promise<{ audience?: string | undefined; page?: string | undefined; sort?: string | undefined }>
}

function parseSearchParams(searchParams: { audience?: string | undefined; page?: string | undefined; sort?: string | undefined }) {
  const page = Number(searchParams.page ?? '1')
  return {
    audience: searchParams.audience === 'circle' ? 'circle' as const : 'all' as const,
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    sort: searchParams.sort === 'popular' ? 'popular' as const : 'recent' as const,
  }
}

export async function generateMetadata({ params }: AnimeReviewsPageProps): Promise<Metadata> {
  const { id } = await params
  const anilistId = Number(id)
  if (!Number.isInteger(anilistId) || anilistId <= 0) return { title: 'Anime not found · Consumit' }
  try {
    const detail = await getAnimeTitle(anilistId)
    const title = detail.titles.preferred
    return {
      alternates: { canonical: `/anime/${anilistId}/reviews` },
      description: `Member reviews of ${title}.`,
      openGraph: { images: detail.coverImage.url ? [detail.coverImage.url] : [], title: `${title} reviews`, type: 'video.other', url: `/anime/${anilistId}/reviews` },
      title: `${title} reviews · Consumit`,
    }
  } catch { return { title: 'Anime reviews · Consumit' } }
}

export default async function AnimeReviewsPage({ params, searchParams }: AnimeReviewsPageProps) {
  const { id } = await params
  const anilistId = Number(id)
  if (!Number.isInteger(anilistId) || anilistId <= 0) notFound()
  const query = parseSearchParams(await searchParams)
  return <TitleReviewsPage audience={query.audience} id={anilistId} kind="anime" page={query.page} sort={query.sort} />
}
