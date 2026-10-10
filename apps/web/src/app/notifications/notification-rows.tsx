'use client'

import { Button } from '@consumit/ui'
import type { ReleaseNotification } from '@consumit/contracts'
import Link from 'next/link'
import { episodeDestination, episodeLabel } from '@/lib/releases-browser'

export function NotificationRows({ items, busy, onRead, onOpen }: {
  items: readonly ReleaseNotification[]; busy: boolean;
  onRead: (id: string) => void; onOpen: (id: string, href: string) => void;
}) {
  return <ul className="divide-y divide-border">{items.map(item => <li className="flex items-start gap-3 py-4" key={item.id}>
    <span aria-hidden="true" className={`mt-2 size-1.5 shrink-0 rounded-full ${item.readAt ? 'bg-transparent' : 'bg-orange'}`} />
    <div className="min-w-0 flex-1">
      <Link className="block rounded-control text-sm font-bold text-ink outline-none hover:text-orange focus-visible:ring-2 focus-visible:ring-orange"
        href={episodeDestination(item.episode)} onClick={event => { event.preventDefault(); if (!busy) onOpen(item.id, episodeDestination(item.episode)) }}>
        <span className="block break-words">{item.episode.title}</span>
        <span className="mt-1 block text-xs font-normal text-copy">{episodeLabel(item.episode)} · Playback checked</span>
      </Link>
      <p className="mt-2 text-xs leading-5 text-muted"><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time>
        <span className="block">Availability can change. Playback checks again when you watch.</span>
      </p>
      {!item.readAt ? <Button className="mt-1" disabled={busy} onClick={() => onRead(item.id)} size="sm" variant="ghost">Mark read</Button> : null}
    </div>
  </li>)}</ul>
}
