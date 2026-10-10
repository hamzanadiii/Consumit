'use client'

import { Bell } from 'lucide-react'
import { Button } from '@consumit/ui'
import Link from 'next/link'
import { useEffect, useId, useRef, useState } from 'react'
import { readNotifications } from '@/lib/releases-browser'
import { useReleaseResource } from './use-release-resource'
import { useNotificationActions } from './use-notification-actions'
import { NotificationRows } from './notification-rows'

const preview = (signal: AbortSignal) => readNotifications(signal, 'all', undefined, 5)
export function NotificationBell({ pathname, navigate }: { pathname: string; navigate: (href: string) => void }) {
  const { member, data, error, loading, refresh } = useReleaseResource(preview, pathname, true)
  const [openOwner, setOpenOwner] = useState<string | null>(null)
  const open = Boolean(member && openOwner === `${member.id}:${pathname}`), id = useId()
  const trigger = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null), container = useRef<HTMLDivElement>(null)
  const actions = useNotificationActions(refresh, href => { setOpenOwner(null); navigate(href) })
  useEffect(() => {
    if (!open) return
    panel.current?.focus()
    const close = () => { setOpenOwner(null); trigger.current?.focus() }
    const keydown = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); close() } }
    const outside = (event: PointerEvent) => { if (!container.current?.contains(event.target as Node)) setOpenOwner(null) }
    document.addEventListener('keydown', keydown); document.addEventListener('pointerdown', outside)
    return () => { document.removeEventListener('keydown', keydown); document.removeEventListener('pointerdown', outside) }
  }, [open])
  if (!member) return null
  const count = data?.unreadCount ?? 0
  return <div className="relative shrink-0" ref={container}>
    <button aria-controls={open ? id : undefined} aria-expanded={open} aria-haspopup="dialog" aria-label={`Notifications${count ? `, ${count} unread` : ''}`}
      className="relative grid size-11 place-items-center rounded-control text-copy outline-none hover:bg-surface-raised hover:text-ink focus-visible:ring-2 focus-visible:ring-orange"
      onClick={() => { setOpenOwner(open ? null : `${member.id}:${pathname}`); if (!open) refresh() }} ref={trigger} type="button">
      <Bell aria-hidden="true" className="size-5" />
      {count ? <span aria-hidden="true" className="absolute right-0 top-0 min-w-4 rounded-control bg-orange px-1 text-xs font-bold leading-4 text-canvas">{count > 99 ? '99+' : count}</span> : null}
    </button>
    {open ? <div aria-label="Notifications" className="fixed right-4 z-50 mt-2 max-h-[70vh] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto rounded-card border border-border bg-surface p-5 text-ink outline-none focus-visible:ring-2 focus-visible:ring-orange sm:absolute sm:right-0 sm:top-full" id={id} ref={panel} role="dialog" tabIndex={-1}>
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-display text-xl">Notifications</h2><Button disabled={!count || actions.busy} onClick={() => void actions.read()} size="sm" variant="ghost">Mark all read</Button></div>
      {loading && !data ? <p className="py-4 text-sm text-muted" role="status">Reading notifications…</p> : null}
      {error || actions.error ? <div className="py-3 text-xs text-muted" role="alert"><p>{actions.error ?? error}</p><Button disabled={actions.busy} onClick={actions.error ? actions.retry : refresh} size="sm" variant="secondary">Try again</Button></div> : null}
      {data && !data.items.length ? <p className="py-5 text-sm leading-6 text-muted">No episode notifications yet. Enable reminders in <Link className="underline underline-offset-4" href="/settings#notifications">Settings</Link>.</p> : null}
      <NotificationRows busy={Boolean(actions.busy)} items={data?.items ?? []} onOpen={(id, href) => void actions.read(id, href)} onRead={id => void actions.read(id)} />
      <Link className="flex min-h-11 items-center border-t border-border text-sm font-bold text-copy outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-orange" href="/notifications">View all notifications</Link>
    </div> : null}
  </div>
}
