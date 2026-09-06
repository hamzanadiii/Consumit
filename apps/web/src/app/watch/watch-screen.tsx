'use client'

import { useMemo, useState } from 'react'

import {
  ConsumitPlayer,
  PlaybackReport,
  PlaybackTrustNote,
  SourceSelector,
  WatchHeader,
  type PlaybackSource,
} from '@consumit/ui'

const sources: readonly PlaybackSource[] = [
  {
    detail: '1080p · Original audio · Subtitles available',
    label: 'Consumit preview master',
    status: 'healthy',
    value: 'preview-master',
  },
  {
    detail: '720p · Lower bandwidth · Same authorized cut',
    label: 'Consumit low-bandwidth master',
    status: 'healthy',
    value: 'preview-low',
  },
]

function titleFromId(id: string) {
  if (id.startsWith('violet-hours')) return 'Violet Hours · Glass Teeth'
  return id
    .split('-')
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ') || 'The Last City After Rain'
}

export function WatchScreen({ id }: { id: string }) {
  const [source, setSource] = useState('preview-master')
  const activeSource = useMemo(
    () => sources.find((item) => item.value === source) ?? sources[0]!,
    [source],
  )
  const title = titleFromId(id)

  return (
    <main className="min-h-screen bg-black" data-consumit-watch-screen data-watch-id={id}>
      <WatchHeader
        backHref={id.startsWith('violet-hours') ? '/series/violet-hours' : '/title/the-last-city-after-rain'}
        className="border-white/10 bg-black"
        exitHref={id.startsWith('violet-hours') ? '/series/violet-hours' : '/title/the-last-city-after-rain'}
        meta={id.startsWith('violet-hours') ? 'Season 2 · Episode 4' : '2026 · 2h 08m'}
        status={<>Playing through <strong className="text-copy">{activeSource.label}</strong></>}
        title={title}
      />

      <div className="mx-auto grid w-full max-w-[100rem] gap-6 px-4 py-5 sm:px-8 lg:min-h-[calc(100vh-5rem)] lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-center lg:px-10 lg:py-8">
        <section aria-label={`${title} playback`} className="min-w-0">
          <ConsumitPlayer
            className="rounded-none border-white/10 lg:max-h-[calc(100vh-9rem)]"
            muted
            posterSrc="/assets/cinematic-backdrop.svg"
            src="/assets/demo-playback.mp4"
            status={`Ready · ${activeSource.label}`}
            title={title}
            videoClassName="lg:max-h-[calc(100vh-12rem)]"
          />
          <div className="mt-4 flex flex-col gap-2 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
            <p>Progress is saved to your watch history, independent of the active source.</p>
            <p className="shrink-0 tabular-nums">Subtitles: English · Audio: Original</p>
          </div>
        </section>

        <aside className="space-y-4 self-center" aria-label="Playback options and support">
          <SourceSelector
            description="Choose an authorized direct-media rendition. The player and controls always stay inside Consumit."
            name="playback-source"
            onValueChange={setSource}
            sources={sources}
            value={source}
          />
          <PlaybackReport
            description="Tell us what happened. Your place in the title remains saved."
            href="/settings#support"
          />
          <PlaybackTrustNote>
            Consumit will never ask you to install a player, browser extension, or codec pack.
          </PlaybackTrustNote>
        </aside>
      </div>
    </main>
  )
}
