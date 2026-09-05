import type { Metadata } from 'next'

import { SeriesDetailScreen } from '../../catalog/detail-screens'

type SeriesDetailPageProps = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: SeriesDetailPageProps): Promise<Metadata> {
  const { slug } = await params

  return {
    description: 'Every night at 3:17, one apartment in the city lights up violet.',
    title: `${slug === 'violet-hours' ? 'Violet Hours' : 'Series'} | Consumit`,
  }
}

export default async function SeriesDetailPage({ params }: SeriesDetailPageProps) {
  const { slug } = await params

  return <SeriesDetailScreen slug={slug} />
}
