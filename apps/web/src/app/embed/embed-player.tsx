'use client'

import { ConsumitPlayer } from '@consumit/ui'

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

export function EmbedPlayer({ sources, subtitles, autoPlay = true }: {
  sources: EmbedSource[]
  subtitles?: EmbedSub[]
  autoPlay?: boolean
}) {
  if (!sources.length) return null

  const primary = sources[0]!

  return (
    <ConsumitPlayer
      source={{
        src: primary.url,
        type: primary.type,
        subtitles: subtitles?.map((s) => ({
          id: s.url,
          label: s.label,
          language: s.label.slice(0, 32),
          url: s.url,
        })),
        qualityHint: primary.quality,
      }}
      autoPlay={autoPlay}
      title=""
    />
  )
}
