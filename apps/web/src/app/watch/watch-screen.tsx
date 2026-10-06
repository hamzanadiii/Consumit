import type { ReactNode } from 'react'

import { titleHref } from '@consumit/contracts'
import { LockKeyhole } from 'lucide-react'
import Link from 'next/link'

import { ConsumitPlayer, WatchHeader, buttonVariants, type ChapterCue, type DirectMediaSource } from '@consumit/ui'
import { WatchPlayback } from './watch-playback'
import { watchPoster } from './watch-poster'

/** Minimal title surface the Watch screens need. Movie/series catalog
 *  details and anime details both satisfy it; anime titles map their
 *  AniList fields onto it at the route boundary so watch identity,
 *  progress, and navigation stay honest per kind. */
export type WatchTitle = {
  kind: 'movie' | 'series' | 'anime'
  id: number
  title: string
  year?: number | null | undefined
  overview?: string | null | undefined
  posterUrl?: string | null | undefined
  backdropUrl?: string | null | undefined
  logoUrl?: string | null | undefined
  runtimeMinutes?: number | null | undefined
  episodeRuntimeMinutes?: number | null | undefined
  tmdbRating?: number | null | undefined
  certification?: string | null | undefined
  contentRating?: string | null | undefined
}

/** Minimal episode surface. Series episodes carry a season; anime episodes
 *  are identified by canonical number alone. */
export type WatchEpisode = {
  title: string
  seasonNumber?: number | undefined
  episodeNumber: number
  overview?: string | null | undefined
  runtimeMinutes?: number | null | undefined
  stillUrl?: string | null | undefined
}

export type WatchDemoPlayback = {
  caption?: string | undefined
  chapters?: readonly ChapterCue[] | undefined
  qualityLabel?: string | undefined
  source: DirectMediaSource
  topMeta?: ReactNode | undefined
}

/** Lab `?provider=` pin: provider ids use the config id shape. Anything
 *  else is ignored so junk query values never reach the switch call. */
export function sanitizePinnedProvider(value: unknown): string | undefined {
  const first = Array.isArray(value) ? value[0] : value
  return typeof first === 'string' && /^[a-z0-9-]{1,40}$/.test(first) ? first : undefined
}

type WatchScreenProps = {
  interactive?: boolean
  nextHref?: string | undefined
  prevHref?: string | undefined
  demo?: WatchDemoPlayback | undefined
  episode?: WatchEpisode | undefined
  title: WatchTitle
  audioLanguage?: string | undefined
  pinnedProvider?: string | undefined
}

/**
 * Deterministic fixture path for visual work only. Production routes never
 * pass `demo`: with no configured source the screen stays in its honest
 * unavailable branch and loads no media, demo clip, trailer, or embed.
 */
export function WatchScreen({ audioLanguage, demo, episode, title, interactive = false, nextHref, prevHref, pinnedProvider }: WatchScreenProps) {
  if (interactive && !demo) return <WatchPlayback key={`${title.kind}:${title.id}:${episode?.seasonNumber ?? 0}:${episode?.episodeNumber}`} title={title} episode={episode} nextHref={nextHref} prevHref={prevHref} {...(audioLanguage ? { audioLanguage } : {})} {...(pinnedProvider ? { pinnedProvider } : {})} />
  const displayTitle = episode ? `${title.title} · ${episode.title}` : title.title
  const meta = episode
    ? [episode.seasonNumber != null ? `Season ${episode.seasonNumber}` : null, `Episode ${episode.episodeNumber}`, episode.runtimeMinutes ? `${episode.runtimeMinutes} min` : null].filter(Boolean).join(' · ')
    : [title.year, title.kind === 'movie' && title.runtimeMinutes ? `${title.runtimeMinutes} min` : 'Movie'].filter(Boolean).join(' · ')
  const poster = watchPoster(episode?.stillUrl ?? title.backdropUrl ?? title.posterUrl)
  const hasDemo = demo != null
  const demoMeta = demo?.topMeta ?? (demo ? `Playing from Consumit · ${demo.qualityLabel ?? demo.source.qualityHint ?? 'HD'}` : undefined)

  return (
    <main className="flex min-h-screen flex-col bg-black" data-consumit-player-screen data-consumit-watch-screen data-tmdb-id={title.id}>
      <WatchHeader backHref={titleHref(title)} className="border-white/10 bg-black" exitHref={titleHref(title)} linkComponent={Link} meta={meta} status={hasDemo ? <strong className="text-copy">Preview source ready</strong> : <strong className="text-muted">Source unavailable</strong>} title={displayTitle} />
      <section aria-label={`${displayTitle} playback`} className={`mx-auto flex w-full max-w-[100rem] flex-col px-3 py-3 sm:px-6 sm:py-5 lg:px-8 ${hasDemo ? 'flex-1' : ''}`}>
        <div className={hasDemo ? 'flex min-h-0 flex-1 items-start pt-3 lg:items-center lg:pt-0' : 'pt-3'}>
          {hasDemo && demo ? (
            <ConsumitPlayer
              caption={demo.caption}
              chapters={demo.chapters}
              className="w-full rounded-none border-white/10"
              posterSrc={poster}
              source={demo.source}
              status="Preview source ready"
              statusTone="healthy"
              title={displayTitle}
              topMeta={demoMeta}
            />
          ) : (
            <ConsumitPlayer className="w-full rounded-none border-white/10" posterSrc={poster} status="No playback source available" statusTone="unavailable" title={displayTitle} />
          )}
        </div>
        <div className="flex flex-col gap-4 border-t border-white/10 py-4 sm:flex-row sm:items-center sm:justify-between" role="status">
          <div className="flex max-w-[72ch] items-start gap-3 text-xs leading-5 text-muted sm:text-sm sm:leading-6">
            <LockKeyhole aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-orange" />
            {hasDemo ? (
              <p>Preview fixture. Source selection, status, and progress stay synchronized from one playback state.</p>
            ) : (
              <p>This is the Consumit Player. Playback remains disabled until a configured direct-media source is available.</p>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Link className={buttonVariants({ size: 'sm', variant: 'secondary' })} href={titleHref(title)}>Return to title</Link>
            <Link className={buttonVariants({ size: 'sm', variant: 'ghost' })} href="/report-issue?category=playback">Report an issue</Link>
          </div>
        </div>
      </section>
    </main>
  )
}
