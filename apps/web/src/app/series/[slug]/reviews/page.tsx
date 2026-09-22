import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { getCatalogTitle } from '@/lib/catalog-api'

import { TitleReviewsPage } from '../../../catalog/title-reviews-page'

type SeriesReviewsPageProps = {
  params: Promise<{ slug: string }>
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

export async function generateMetadata({ params }: SeriesReviewsPageProps): Promise<Metadata> {
  const { slug } = await params
  const id = Number(slug)
  if (!Number.isInteger(id) || id <= 0) return { title: 'Title not found · Consumit' }
  try {
    const { item } = await getCatalogTitle('series', id)
    return {
      alternates: { canonical: `/series/${id}/reviews` },
      description: `Member reviews of ${item.title}.`,
      openGraph: { images: item.backdropUrl ? [item.backdropUrl] : [], title: `${item.title} reviews`, type: 'video.tv_show', url: `/series/${id}/reviews` },
      title: `${item.title} reviews · Consumit`,
    }
  } catch { return { title: 'Series reviews · Consumit' } }
}

export default async function SeriesReviewsPage({ params, searchParams }: SeriesReviewsPageProps) {
  const { slug } = await params
  const id = Number(slug)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const query = parseSearchParams(await searchParams)
  return <TitleReviewsPage audience={query.audience} id={id} kind="series" page={query.page} sort={query.sort} />
}
