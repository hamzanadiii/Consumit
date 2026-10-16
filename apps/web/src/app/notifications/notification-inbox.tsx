'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button, SectionHeading } from '@consumit/ui'
import { FilScreenShell } from '../home/filscreen-shell'
import { readNotifications } from '@/lib/releases-browser'
import { useReleaseResource } from './use-release-resource'
import { useNotificationActions } from './use-notification-actions'
import { NotificationRows } from './notification-rows'

export function NotificationInbox() {
  const [selection, setSelection] = useState<{ filter: 'all' | 'unread'; cursors: string[] }>({ filter: 'all', cursors: [] })
  const cursor = selection.cursors.at(-1)
  const loader = useCallback((signal: AbortSignal) => readNotifications(signal, selection.filter, cursor), [selection.filter, cursor])
  const { data, loading, error, refresh } = useReleaseResource(loader, `${selection.filter}:${cursor ?? ''}`, true)
  const router = useRouter(), actions = useNotificationActions(refresh, href => router.push(href))
  return <FilScreenShell pageHeading="Notifications" currentPathname="/notifications">
    <section className="mx-auto mt-8 w-full max-w-3xl pb-12" aria-labelledby="notifications-title">
      <SectionHeading id="notifications-title" title="Notifications" description="New episodes from your Watchlist and Favorites, after playback has been checked."
        action={<Button disabled={!data?.unreadCount || actions.busy} onClick={() => void actions.read()} size="sm" variant="secondary">Mark all read</Button>} />
      <div aria-label="Notification filter" className="flex gap-2 py-5" role="group">
        {(['all', 'unread'] as const).map(filter => <Button aria-pressed={selection.filter === filter} key={filter} onClick={() => setSelection({ filter, cursors: [] })} size="sm" variant={selection.filter === filter ? 'primary' : 'ghost'}>{filter === 'all' ? 'All' : `Unread${data?.unreadCount ? ` (${data.unreadCount})` : ''}`}</Button>)}
      </div>
      {loading && !data ? <p className="py-5 text-sm text-muted" role="status">Reading notifications…</p> : null}
      {error || actions.error ? <div className="flex flex-wrap items-center gap-3 py-4 text-sm text-muted" role="alert"><p>{actions.error ?? error}</p><Button disabled={actions.busy} onClick={actions.error ? actions.retry : refresh} size="sm" variant="secondary">Try again</Button></div> : null}
      {data && !data.items.length ? <p className="py-8 text-sm leading-6 text-muted">{selection.filter === 'unread' ? 'You’re all caught up. No unread episode updates.' : 'No episode notifications yet. Enable reminders in Settings to hear when a new episode passes a playback check.'}</p> : null}
      <NotificationRows busy={Boolean(actions.busy)} items={data?.items ?? []} onOpen={(id, href) => void actions.read(id, href)} onRead={id => void actions.read(id)} />
      {selection.cursors.length || data?.nextCursor ? <div className="mt-5 flex justify-between gap-3 border-t border-border pt-4">
        <Button disabled={!selection.cursors.length || loading} onClick={() => setSelection(value => ({ ...value, cursors: value.cursors.slice(0, -1) }))} variant="secondary">Previous</Button>
        <Button disabled={!data?.nextCursor || loading} onClick={() => { if (data?.nextCursor) setSelection(value => ({ ...value, cursors: [...value.cursors, data.nextCursor!] })) }} variant="secondary">Next</Button>
      </div> : null}
    </section>
  </FilScreenShell>
}
