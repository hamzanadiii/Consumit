import { titleHref, type CatalogEpisode, type CatalogTitleDetail } from '@consumit/contracts'
import { LockKeyhole } from 'lucide-react'

import { ConsumitPlayer, PlaybackReport, PlaybackTrustNote, WatchHeader, buttonVariants } from '@consumit/ui'

import { CatalogPreviewNotice } from '../catalog/catalog-attribution'

type WatchScreenProps = { episode?: CatalogEpisode | undefined; title: CatalogTitleDetail }

export function WatchScreen({ episode, title }: WatchScreenProps) {
  const displayTitle = episode ? `${title.title} · ${episode.title}` : title.title
  const meta = episode
    ? `Season ${episode.seasonNumber} · Episode ${episode.episodeNumber}${episode.runtimeMinutes ? ` · ${episode.runtimeMinutes} min` : ''}`
    : [title.year, title.kind === 'movie' && title.runtimeMinutes ? `${title.runtimeMinutes} min` : 'Movie'].filter(Boolean).join(' · ')
  const poster = episode?.stillUrl ?? title.backdropUrl ?? title.posterUrl ?? undefined

  return (
    <main className="min-h-screen bg-black" data-consumit-watch-screen data-tmdb-id={title.id}>
      <WatchHeader backHref={titleHref(title)} className="border-white/10 bg-black" exitHref={titleHref(title)} meta={meta} status={<strong className="text-muted">Source unavailable</strong>} title={displayTitle} />
      <CatalogPreviewNotice />
      <div className="mx-auto grid w-full max-w-[100rem] gap-6 px-4 py-5 sm:px-8 lg:min-h-[calc(100vh-5rem)] lg:grid-cols-[minmax(0,1fr)_21rem] lg:items-center lg:px-10 lg:py-8">
        <section aria-label={`${displayTitle} playback`} className="min-w-0">
          <ConsumitPlayer className="rounded-none border-white/10 lg:max-h-[calc(100vh-9rem)]" posterSrc={poster} status="No authorized source available" statusTone="unavailable" title={displayTitle} videoClassName="lg:max-h-[calc(100vh-12rem)]" />
          <div className="mt-4 flex items-start gap-3 rounded-card border border-white/10 bg-[#111114] p-4 text-sm leading-6 text-copy" role="status">
            <LockKeyhole aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-orange" />
            <p>Consumit has real metadata for this title, but no authorized direct-media source. Playback controls stay disabled until a licensed source is available.</p>
          </div>
        </section>
        <aside className="space-y-4 self-center" aria-label="Playback status and support">
          <section className="rounded-card border border-border bg-surface p-5">
            <h2 className="text-sm font-bold text-ink">Nothing was loaded</h2>
            <p className="mt-3 text-xs leading-5 text-muted">No iframe, embed, trailer, or demo clip is standing in for this title.</p>
            <a className={`${buttonVariants({ variant: 'secondary' })} mt-5 w-full`} href={titleHref(title)}>Return to title</a>
          </section>
          <PlaybackReport description="Tell us if you expected an authorized source. Your progress and library stay unchanged." href="/settings#support" />
          <PlaybackTrustNote>Consumit will never ask you to install a player, browser extension, or codec pack.</PlaybackTrustNote>
        </aside>
      </div>
    </main>
  )
}
