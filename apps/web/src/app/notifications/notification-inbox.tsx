'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from '../session/session'
import { SocialInbox } from '../taste/social'
import { Button, SectionHeading } from '@consumit/ui'
import { FilScreenShell } from '../home/filscreen-shell'
import { readNotifications } from '@/lib/releases-browser'
import { useReleaseResource } from './use-release-resource'
import { useNotificationActions } from './use-notification-actions'
import { NotificationRows } from './notification-rows'
import { TitleRecommendationsInbox } from '../taste/title-recommendations-inbox'

type NotificationPage = Awaited<ReturnType<typeof readNotifications>>

export function NotificationInbox() {
  const { member } = useSession()
  const [selection, setSelection] = useState<{ filter: 'all' | 'unread'; cursors: string[] }>({ filter: 'all', cursors: [] })
  const cursor = selection.cursors.at(-1)
  const pageKey = `${member?.id ?? 'guest'}:${selection.filter}:${cursor ?? ''}`
  const [pageCache, setPageCache] = useState<Map<string, NotificationPage>>(() => new Map())
  const [fallbackKey, setFallbackKey] = useState<string | null>(null)
  const loader = useCallback(async (signal: AbortSignal) => {
    const page = await readNotifications(signal, selection.filter, cursor)
    if (!signal.aborted) setPageCache(current => {
      const next = new Map(current)
      next.delete(pageKey)
      next.set(pageKey, page)
      while (next.size > 5) next.delete(next.keys().next().value!)
      return next
    })
    return page
  }, [selection.filter, cursor, pageKey])
  const { data, loading, error, refresh } = useReleaseResource(loader, pageKey, true)
  const visibleData = data ?? pageCache.get(pageKey) ?? (fallbackKey ? pageCache.get(fallbackKey) : undefined)
  const router = useRouter(), actions = useNotificationActions(refresh, href => router.push(href))
  return <FilScreenShell currentPathname="/notifications" pageHeading={undefined}>
    <main id="consumit-main-content" tabIndex={-1} className="mx-auto mt-8 w-full max-w-3xl pb-12">
      <section aria-labelledby="notifications-title">
      <SectionHeading headingLevel={1} id="notifications-title" title="Notifications" description="New episodes from your Watchlist and Favorites, after playback has been checked."
        action={<Button disabled={!visibleData?.unreadCount || actions.busy} onClick={() => void actions.read()} size="sm" variant="secondary">Mark all read</Button>} />
      <TitleRecommendationsInbox />
      <SocialInbox />
      <div aria-label="Notification filter" className="flex gap-2 py-5" role="group">
        {(['all', 'unread'] as const).map(filter => <Button aria-pressed={selection.filter === filter} key={filter} onClick={() => { setFallbackKey(null); setSelection({ filter, cursors: [] }) }} size="sm" variant={selection.filter === filter ? 'primary' : 'ghost'}>{filter === 'all' ? 'All' : `Unread${visibleData?.unreadCount ? ` (${visibleData.unreadCount})` : ''}`}</Button>)}
      </div>
      {loading && !data ? <p className="py-5 text-sm text-muted" role="status">Reading notifications…</p> : null}
      {error || actions.error ? <div className="flex flex-wrap items-center gap-3 py-4 text-sm text-muted" role="alert"><p>{actions.error ?? error}</p><Button disabled={actions.busy} onClick={actions.error ? actions.retry : refresh} size="sm" variant="secondary">Try again</Button></div> : null}
      {data && !data.items.length ? <p className="py-8 text-sm leading-6 text-muted">{selection.filter === 'unread' ? 'You’re all caught up. No unread episode updates.' : 'No episode notifications yet. Enable reminders in Settings to hear when a new episode passes a playback check.'}</p> : null}
      <NotificationRows busy={Boolean(actions.busy)} items={visibleData?.items ?? []} onOpen={(id, href) => void actions.read(id, href)} onRead={id => void actions.read(id)} />
      {selection.cursors.length || data?.nextCursor ? <div className="mt-5 flex justify-between gap-3 border-t border-border pt-4">
        <Button disabled={!selection.cursors.length || loading} onClick={() => { setFallbackKey(pageKey); setSelection(value => ({ ...value, cursors: value.cursors.slice(0, -1) })) }} variant="secondary">Previous</Button>
        <Button disabled={!data?.nextCursor || loading || Boolean(error)} onClick={() => { if (data?.nextCursor) { setFallbackKey(pageKey); setSelection(value => ({ ...value, cursors: [...value.cursors, data.nextCursor!] })) } }} variant="secondary">Next</Button>
      </div> : null}
      </section>
    </main>
  </FilScreenShell>
}
