import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'

export const metadata: Metadata = {
  title: 'Watch · Consumit',
  description: 'Watch with the first-party Consumit Player.',
}

type WatchPageProps = {
  params: Promise<{ id: string }>
}

export default async function WatchPage({ params }: WatchPageProps) {
  const { id } = await params
  const tmdbId = Number(id)
  if (!Number.isInteger(tmdbId) || tmdbId <= 0) notFound()
  redirect(`/watch/movie/${tmdbId}`)
}
