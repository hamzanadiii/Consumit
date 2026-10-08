import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { getCatalogTitle } from '@/lib/catalog-api'

import { TitleReviewsPage } from '../../../catalog/title-reviews-page'

type TitleMovieReviewsPageProps = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ page?: string | undefined; sort?: string | undefined }>
}

function parseSearchParams(searchParams: { page?: string | undefined; sort?: string | undefined }) {
  const page = Number(searchParams.page ?? '1')
  return {
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    sort: 'recent' as const,
  }
}

export async function generateMetadata({ params }: TitleMovieReviewsPageProps): Promise<Metadata> {
  const { slug } = await params
  const id = Number(slug)
  if (!Number.isInteger(id) || id <= 0) return { title: 'Title not found · Consumit' }
  try {
    const { item } = await getCatalogTitle('movie', id)
    return {
      alternates: { canonical: `/title/${id}/reviews` },
      description: `Member reviews of ${item.title}.`,
      openGraph: { images: item.backdropUrl ? [item.backdropUrl] : [], title: `${item.title} reviews`, type: 'video.movie', url: `/title/${id}/reviews` },
      title: `${item.title} reviews · Consumit`,
    }
  } catch { return { title: 'Movie reviews · Consumit' } }
}

export default async function TitleMovieReviewsPage({ params, searchParams }: TitleMovieReviewsPageProps) {
  const { slug } = await params
  const id = Number(slug)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const query = parseSearchParams(await searchParams)
  return <TitleReviewsPage id={id} kind="movie" page={query.page} sort={query.sort} />
}
