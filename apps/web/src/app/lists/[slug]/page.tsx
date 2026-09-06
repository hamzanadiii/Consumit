import type { Metadata } from 'next'

import { ListDetailScreen } from '../list-detail-screen'

export const metadata: Metadata = {
  title: 'List · Consumit',
  description: 'A member-curated list, preserved in deliberate order.',
}

type ListPageProps = {
  params: Promise<{ slug: string }>
}

export default async function ListPage({ params }: ListPageProps) {
  const { slug } = await params

  return <ListDetailScreen slug={slug} />
}
