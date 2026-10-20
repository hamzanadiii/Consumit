'use client'

import { watchHref, type CatalogEpisode, type CatalogTitleDetail } from '@consumit/contracts'
import { SeasonSelector } from '@consumit/ui'
import { useEffect, useMemo, useState } from 'react'
import { browserCatalogSeason } from '@/lib/catalog-browser'

import { EpisodeBrowser, useEpisodeBrowser, type RailEpisode } from '../episode-rail'
import { WatchPlayback } from '../watch-playback'
import { WatchPlayerSurface } from '../watch-surface'
import type { WatchEpisode, WatchTitle } from '../watch-screen'

function formatRuntime(minutes: number | null | undefined): string | null {
  if (minutes == null || minutes <= 0) return null
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return hours > 0 ? `${hours}h ${rest}m` : `${minutes}m`
}

/** Series watch: full-viewport player with episode selection inside Settings. Episode
 *  stills, titles, and runtimes ride the season payload the route already
 *  fetches. Browsing another season uses the existing catalog endpoint without
 *  navigating; choosing an aired episode updates the route query. */
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
  const [browseSelection, setBrowseSelection] = useState({ current: seasonNumber, value: seasonNumber })
  const browseSeason = browseSelection.current === seasonNumber ? browseSelection.value : seasonNumber
  const [seasonData, setSeasonData] = useState<{ season: number; episodes: readonly CatalogEpisode[] }>({ season: seasonNumber, episodes })
  const [seasonError, setSeasonError] = useState(false)
  const [seasonAttempt, setSeasonAttempt] = useState(0)
  const browsingEpisodes = useMemo(() => browseSeason === seasonNumber ? episodes : seasonData.season === browseSeason ? seasonData.episodes : [], [browseSeason, seasonNumber, episodes, seasonData])
  const seasonLoading = browseSeason !== seasonNumber && seasonData.season !== browseSeason && !seasonError
  useEffect(() => {
    if (browseSeason === seasonNumber) return
    let active = true
    const request = new AbortController()
    void browserCatalogSeason(tmdbId, browseSeason, request.signal).then(result => {
      if (active) { setSeasonData({ season: browseSeason, episodes: result.item.episodes }); setSeasonError(false) }
    }, () => { if (active) setSeasonError(true) })
    return () => { active = false; request.abort() }
  }, [tmdbId, browseSeason, seasonNumber, seasonAttempt])
  const railEpisodes = useMemo<RailEpisode[]>(() => (
    [...browsingEpisodes]
      .sort((a, b) => a.episodeNumber - b.episodeNumber)
      .map((item) => {
        const upcoming = !!item.airDate && Date.parse(item.airDate) > now
        return {
          number: item.episodeNumber,
          seasonNumber: browseSeason,
          title: item.title || `Episode ${item.episodeNumber}`,
          ...(item.overview ? { description: item.overview } : {}),
          ...(item.stillUrl ? { stillUrl: item.stillUrl } : {}),
          ...(formatRuntime(item.runtimeMinutes) ? { meta: formatRuntime(item.runtimeMinutes) } : {}),
          ...(item.airDate ? { airDate: item.airDate } : {}),
          ...(upcoming ? { upcoming: true } : { href: watchHref({ kind: 'series', id: tmdbId }, { episode: item.episodeNumber, season: browseSeason }) }),
          ...(browseSeason === seasonNumber && item.episodeNumber === episodeNumber ? { current: true } : {}),
        }
      })
  ), [browsingEpisodes, episodeNumber, now, browseSeason, seasonNumber, tmdbId])
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

  const episodeBrowser = useEpisodeBrowser({ episodes: railEpisodes })
  const episodePanel = <>
    {seasonLoading ? <p role="status" className="py-3 text-sm text-copy">Loading episodes…</p> : null}
    {seasonError ? <p role="alert" className="py-3 text-sm text-copy">Episodes could not load. <button className="min-h-11 underline" type="button" onClick={() => { setSeasonError(false); setSeasonAttempt(value => value + 1) }}>Retry</button></p> : null}
          <EpisodeBrowser
            pending={seasonLoading || seasonError}
            browser={episodeBrowser}
            actions={seasonOptions.length > 1 ? (
              <SeasonSelector
                label="Season"
                onValueChange={(value) => { setSeasonError(false); setBrowseSelection({ current: seasonNumber, value: Number(value) }) }}
                options={seasonOptions.map((season) => ({ label: `Season ${season}`, value: String(season) }))}
                value={String(browseSeason)}
              />
            ) : undefined}
            countLabel={`Season ${browseSeason} · ${railEpisodes.length} episode${railEpisodes.length === 1 ? '' : 's'}`}
            currentLabel="Current episode"
            episodes={railEpisodes}
            fallbackArt={detail.backdropUrl ?? detail.posterUrl}
            heading="Episodes"
          />
  </>

  return (
    <WatchPlayerSurface>
      <WatchPlayback
        episode={watchEpisode}
        episodePanel={episodePanel}
        layout="fullscreen"
        nextHref={nextHref}
        prevHref={prevHref}
        title={watchTitle}
        {...(pinnedProvider ? { pinnedProvider } : {})}
      />
    </WatchPlayerSurface>
  )
}
