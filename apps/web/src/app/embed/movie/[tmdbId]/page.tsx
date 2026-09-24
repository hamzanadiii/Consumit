import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { EmbedEmptyState } from '../../embed-empty'
import { EmbedPlayer } from '../../embed-player'
import { fetchEmbedStreams, loadEmbedMovieContext } from '../../embed-data'
import { parseEmbedQuery } from '../../embed-query'

type EmbedMoviePageProps = {
  params: Promise<{ tmdbId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params }: EmbedMoviePageProps): Promise<Metadata> {
  const id = Number((await params).tmdbId)
  const noindex = { robots: { follow: false, index: false } } as const
  if (!Number.isInteger(id) || id <= 0) return { ...noindex, title: 'Embed · Consumit' }
  const context = await loadEmbedMovieContext(id)
  return { ...noindex, title: `${context.title} · Consumit` }
}

export default async function EmbedMoviePage({ params, searchParams }: EmbedMoviePageProps) {
  const { tmdbId } = await params
  const id = Number(tmdbId)
  if (!Number.isInteger(id) || id <= 0) notFound()

  const query = parseEmbedQuery(await searchParams)
  const [streams, context] = await Promise.all([
    fetchEmbedStreams(`/v1/embed/movie/${id}`, query.lang),
    loadEmbedMovieContext(id),
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
