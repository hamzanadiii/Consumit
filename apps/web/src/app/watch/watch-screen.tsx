import type { ReactNode } from 'react'

import { titleHref, type CatalogEpisode, type CatalogTitleDetail } from '@consumit/contracts'
import { LockKeyhole } from 'lucide-react'
import Link from 'next/link'

import { ConsumitPlayer, WatchHeader, buttonVariants, type ChapterCue, type DirectMediaSource } from '@consumit/ui'
import { WatchPlayback } from './watch-playback'

export type WatchDemoPlayback = {
  caption?: string | undefined
  chapters?: readonly ChapterCue[] | undefined
  qualityLabel?: string | undefined
  source: DirectMediaSource
  topMeta?: ReactNode | undefined
}

type WatchScreenProps = {
  interactive?: boolean
  nextHref?: string | undefined
  demo?: WatchDemoPlayback | undefined
  episode?: CatalogEpisode | undefined
  title: CatalogTitleDetail
}

/**
 * Deterministic fixture path for visual work only. Production routes never
 * pass `demo`: with no configured source the screen stays in its honest
 * unavailable branch and loads no media, demo clip, trailer, or embed.
 */
export function WatchScreen({ demo, episode, title, interactive = false, nextHref }: WatchScreenProps) {
  if (interactive && !demo) return <WatchPlayback key={`${title.kind}:${title.id}:${episode?.seasonNumber}:${episode?.episodeNumber}`} title={title} episode={episode} nextHref={nextHref} />
  const displayTitle = episode ? `${title.title} · ${episode.title}` : title.title
  const meta = episode
    ? `Season ${episode.seasonNumber} · Episode ${episode.episodeNumber}${episode.runtimeMinutes ? ` · ${episode.runtimeMinutes} min` : ''}`
    : [title.year, title.kind === 'movie' && title.runtimeMinutes ? `${title.runtimeMinutes} min` : 'Movie'].filter(Boolean).join(' · ')
  const poster = episode?.stillUrl ?? title.backdropUrl ?? title.posterUrl ?? undefined
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
            <Link className={buttonVariants({ size: 'sm', variant: 'ghost' })} href="/settings#support">Report an issue</Link>
          </div>
        </div>
      </section>
    </main>
  )
}
