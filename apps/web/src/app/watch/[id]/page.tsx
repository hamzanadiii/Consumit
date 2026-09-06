import type { Metadata } from 'next'

import { WatchScreen } from '../watch-screen'

export const metadata: Metadata = {
  title: 'Watch · Consumit',
  description: 'Watch with the first-party Consumit Player.',
}

type WatchPageProps = {
  params: Promise<{ id: string }>
}

export default async function WatchPage({ params }: WatchPageProps) {
  const { id } = await params

  return <WatchScreen id={id} />
}
