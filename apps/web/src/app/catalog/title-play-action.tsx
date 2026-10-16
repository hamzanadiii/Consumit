'use client'

import { watchHref, type CatalogRef, type PlaybackProgress } from '@consumit/contracts'
import { Play } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useState } from 'react'

import { readTitleProgress } from '@/lib/playback-progress'
import { useSession } from '../session/session'

type Season = { number: number; episodeCount: number }
type Props = CatalogRef & { episodes?: number | null; seasons?: readonly Season[] }

export function titlePlayDestination(title: Props, progress: PlaybackProgress | null) {
  const regularSeasons = (title.seasons ?? []).filter((season) => season.number > 0 && season.episodeCount > 0).toSorted((a, b) => a.number - b.number)
  const first = { season: regularSeasons[0]?.number ?? 1, episode: 1 }
  if (!progress || progress.kind !== title.kind || progress.id !== title.id || (!progress.completed && progress.positionSeconds === 0)) return { href: watchHref(title, first), label: 'Play' }
  const last = { season: progress.season ?? 1, episode: progress.episode ?? 1 }
  if (!progress.completed) return { href: watchHref(title, last), label: title.kind === 'movie' ? 'Play' : 'Continue watching' }
  if (title.kind === 'anime' && title.episodes && last.episode < title.episodes) return { href: watchHref(title, { ...last, episode: last.episode + 1 }), label: 'Continue watching' }
  if (title.kind === 'series') {
    const season = regularSeasons.find((item) => item.number === last.season)
    if (season && last.episode < season.episodeCount) return { href: watchHref(title, { ...last, episode: last.episode + 1 }), label: 'Continue watching' }
    const next = season && regularSeasons.find((item) => item.number > last.season)
    if (next) return { href: watchHref(title, { season: next.number, episode: 1 }), label: 'Continue watching' }
  }
  return { href: watchHref(title, last), label: 'Watch again' }
}

export function TitlePlayAction({ id, kind, episodes, seasons }: Props) {
  const { member, status } = useSession()
  const memberId = member?.id
  const identity = `${memberId ?? 'guest'}:${kind}:${id}`
  const [saved, setSaved] = useState<{ identity: string; progress: PlaybackProgress | null } | null>(null)
  useEffect(() => {
    if (status === 'loading') return
    let controller: AbortController | undefined
    function refresh() {
      controller?.abort()
      const request = new AbortController()
      controller = request
      void readTitleProgress({ id, kind }, request.signal, memberId).then((progress) => {
        if (!request.signal.aborted) setSaved({ identity, progress })
      })
    }
    refresh()
    window.addEventListener('storage', refresh)
    window.addEventListener('focus', refresh)
    window.addEventListener('consumit-progress', refresh)
    return () => {
      controller?.abort()
      window.removeEventListener('storage', refresh)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('consumit-progress', refresh)
    }
  }, [id, kind, memberId, identity, status])
  const action = titlePlayDestination({ id, kind, ...(episodes !== undefined ? { episodes } : {}), ...(seasons !== undefined ? { seasons } : {}) }, saved?.identity === identity ? saved.progress : null)
  return <Link className="inline-flex min-h-11 items-center gap-2 rounded-control bg-orange px-6 text-sm font-bold text-canvas transition-[filter,transform] hover:brightness-110 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange focus-visible:ring-offset-2 focus-visible:ring-offset-canvas motion-reduce:transition-none" href={action.href}>
    <Play aria-hidden="true" className="size-4" />{action.label}
  </Link>
}
