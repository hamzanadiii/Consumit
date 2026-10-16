'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@consumit/ui'
import { ArrowUpRight, Lightbulb, MessageCircle, X } from 'lucide-react'

const notices = [
  { id: 'ads', title: 'Ads are your choice', description: 'Ads help keep Consumit running. You can turn them off anytime in Settings.', action: 'Ad settings', href: '/settings', icon: Lightbulb },
  { id: 'feedback', title: 'Make Consumit better', description: 'Have an idea, or something not working? We’d like to hear from you.', action: 'Send feedback', href: '/report-issue', icon: MessageCircle },
] as const
const storageKey = (id: string) => `consumit.browsing-notice.${id}.dismissed.v1`
function readDismissed() {
  return notices.filter(notice => {
    try { return window.localStorage.getItem(storageKey(notice.id)) === 'true' } catch { return false }
  }).map(notice => notice.id)
}

/** Device-local product tips, separate from private episode reminders. */
export function BrowsingNotifications({ enabled }: { enabled: boolean }) {
  const [dismissed, setDismissed] = useState<string[]>([])
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const receive = () => {
      const saved = readDismissed()
      setDismissed(current => [...new Set([...current, ...saved])])
      setReady(true)
    }
    receive()
    window.addEventListener('storage', receive)
    return () => window.removeEventListener('storage', receive)
  }, [])
  const notice = notices.find(item => !dismissed.includes(item.id))
  const [shown, setShown] = useState<string | null>(null)
  useEffect(() => {
    if (!enabled || !ready || !notice) return
    const timer = window.setTimeout(() => setShown(notice.id), 1500)
    return () => window.clearTimeout(timer)
  }, [enabled, ready, notice])

  function dismiss() {
    if (!notice) return
    setDismissed(current => [...current, notice.id])
    setShown(null)
    try { window.localStorage.setItem(storageKey(notice.id), 'true') } catch { /* Dismissed for this visit when storage is blocked. */ }
  }
  const Icon = notice?.icon
  return <aside aria-label="Consumit tips" aria-live="polite" aria-atomic="true" className="pointer-events-none fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 sm:left-auto sm:right-6 sm:w-96">
    {enabled && ready && notice && shown === notice.id && Icon ? <div className="pointer-events-auto relative rounded-card border border-[var(--fs-line)] bg-[var(--fs-field)] p-5 pr-14 text-[var(--fs-ink)]">
      <Button aria-label={`Dismiss ${notice.title}`} className="absolute right-1 top-1 size-11 text-[var(--fs-muted)]" onClick={dismiss} size="icon" variant="ghost"><X aria-hidden="true" className="size-4" /></Button>
      <div className="flex items-start gap-3"><Icon aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-orange" strokeWidth={1.5} /><div className="min-w-0">
        <h2 className="text-sm font-semibold">{notice.title}</h2>
        <p className="mt-1 text-xs leading-5 text-[var(--fs-secondary)]">{notice.description}</p>
        <Link className="mt-1 inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-orange outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" href={notice.href} onClick={dismiss}>{notice.action}<ArrowUpRight aria-hidden="true" className="size-3.5" /></Link>
      </div></div>
    </div> : null}
  </aside>
}
