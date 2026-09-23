'use client'

import type { AnimeTitleDetail } from '@consumit/contracts'
import { SegmentedControl } from '@consumit/ui'
import { Bell } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useMemo } from 'react'

import { browserAnimeEpisode } from '@/lib/anime-browser'
import { useEpisodeArt, type EpisodeArt } from '../../anime/use-episode-art'
import { EpisodeRail, type RailEpisode } from '../episode-rail'
import { WatchPlayback } from '../watch-playback'
import type { WatchEpisode, WatchTitle } from '../watch-screen'

function toWatchTitle(detail: AnimeTitleDetail): WatchTitle {
  return {
    kind: 'anime',
    id: detail.anilistId,
    title: detail.titles.preferred,
    year: detail.seasonYear,
    overview: detail.description || null,
    posterUrl: detail.coverImage.url || null,
    backdropUrl: detail.bannerImage,
    logoUrl: null,
    runtimeMinutes: null,
    episodeRuntimeMinutes: detail.episodeDuration,
  }
}

function toWatchEpisode(detail: AnimeTitleDetail, episode: number, stream?: { title: string; thumbnail: string | null } | undefined, art?: EpisodeArt | null | undefined): WatchEpisode {
  const name = stream?.title?.replace(/^episode\s+\d+\s*[-–:]\s*/i, '').trim() || art?.title || `Episode ${episode}`
  return {
    title: name,
    episodeNumber: episode,
    overview: art?.synopsis ?? null,
    runtimeMinutes: detail.episodeDuration,
    stillUrl: stream?.thumbnail ?? art?.thumbnail ?? null,
  }
}

function formatDuration(minutes: number | null): string | null {
  if (minutes === null) return null
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function formatAirDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' })
}

function formatCountdown(airingAt: string): string {
  const ms = Date.parse(airingAt) - Date.now()
  if (!Number.isFinite(ms) || ms <= 0) return 'Airing now'
  const days = Math.floor(ms / 86_400_000)
  const hours = Math.floor((ms % 86_400_000) / 3_600_000)
  const minutes = Math.floor((ms % 3_600_000) / 60_000)
  if (days > 0) return `in ${days}d ${hours}h ${minutes}m`
  if (hours > 0) return `in ${hours}h ${minutes}m`
  return `in ${minutes}m`
}

/** AniList streaming episodes are a flat, sometimes partial list titled
 *  like "Episode 12 - ...". Index them by leading episode number so the
 *  rail can show honest thumbnails/titles where they exist. */
function indexStreamingEpisodes(detail: AnimeTitleDetail): Map<number, { title: string; thumbnail: string | null }> {
  const indexed = new Map<number, { title: string; thumbnail: string | null }>()
  for (const entry of detail.streamingEpisodes) {
    const match = /^episode\s+(\d+)/i.exec(entry.title.trim())
    if (!match) continue
    const number = Number(match[1])
    if (!Number.isInteger(number) || number <= 0 || indexed.has(number)) continue
    indexed.set(number, { title: entry.title, thumbnail: entry.thumbnail })
  }
  return indexed
}

