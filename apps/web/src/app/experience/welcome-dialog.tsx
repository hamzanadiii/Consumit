'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@consumit/ui'
import { GUIDE_VERSION } from '@consumit/contracts'
import { ArrowUpRight, Check, Copy, Heart, Share2, X } from 'lucide-react'
import { absoluteUrl } from '@/lib/site'
import { useExperience } from './experience-provider'
import { BrowsingNotifications } from './browsing-notifications'

const WELCOME_KEY = 'consumit.share-welcome-dismissed.v1'
function readWelcomeDismissed() {
  if (typeof window === 'undefined') return false
  try { return window.localStorage.getItem(WELCOME_KEY) === 'true' }
  catch { return false }
}
const shareUrl = absoluteUrl('/')
const shareText = 'Discover movies, series, and anime with Consumit. Sign in to keep your watchlist and progress synced, and turn off our limited browsing ads anytime in Settings.'
const shareTargets = [
  { label: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?${new URLSearchParams({ u: shareUrl })}` },
  { label: 'WhatsApp', href: `https://wa.me/?${new URLSearchParams({ text: `${shareText} ${shareUrl}` })}` },
  { label: 'X', href: `https://twitter.com/intent/post?${new URLSearchParams({ text: shareText, url: shareUrl })}` },
  { label: 'Reddit', href: `https://www.reddit.com/submit?${new URLSearchParams({ url: shareUrl, title: 'Watch movies, series, and anime on Consumit' })}` },
  { label: 'Telegram', href: `https://t.me/share/url?${new URLSearchParams({ url: shareUrl, text: shareText })}` },
] as const

export function WelcomeDialog({ pathname }: { pathname: string }) {
  const experience = useExperience()
  const router = useRouter()
  const dialog = useRef<HTMLDialogElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const [dismissedOwner, setDismissedOwner] = useState<string | undefined>()
  const [welcomeDismissed, setWelcomeDismissed] = useState(readWelcomeDismissed)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle')
  const [shareOpen, setShareOpen] = useState(false)
  const [shared, setShared] = useState(false)
  const ownerKey = experience.owner ?? 'guest'
  const eligible = /^\/(?:$|movies(?:\/|$)|series(?:\/|$)|anime(?:\/|$)|title(?:\/|$)|search(?:\/|$))/.test(pathname)
  const guideEnabled = process.env.NEXT_PUBLIC_CONSUMIT_WELCOME_ENABLED === 'true'
  const guidePending = guideEnabled && eligible && experience.ready && dismissedOwner !== ownerKey
    && !(experience.preferences.guideVersion >= GUIDE_VERSION && experience.preferences.guideStatus !== 'pending')
  const introPending = eligible && experience.ready && !welcomeDismissed
  const visible = introPending || guidePending

  useEffect(() => {
    if (!visible || !dialog.current) return
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const element = dialog.current
    const modal = typeof element.showModal === 'function' ? element.showModal.bind(element) : null
    modal?.()
    return () => { if (typeof element.close === 'function') element.close(); returnFocus.current?.focus() }
  }, [visible])

  function dismiss(start = false) {
    setWelcomeDismissed(true)
    try { window.localStorage.setItem(WELCOME_KEY, 'true') } catch { /* This visit stays dismissed in memory. */ }
    setDismissedOwner(ownerKey)
    if (guidePending) {
      void experience.patch({ guideVersion: GUIDE_VERSION, guideStatus: 'dismissed' }).catch(() => { /* Guide status can be changed later in Settings. */ })
    }
    if (start) {
      const next = `${window.location.pathname}${window.location.search}${window.location.hash}`
      router.push(`/onboarding?${new URLSearchParams({ next })}`)
    }
  }

  async function copyShareLink() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(shareUrl)
      setCopyState('copied')
    } catch {
      setCopyState('error')
      setShareOpen(true)
    }
  }

  async function shareConsumit() {
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Consumit', text: shareText, url: shareUrl })
        setShared(true)
        return
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') return
      }
    }
    setShareOpen(value => !value)
  }

  return <><BrowsingNotifications enabled={eligible && experience.ready && !visible} /><dialog ref={dialog} aria-labelledby="welcome-title" aria-describedby="welcome-description" className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto overscroll-contain rounded-card border border-[var(--fs-line)] bg-[var(--fs-field)] p-0 text-[var(--fs-ink)] backdrop:bg-black/80" onCancel={event => { event.preventDefault(); dismiss() }}>
    <div className="relative px-5 pb-5 pt-8 sm:px-8 sm:pb-7 sm:pt-10">
      <Button aria-label="Close welcome" className="absolute right-2 top-2 size-11 text-[var(--fs-muted)]" onClick={() => dismiss()} size="icon" variant="ghost"><X aria-hidden="true" className="size-5" /></Button>
      <div className="text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-orange/10 text-orange"><Heart aria-hidden="true" className="size-7" strokeWidth={1.5} /></span>
        <h2 className="mt-5 text-balance font-display text-3xl leading-tight sm:text-4xl" id="welcome-title">Welcome to Consumit.</h2>
        <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-[var(--fs-secondary)]" id="welcome-description">Movies, series, anime. A good watch is better shared. Send Consumit to a friend and help keep it growing.</p>
        <div className="mt-5 flex items-center justify-center gap-2">
          <Button aria-controls="welcome-share-options" aria-expanded={shareOpen} className="min-h-11" onClick={() => void shareConsumit()} variant="accent"><Share2 aria-hidden="true" className="size-4" />Share Consumit</Button>
          <Button aria-label={copyState === 'copied' ? 'Link copied' : 'Copy Consumit link'} className="size-11 border border-[var(--fs-line)]" onClick={() => void copyShareLink()} size="icon" variant="secondary">{copyState === 'copied' ? <Check aria-hidden="true" className="size-4" /> : <Copy aria-hidden="true" className="size-4" />}</Button>
        </div>
        <div hidden={!shareOpen} id="welcome-share-options" className="mt-4">
          <p className="mb-2 text-xs text-[var(--fs-muted)]">Share with your people</p>
          <div className="flex flex-wrap justify-center gap-2">{shareTargets.map(target => <a className="inline-flex min-h-11 items-center gap-1 rounded-control border border-[var(--fs-line)] px-3 text-xs text-[var(--fs-secondary)] outline-none transition-colors hover:bg-[var(--fs-hover)] hover:text-[var(--fs-ink)] focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)] motion-reduce:transition-none" href={target.href} key={target.label} rel="noopener noreferrer" target="_blank">{target.label}<ArrowUpRight aria-hidden="true" className="size-3" /></a>)}</div>
        </div>
        {copyState !== 'idle' || shared ? <p aria-live="polite" className="mt-3 text-xs leading-5 text-[var(--fs-muted)]" role={copyState === 'error' ? 'alert' : 'status'}>{copyState === 'error' ? 'Copy is unavailable. Select the link below or choose a sharing service.' : copyState === 'copied' ? 'Link copied. Thanks for spreading the word.' : 'Thanks for sharing Consumit.'}</p> : null}
        {copyState === 'error' ? <input aria-label="Consumit link to share" className="mt-2 h-11 w-full rounded-control border border-[var(--fs-line)] bg-[var(--fs-field)] px-3 text-center text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--fs-focus)]" onFocus={event => event.currentTarget.select()} readOnly value={shareUrl} /> : null}
      </div>
      <Button className="mt-5 min-h-11 w-full border border-[var(--fs-line)]" onClick={() => dismiss()} variant="secondary">Start exploring</Button>
      {guidePending ? <Button className="mt-2 min-h-11 w-full" onClick={() => dismiss(true)} variant="ghost">Personalize my experience</Button> : null}
    </div>
  </dialog></>
}
