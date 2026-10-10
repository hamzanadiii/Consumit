import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { watchHref } from '@consumit/contracts'

import { getAnimeTitle } from '@/lib/anime-api'
import { AnimeApiError } from '@/lib/anime-api'
import { getServerSession } from '@/lib/identity-server'
import { CatalogUnavailableScreen } from '../../../catalog/catalog-ui'

import { SessionProvider } from '../../../session/session'
import { sanitizePinnedProvider } from '../../watch-screen'
import { AnimeWatchScreen } from '../anime-watch-screen'

type AnimeWatchPageProps = {
  params: Promise<{ anilistId: string }>
  searchParams: Promise<{ audio?: string | string[] | undefined; episode?: string | string[] | undefined; provider?: string | string[] | undefined }>
}

const MAX_ANIME_EPISODE = 10_000

export async function generateMetadata({ params }: AnimeWatchPageProps): Promise<Metadata> {
  const noindex = { robots: { follow: false, index: false } } as const
  const id = Number((await params).anilistId)
  if (!Number.isInteger(id) || id <= 0) return { ...noindex, title: 'Watch · Consumit' }
  try {
    const detail = await getAnimeTitle(id)
    return { ...noindex, title: `Watch ${detail.titles.preferred} · Consumit` }
  } catch {
    return { ...noindex, title: 'Watch · Consumit' }
  }
}

export default async function AnimeWatchPage({ params, searchParams }: AnimeWatchPageProps) {
  const id = Number((await params).anilistId)
  const query = await searchParams
  const sessionPromise = getServerSession()
  const episodeValue = Array.isArray(query.episode) ? query.episode[0] : query.episode
  const audioValue = Array.isArray(query.audio) ? query.audio[0] : query.audio
  const episodeNumber = Number(episodeValue ?? 1)
  const audio: 'sub' | 'dub' | undefined = audioValue === 'dub' ? 'dub' : audioValue === 'sub' ? 'sub' : undefined
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(episodeNumber) || episodeNumber <= 0 || episodeNumber > MAX_ANIME_EPISODE) notFound()

  let detail
  try {
    detail = await getAnimeTitle(id)
  } catch (error) {
    if (error instanceof AnimeApiError && error.status === 404) notFound()
    return <CatalogUnavailableScreen activeHref="/anime" error={error} />
  }
  if (detail.episodes && episodeNumber > detail.episodes) notFound()

  const hasNext = !detail.episodes || episodeNumber < detail.episodes
  const nextHref = hasNext ? watchHref({ kind: 'anime', id }, { episode: episodeNumber + 1, season: 1 }) : undefined
  const prevHref = episodeNumber > 1 ? watchHref({ kind: 'anime', id }, { episode: episodeNumber - 1, season: 1 }) : undefined

  const pinnedProvider = sanitizePinnedProvider(query.provider)
  const session = await sessionPromise
  return (
    <SessionProvider initialMember={session.member} initialStatus={session.status}>
      <AnimeWatchScreen
        audio={audio}
        detail={detail}
        episode={episodeNumber}
        nextHref={nextHref}
        prevHref={prevHref}
        {...(pinnedProvider ? { pinnedProvider } : {})}
      />
    </SessionProvider>
  )
}
