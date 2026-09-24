import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { EmbedEmptyState } from '../../../../embed-empty'
import { EmbedPlayer } from '../../../../embed-player'
import { fetchEmbedStreams, loadEmbedEpisodeContext } from '../../../../embed-data'
import { parseEmbedQuery } from '../../../../embed-query'

type EmbedTvPageProps = {
  params: Promise<{ tmdbId: string; season: string; episode: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params }: EmbedTvPageProps): Promise<Metadata> {
  const { tmdbId, season, episode } = await params
  const id = Number(tmdbId)
  const seasonNumber = Number(season)
  const episodeNumber = Number(episode)
  const noindex = { robots: { follow: false, index: false } } as const
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(seasonNumber) || seasonNumber <= 0 || !Number.isInteger(episodeNumber) || episodeNumber <= 0) {
    return { ...noindex, title: 'Embed · Consumit' }
  }
  const context = await loadEmbedEpisodeContext(id, seasonNumber, episodeNumber)
  return { ...noindex, title: `${context.title} · Consumit` }
}

export default async function EmbedTvPage({ params, searchParams }: EmbedTvPageProps) {
  const { tmdbId, season, episode } = await params
  const id = Number(tmdbId)
  const seasonNumber = Number(season)
  const episodeNumber = Number(episode)
  if (
    !Number.isInteger(id) || id <= 0
    || !Number.isInteger(seasonNumber) || seasonNumber <= 0
    || !Number.isInteger(episodeNumber) || episodeNumber <= 0
  ) notFound()

  const query = parseEmbedQuery(await searchParams)
  const [streams, context] = await Promise.all([
    fetchEmbedStreams(`/v1/embed/tv/${id}/${seasonNumber}/${episodeNumber}`, query.lang),
    loadEmbedEpisodeContext(id, seasonNumber, episodeNumber),
  ])

  if (!streams.sources.length) return <EmbedEmptyState />

  return (
    <div className="flex min-h-dvh flex-col bg-[#09090b]">
      <EmbedPlayer
        autoPlay={query.autoPlay}
        lang={query.lang}
        overview={context.overview}
        pauseFacts={context.pauseFacts}
        posterSrc={context.posterSrc}
        sources={streams.sources}
        startAt={query.startAt}
        subtitles={streams.subtitles}
        title={context.title}
        videoId={id}
      />
    </div>
  )
}
