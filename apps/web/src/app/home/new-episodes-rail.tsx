'use client'

import { Button, SectionHeading } from '@consumit/ui'
import Link from 'next/link'
import { readReleases, episodeDestination, episodeLabel, releaseDate } from '@/lib/releases-browser'
import { useReleaseResource } from '../notifications/use-release-resource'
import { EpisodeCard } from '../shared/episode-card'

export function NewEpisodesRail() {
  const { member, data, error, refresh } = useReleaseResource(readReleases, '', true)
  if (!member || !data?.items.length) return null
  return <section aria-labelledby="new-episodes-title" className="mt-8">
    <SectionHeading id="new-episodes-title" title="New this week" description="Recent episodes from your Watchlist and Favorites."
      action={<Link className="inline-flex min-h-11 items-center text-xs text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-orange" href="/settings#notifications">Reminders</Link>} />
    {error || data?.partial ? <div className="flex flex-wrap items-center gap-3 py-4 text-sm text-muted" role="status"><p>{error ?? 'Some episode updates could not be refreshed. Showing the releases we know.'}</p><Button onClick={refresh} size="sm" variant="secondary">Try again</Button></div> : null}
    {data?.items.length ? <div className="-mx-1 flex gap-4 overflow-x-auto px-1 py-5" tabIndex={0} aria-label="New episodes">
      {data.items.map(episode => <div className="w-64 shrink-0 sm:w-72" key={`${episode.ref.kind}:${episode.ref.id}:${episode.ref.season}:${episode.ref.episode}`}>
        <EpisodeCard episode={episode.ref.episode} href={episodeDestination(episode, true)} title={episode.title} stillUrl={episode.imageUrl}
          actionLabel={episode.checkedAt ? 'Play episode' : 'View episodes'} linkLabel={`${episode.checkedAt ? 'Watch' : 'View'} ${episode.title}, ${episodeLabel(episode)}`}
          status={<><span className="block">{episodeLabel(episode)} · <time dateTime={episode.releasedAt}>{releaseDate(episode)}</time></span>
            <span className="mt-1 block">{episode.checkedAt ? <>Playback checked <time dateTime={episode.checkedAt}>{new Date(episode.checkedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</time></> : 'Aired · playback not confirmed'}</span></>} />
      </div>)}
    </div> : null}
  </section>
}
