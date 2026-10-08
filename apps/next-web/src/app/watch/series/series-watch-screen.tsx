'use client'

import { watchHref, type CatalogEpisode, type CatalogTitleDetail } from '@consumit/contracts'
import { SeasonSelector } from '@consumit/next-ui'
import { useRouter } from 'next/navigation'
import { useMemo } from 'react'

import { EpisodeRail, type RailEpisode } from '../episode-rail'
import { WatchPlayback } from '../watch-playback'
import { AdSlot } from '../../shared/ad-slot'
import type { WatchEpisode, WatchTitle } from '../watch-screen'

function formatRuntime(minutes: number | null | undefined): string | null {
  if (minutes == null || minutes <= 0) return null
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return hours > 0 ? `${hours}h ${rest}m` : `${minutes}m`
}

/** Series watch: embedded player beside the shared episode rail. Episode
 *  stills, titles, and runtimes ride the season payload the route already
 *  fetches — no extra requests. Unaired episodes (future air dates) render
 *  disabled; seasons switch through the route query. */
export function SeriesWatchScreen({ detail, episodeNumber, episodes, nextHref, prevHref, now, pinnedProvider, seasonNumber, seasons, tmdbId }: {
  detail: CatalogTitleDetail
  episodeNumber: number
  episodes: readonly CatalogEpisode[]
  nextHref?: string | undefined
  prevHref?: string | undefined
  now: number
  pinnedProvider?: string | undefined
  seasonNumber: number
  seasons: readonly { number: number }[]
  tmdbId: number
}) {
  const router = useRouter()
  const railEpisodes = useMemo<RailEpisode[]>(() => (
    [...episodes]
      .sort((a, b) => a.episodeNumber - b.episodeNumber)
      .map((item) => {
        const upcoming = !!item.airDate && Date.parse(item.airDate) > now
        return {
          number: item.episodeNumber,
          title: item.title || `Episode ${item.episodeNumber}`,
          ...(item.stillUrl ? { stillUrl: item.stillUrl } : {}),
          ...(formatRuntime(item.runtimeMinutes) ? { meta: formatRuntime(item.runtimeMinutes) } : {}),
          ...(item.airDate ? { airDate: item.airDate } : {}),
          ...(upcoming ? { upcoming: true } : { href: watchHref({ kind: 'series', id: tmdbId }, { episode: item.episodeNumber, season: seasonNumber }) }),
          ...(item.episodeNumber === episodeNumber ? { current: true } : {}),
        }
      })
  ), [episodes, episodeNumber, now, seasonNumber, tmdbId])
  const seasonOptions = useMemo(() => [...seasons].map((season) => season.number).sort((a, b) => a - b), [seasons])
  const watchTitle = detail as WatchTitle
  const current = episodes.find((item) => item.episodeNumber === episodeNumber)
  const watchEpisode: WatchEpisode | undefined = current
    ? {
      title: current.title || `Episode ${current.episodeNumber}`,
      seasonNumber: current.seasonNumber,
      episodeNumber: current.episodeNumber,
      ...(current.overview ? { overview: current.overview } : {}),
      ...(current.runtimeMinutes ? { runtimeMinutes: current.runtimeMinutes } : {}),
      ...(current.stillUrl ? { stillUrl: current.stillUrl } : {}),
    }
    : undefined

  return (
    <div className="min-h-screen bg-[var(--fs-page)]" data-consumit-series-watch>
      <div className="mx-auto w-full max-w-[100rem] px-3 pt-4 pb-10 sm:px-6 lg:px-8">
        <div className="mb-6">
          <AdSlot placement="watch" position="early" />
        </div>
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col gap-6">
            <WatchPlayback
              episode={watchEpisode}
              key={`${tmdbId}:${seasonNumber}:${episodeNumber}`}
              layout="embedded"
              nextHref={nextHref}
              prevHref={prevHref}
              title={watchTitle}
              {...(pinnedProvider ? { pinnedProvider } : {})}
            />
          </div>
          <EpisodeRail
            actions={seasonOptions.length > 1 ? (
              <SeasonSelector
                label="Season"
                onValueChange={(value) => router.push(watchHref({ kind: 'series', id: tmdbId }, { episode: 1, season: Number(value) }))}
                options={seasonOptions.map((season) => ({ label: `Season ${season}`, value: String(season) }))}
                value={String(seasonNumber)}
              />
            ) : undefined}
            countLabel={`Season ${seasonNumber} · ${railEpisodes.length} episode${railEpisodes.length === 1 ? '' : 's'}`}
            currentLabel="Now playing"
            episodes={railEpisodes}
            fallbackArt={detail.backdropUrl ?? detail.posterUrl}
            heading="Episodes"
          />
        </div>
      </div>
    </div>
  )
}
