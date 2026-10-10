import { ArtworkFrame } from '@consumit/ui'
import { Play } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

export type EpisodeCardProps = {
  actionLabel?: string
  linkLabel?: string
  status?: ReactNode
  episode: number
  href: string
  airDate?: string | null | undefined
  duration?: string | null | undefined
  fallbackArt?: string | null | undefined
  stillUrl?: string | null | undefined
  summary?: string | null | undefined
  title?: string | null | undefined
  upcoming?: boolean
}

/** Shared episode presentation; title-specific callers own identity and availability. */
export function EpisodeCard({ actionLabel = 'Play episode', linkLabel, status, airDate, duration, episode, fallbackArt, href, stillUrl, summary, title, upcoming = false }: EpisodeCardProps) {
  const artwork = <ArtworkFrame
    alt={stillUrl ? title ? `${title} still` : `Episode ${episode} still` : `Episode ${episode} title artwork`}
    className="rounded-none border-0"
    ratio="landscape"
    src={stillUrl ?? fallbackArt ?? undefined}
  />
  const date = airDate ? new Date(`${airDate}T00:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }) : null
  const metadata = [duration, date].filter(Boolean).join(' · ')
  return (
    <article className="group flex h-full min-w-0 flex-col overflow-hidden rounded-card border border-[var(--fs-field-border)] bg-[var(--fs-field)] transition-colors hover:border-[var(--fs-accent)]/60 motion-reduce:transition-none" data-filscreen-episode-card>
      {upcoming ? artwork : <Link aria-label={linkLabel ?? `Watch Episode ${episode}${title ? `: ${title}` : ''}`} className="block outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--fs-focus)]" href={href}>{artwork}</Link>}
      <div className="flex min-w-0 flex-1 flex-col gap-1 p-4">
        <p className="flex flex-wrap items-center gap-2 text-[0.6875rem] font-bold uppercase tracking-[0.12em] text-[var(--fs-accent)]">
          Episode {episode}
          {upcoming ? <span className="rounded border border-white/30 bg-black/40 px-1.5 py-0.5 text-[10px] font-bold normal-case tracking-normal text-white">Upcoming</span> : null}
        </p>
        {title ? <h3 className="truncate text-sm font-bold text-[var(--fs-ink)]" title={title}>{title}</h3> : null}
        {!stillUrl && fallbackArt ? <p className="text-[10px] text-[var(--fs-muted)]">Title artwork</p> : null}
        {metadata ? <p className="text-xs tabular-nums text-[var(--fs-muted)]">{metadata}</p> : null}
        {status ? <p className="text-xs leading-5 text-[var(--fs-muted)]">{status}</p> : null}
        {summary ? <p className="line-clamp-2 text-xs leading-5 text-[var(--fs-muted)]">{summary}</p> : null}
        <div className="mt-auto pt-3">
          {upcoming ? (
            <span aria-disabled="true" className="inline-flex min-h-9 cursor-not-allowed items-center gap-1.5 rounded-control border border-[var(--fs-line)] px-4 text-xs font-bold text-[var(--fs-muted)]">
              <Play aria-hidden="true" className="size-3 fill-current" /> Upcoming
            </span>
          ) : (
            <Link className="inline-flex min-h-9 items-center gap-1.5 rounded-control bg-orange px-4 text-xs font-bold text-canvas outline-none transition-[filter,transform] hover:brightness-110 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none" href={href}>
              <Play aria-hidden="true" className="size-3 fill-current" /> {actionLabel}
            </Link>
          )}
        </div>
      </div>
    </article>
  )
}
