'use client'

import { useCallback, useRef } from 'react'

import { ConsumitPlayer, type DirectMediaSource } from '@consumit/ui'

export interface EmbedSource {
  url: string
  type: 'hls' | 'dash' | 'native'
  quality: string
  provider: string
  headers: Record<string, string>
}

export interface EmbedSub {
  url: string
  label: string
  format: 'vtt' | 'srt'
}

export type EmbedPlayerEventName = 'play' | 'pause' | 'seeked' | 'ended' | 'timeupdate'

export type EmbedPlayerProps = {
  autoPlay?: boolean
  lang?: string | undefined
  overview?: string | undefined
  pauseFacts?: string | undefined
  posterSrc?: string | undefined
  sources: EmbedSource[]
  startAt?: number
  subtitles?: EmbedSub[]
  /** Human title from the catalog (or an honest fallback). */
  title: string
  /** TMDB id echoed to the parent frame in PLAYER_EVENT payloads. */
  videoId: number
}

function parentPayload(event: EmbedPlayerEventName, currentTime: number, duration: number, videoId: number) {
  return {
    type: 'PLAYER_EVENT',
    data: { currentTime, duration, event, video_id: videoId },
  } as const
}

/** Post one player event to the embedding page (VixSrc-compatible shape).
 *  No-ops outside an iframe so the standalone route stays quiet. */
export function postEmbedPlayerEvent(
  event: EmbedPlayerEventName,
  currentTime: number,
  duration: number,
  videoId: number,
  target: Window = window,
) {
  if (target.parent === target) return
  target.parent.postMessage(parentPayload(event, currentTime, duration, videoId), '*')
}

export function EmbedPlayer({ autoPlay = true, lang, overview, pauseFacts, posterSrc, sources, startAt = 0, subtitles, title, videoId }: EmbedPlayerProps) {
  const durationRef = useRef(0)

  const emit = useCallback((event: EmbedPlayerEventName, video: HTMLVideoElement) => {
    const duration = video.duration
    if (Number.isFinite(duration) && duration > 0) durationRef.current = duration
    postEmbedPlayerEvent(event, video.currentTime, durationRef.current, videoId)
  }, [videoId])

  if (!sources.length) return null

  const primary = sources[0]!
  const source: DirectMediaSource = {
    src: primary.url,
    type: primary.type,
    subtitles: subtitles?.map((sub) => ({
      id: sub.url,
      label: sub.label,
      language: sub.label.slice(0, 32),
      url: sub.url,
    })),
    qualityHint: primary.quality,
  }

  return (
    <ConsumitPlayer
      autoPlay={autoPlay}
      className="w-full rounded-none border-0"
      onDurationChange={(event) => {
        const duration = event.currentTarget.duration
        if (Number.isFinite(duration) && duration > 0) durationRef.current = duration
      }}
      onEnded={(event) => {
        emit('ended', event.currentTarget)
      }}
      onPause={(event) => {
        emit('pause', event.currentTarget)
      }}
      onPlay={(event) => {
        emit('play', event.currentTarget)
      }}
      onSeeked={(event) => {
        emit('seeked', event.currentTarget)
      }}
      onTimeUpdate={(event) => {
        emit('timeupdate', event.currentTarget)
      }}
      pauseFacts={pauseFacts}
      pauseLogoUrl={posterSrc}
      pauseOverview={overview}
      posterSrc={posterSrc}
      resumeAt={startAt}
      resumePlaying={autoPlay}
      source={source}
      status="Source ready"
      statusTone="healthy"
      subtitleLanguages={lang ? [lang] : undefined}
      title={title}
      topMeta={['Playing from Consumit', primary.quality && primary.quality !== 'Auto' ? primary.quality : null].filter(Boolean).join(' · ')}
    />
  )
}
