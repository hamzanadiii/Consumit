'use client'

import type { AnimeTitleDetail } from '@consumit/contracts'
import { Button, SegmentedControl } from '@consumit/ui'
import { Bell } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useMemo, useState } from 'react'
import { useExperience } from '../../experience/experience-provider'

import { browserAnimeEpisodes } from '@/lib/anime-browser'
import { useEpisodeArt, type EpisodeArt } from '../../anime/use-episode-art'
import { EpisodeRail, type RailEpisode } from '../episode-rail'
import { WatchPlayback } from '../watch-playback'
import { WatchDetails, WatchSurface } from '../watch-surface'
import styles from '../watch-surface.module.css'
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
    logoUrl: detail.logoUrl,
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

type AnimeWatchProps = {
  audio?: 'sub' | 'dub' | undefined
  detail: AnimeTitleDetail
  episode: number
  nextHref: string | undefined
  prevHref?: string | undefined
  pinnedProvider?: string | undefined
}
export function AnimeWatchScreen(props: AnimeWatchProps) {
  const experience = useExperience()
  if (!experience.ready) return <p className="min-h-screen bg-[var(--fs-page)] p-6 text-[var(--fs-ink)]" role="status">Loading your viewing preferences…</p>
  return <AnimeWatchReady {...props} key={`${experience.owner}:${props.detail.anilistId}:${props.episode}:${props.audio ?? 'preferred'}`} initialAudio={props.audio ?? experience.preferences.animeAudio} />
}
function AnimeWatchReady({ detail, episode, nextHref, prevHref, pinnedProvider, initialAudio }: AnimeWatchProps & { initialAudio: 'sub' | 'dub' }) {
  const [audio] = useState(initialAudio)
  const experience = useExperience()
  const router = useRouter()
  const audioNavigation = (href: string | undefined) => href ? `${href}${href.includes('?') ? '&' : '?'}audio=${audio}` : undefined
  const audioHref = (nextAudio: 'sub' | 'dub') => `/watch/anime/${detail.anilistId}?episode=${episode}&audio=${nextAudio}`
  const airedBefore = detail.nextAiringEpisode ? detail.nextAiringEpisode.episode - 1 : null
  const knownTotal = detail.episodes ?? (airedBefore !== null && airedBefore > 0 ? airedBefore : 0)
  const total = Math.min(10_000, Math.max(knownTotal, episode))
  const upcomingFrom = detail.nextAiringEpisode?.episode ?? null
  const isUpcoming = (number: number) => upcomingFrom !== null && number >= upcomingFrom
  const streaming = useMemo(() => indexStreamingEpisodes(detail), [detail])
  const currentStream = streaming.get(episode)
  const currentArt = useEpisodeArt(detail.anilistId, episode, { upcoming: isUpcoming(episode) })
  const watchEpisode = toWatchEpisode(detail, episode, currentStream, currentArt)
  const duration = formatDuration(detail.episodeDuration)
  const altTitle = detail.titles.english && detail.titles.english !== detail.titles.preferred ? detail.titles.english : detail.titles.romaji

  const episodes = useMemo(() => Array.from({ length: total }, (_, index) => index + 1), [total])
  const loadPage = useCallback(async (numbers: number[]) => {
    const found = await browserAnimeEpisodes(detail.anilistId, numbers, AbortSignal.timeout(12_000))
    return Object.fromEntries(numbers.map((number, index) => [number, found[index] ? { title: found[index]!.title, thumbnail: found[index]!.thumbnail, airDate: found[index]!.airDate, duration: found[index]!.duration } : null]))
  }, [detail.anilistId])
  const railEpisodes = useMemo<RailEpisode[]>(
    () => episodes.map((number) => {
      const upcoming = upcomingFrom !== null && number >= upcomingFrom
      const meta = streaming.get(number)
      const title = meta?.title?.replace(/^episode\s+\d+\s*[-–:]\s*/i, '').trim() || null
      return {
        number,
        title,
        stillUrl: meta?.thumbnail ?? undefined,
        meta: duration,
        ...(upcoming ? { upcoming: true } : { href: `/watch/anime/${detail.anilistId}?episode=${number}&audio=${audio}` }),
        ...(number === episode ? { current: true } : {}),
      }
    }),
    [audio, detail.anilistId, duration, episode, episodes, streaming, upcomingFrom],
  )

  return (
    <WatchSurface backHref={`/anime/${detail.anilistId}`}>
        <div className={styles.columns} data-consumit-anime-watch>
          <div className={styles.primary}>
            <WatchPlayback
              audioControl={
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-xs font-bold text-copy">Audio</span>
                  <SegmentedControl
                    className="w-36"
                    legend="Audio language"
                    name="anime-audio"
                    onValueChange={(value) => { const nextAudio = value === 'dub' ? 'dub' : 'sub'; void experience.patch({ animeAudio: nextAudio }).catch(() => {}); router.push(audioHref(nextAudio)) }}
                    options={[{ label: 'SUB', value: 'sub' }, { label: 'DUB', value: 'dub' }]}
                    value={audio}
                  />
                </div>
              }
              audioLanguage={audio === 'dub' ? 'en' : 'ja'}
              episode={watchEpisode}
              key={`${detail.anilistId}:${episode}:${audio}`}
              layout="embedded"
              nextHref={audioNavigation(nextHref)}
              prevHref={audioNavigation(prevHref)}
              title={toWatchTitle(detail)}
              {...(pinnedProvider ? { pinnedProvider } : {})}
            />

            <WatchDetails
              episode={watchEpisode.title === `Episode ${episode}` ? watchEpisode.title : `Episode ${episode} · ${watchEpisode.title}`}
              meta={[detail.seasonYear, duration, total ? `${total} episodes` : null, altTitle, currentArt?.airDate ? formatAirDate(currentArt.airDate) : null].filter(Boolean).join(' · ')}
              overview={currentArt?.synopsis ?? detail.description}
              title={detail.titles.preferred}
            />
            {experience.error ? <p role="alert" className={styles.notice}>{experience.error} <Button variant="ghost" onClick={() => void experience.retry().catch(() => {})}>Retry saving preferences</Button></p> : null}
          </div>

          <div className={styles.aside}>
            <EpisodeRail
              countLabel={`Episode ${episode} of ${total}`}
              currentLabel="Now playing"
              episodes={railEpisodes}
              fallbackArt={detail.bannerImage ?? detail.coverImage.url}
              heading="Episodes"
              loadPage={loadPage}
              pageSize={8}
            />
            {detail.nextAiringEpisode ? (
              <p className={styles.airing} role="status">
                <Bell aria-hidden="true" className="size-4 shrink-0 text-[var(--fs-accent)]" />
                <span className="min-w-0 truncate">
                  Episode {detail.nextAiringEpisode.episode} {formatCountdown(detail.nextAiringEpisode.airingAt)} · {formatAirDate(detail.nextAiringEpisode.airingAt)}
                </span>
              </p>
            ) : null}
          </div>
        </div>
    </WatchSurface>
  )
}
