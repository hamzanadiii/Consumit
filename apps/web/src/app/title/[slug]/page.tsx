import type { Metadata } from 'next'

import { TitleDetailScreen } from '../../catalog/detail-screens'

type TitleDetailPageProps = {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: TitleDetailPageProps): Promise<Metadata> {
  const { slug } = await params

  return {
    description: 'A cartographer returns to a city that has erased every street she remembers.',
    title: `${slug === 'the-last-city-after-rain' ? 'The Last City After Rain' : 'Title'} | Consumit`,
  }
}

export default async function TitleDetailPage({ params }: TitleDetailPageProps) {
  const { slug } = await params

  return <TitleDetailScreen slug={slug} />
}