export function AnimeWatchScreen({ audio, detail, episode, nextHref, prevHref, pinnedProvider }: {
  audio: 'sub' | 'dub'
  detail: AnimeTitleDetail
  episode: number
  nextHref: string | undefined
  prevHref?: string | undefined
  pinnedProvider?: string | undefined
}) {
  const router = useRouter()
  const audioHref = (nextAudio: 'sub' | 'dub') => `/watch/anime/${detail.anilistId}?episode=${episode}&audio=${nextAudio}`
  const episodeHref = (number: number) => `/watch/anime/${detail.anilistId}?episode=${number}&audio=${audio}`
  const airedBefore = detail.nextAiringEpisode ? detail.nextAiringEpisode.episode - 1 : null
  const knownTotal = detail.episodes ?? (airedBefore !== null && airedBefore > 0 ? airedBefore : 0)
  const total = Math.min(10_000, Math.max(knownTotal, episode))
  const upcomingFrom = detail.nextAiringEpisode?.episode ?? null
  const isUpcoming = (number: number) => upcomingFrom !== null && number >= upcomingFrom
  const streaming = useMemo(() => indexStreamingEpisodes(detail), [detail])
  const currentStream = streaming.get(episode)
  const currentArt = useEpisodeArt(detail.anilistId, episode, { covered: !!currentStream?.thumbnail, upcoming: isUpcoming(episode) })
  const duration = formatDuration(detail.episodeDuration)
  const altTitle = detail.titles.english && detail.titles.english !== detail.titles.preferred ? detail.titles.english : detail.titles.romaji

  const episodes = useMemo(() => Array.from({ length: total }, (_, index) => index + 1), [total])
  const loadArt = useCallback(async (number: number) => {
    const found = await browserAnimeEpisode(detail.anilistId, number, AbortSignal.timeout(8_000)).catch(() => null)
    return found ? { title: found.title, thumbnail: found.thumbnail } : null
  }, [detail.anilistId])
  const railEpisodes = useMemo<RailEpisode[]>(
    () => episodes.map((number) => {
      const upcoming = isUpcoming(number)
      const meta = streaming.get(number)
      const title = meta?.title?.replace(/^episode\s+\d+\s*[-–:]\s*/i, '').trim() || null
      return {
        number,
        title,
        stillUrl: meta?.thumbnail ?? undefined,
        meta: duration,
        ...(upcoming ? { upcoming: true } : { href: episodeHref(number) }),
        ...(number === episode ? { current: true } : {}),
      }
    }),
    [duration, episode, episodeHref, episodes, streaming],
  )

  return (
    <div className="min-h-screen bg-[var(--fs-page)]" data-consumit-anime-watch>
      <div className="mx-auto w-full max-w-[100rem] px-3 pt-4 pb-10 sm:px-6 lg:px-8">
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="flex min-w-0 flex-col gap-6">
            <WatchPlayback
              audioLanguage={audio === 'dub' ? 'en' : 'ja'}
              episode={toWatchEpisode(detail, episode, currentStream, currentArt)}
              key={`${detail.anilistId}:${episode}:${audio}`}
              layout="embedded"
              nextHref={nextHref}
              prevHref={prevHref}
              title={toWatchTitle(detail)}
              {...(pinnedProvider ? { pinnedProvider } : {})}
            />

            <section aria-labelledby="anime-watch-title-heading" className="rounded-[16px] border border-[var(--fs-field-border)] bg-[var(--fs-field)] p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 id="anime-watch-title-heading" className="font-display text-2xl leading-tight font-normal tracking-[-0.02em] text-[var(--fs-ink)] sm:text-3xl">
                    <span className="text-[var(--fs-accent)]">{episode}.</span> {detail.titles.preferred}
                  </h1>
                  <p className="mt-1.5 text-xs tracking-wide text-[var(--fs-muted)] uppercase">
                    {[altTitle, total ? `${total} EPS` : null, duration, detail.seasonYear].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <SegmentedControl
                    legend="Audio language"
                    name="anime-audio"
                    onValueChange={(value) => router.push(audioHref(value === 'dub' ? 'dub' : 'sub'))}
                    options={[{ label: 'SUB', value: 'sub' }, { label: 'DUB', value: 'dub' }]}
                    value={audio}
                  />
                </div>
              </div>
              {detail.description ? (
                <p className="mt-4 max-w-[70ch] text-sm leading-7 text-[var(--fs-secondary)] line-clamp-3">
                  {detail.description}
                </p>
              ) : null}
            </section>
          </div>

          <div className="flex min-w-0 flex-col">
            <EpisodeRail
              countLabel={`Episode ${episode} of ${total}`}
              currentLabel="Now playing"
              episodes={railEpisodes}
              heading="Episodes"
              loadArt={loadArt}
            />
            {detail.nextAiringEpisode ? (
              <p className="mt-3 flex items-center gap-2 rounded-xl bg-[var(--fs-rail)] px-3 py-2.5 text-xs tabular-nums text-[var(--fs-secondary)]" role="status">
                <Bell aria-hidden="true" className="size-4 shrink-0 text-[var(--fs-accent)]" />
                <span className="min-w-0 truncate">
                  Episode {detail.nextAiringEpisode.episode} {formatCountdown(detail.nextAiringEpisode.airingAt)} · {formatAirDate(detail.nextAiringEpisode.airingAt)}
                </span>
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}
