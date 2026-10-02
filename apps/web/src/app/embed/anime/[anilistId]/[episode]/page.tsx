import type { Metadata } from 'next'
import { notFound } from 'next/navigation'

import { EmbedEmptyState } from '../../../embed-empty'
import { EmbedPlayer } from '../../../embed-player'
import { fetchEmbedStreams, loadEmbedAnimeContext } from '../../../embed-data'
import { parseEmbedQuery } from '../../../embed-query'

type EmbedAnimePageProps = {
  params: Promise<{ anilistId: string; episode: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const MAX_ANIME_EPISODE = 10_000

export async function generateMetadata({ params }: EmbedAnimePageProps): Promise<Metadata> {
  const { anilistId, episode } = await params
  const id = Number(anilistId)
  const episodeNumber = Number(episode)
  const noindex = { robots: { follow: false, index: false } } as const
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(episodeNumber) || episodeNumber <= 0 || episodeNumber > MAX_ANIME_EPISODE) {
    return { ...noindex, title: 'Embed · Consumit' }
  }
  const context = await loadEmbedAnimeContext(id, episodeNumber)
  return { ...noindex, title: `${context.title} · Consumit` }
}

export default async function EmbedAnimePage({ params, searchParams }: EmbedAnimePageProps) {
  const { anilistId, episode } = await params
  const id = Number(anilistId)
  const episodeNumber = Number(episode)
  if (
    !Number.isInteger(id) || id <= 0
    || !Number.isInteger(episodeNumber) || episodeNumber <= 0
    || episodeNumber > MAX_ANIME_EPISODE
  ) notFound()

  const query = parseEmbedQuery(await searchParams)
  const context = await loadEmbedAnimeContext(id, episodeNumber)
  const legacy = process.env.NODE_ENV === 'production' && process.env.PLAYBACK_EMBED_SESSIONS !== '1'
  const streams = legacy ? await fetchEmbedStreams(`/v1/embed/anime/${id}/${episodeNumber}`, { audio: query.audio, lang: query.lang }) : null
  if (streams && !streams.sources.length) return <EmbedEmptyState />

  return (
    <div className="flex min-h-dvh flex-col bg-[#09090b]">
      <EmbedPlayer
        autoPlay={query.autoPlay}
        lang={query.lang}
        audioLanguage={query.audio === 'dub' ? 'en' : 'ja'}
        overview={context.overview}
        pauseFacts={context.pauseFacts}
        posterSrc={context.posterSrc}
        {...(streams ? { sources: streams.sources, subtitles: streams.subtitles } : { playbackRef: { kind: 'anime' as const, id, episode: episodeNumber } })}
        startAt={query.startAt}
        title={context.title}
        videoId={id}
      />
    </div>
  )
}
