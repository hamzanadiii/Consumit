'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@consumit/ui'
import { GUIDE_VERSION } from '@consumit/contracts'
import { useExperience } from './experience-provider'

export function WelcomeDialog({ pathname }: { pathname: string }) {
  const experience = useExperience()
  const router = useRouter()
  const dialog = useRef<HTMLDialogElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  const [dismissedOwner, setDismissedOwner] = useState<string | undefined>()
  const ownerKey = experience.owner ?? 'guest'
  const eligible = /^\/(?:$|movies(?:\/|$)|series(?:\/|$)|anime(?:\/|$)|title(?:\/|$)|search(?:\/|$))/.test(pathname)
  const visible = process.env.NEXT_PUBLIC_CONSUMIT_WELCOME_ENABLED === 'true' && eligible && experience.ready && dismissedOwner !== ownerKey
    && !(experience.preferences.guideVersion >= GUIDE_VERSION && experience.preferences.guideStatus !== 'pending')
  useEffect(() => {
    if (!visible || !dialog.current) return
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const element = dialog.current
    element.showModal()
    return () => { element.close(); returnFocus.current?.focus() }
  }, [visible])
  function dismiss(start = false) {
    setDismissedOwner(ownerKey)
    void experience.patch({ guideVersion: GUIDE_VERSION, guideStatus: 'dismissed' }).catch(() => { /* Dismissal remains on this device for retry from Settings. */ })
    if (start) {
      const next = `${window.location.pathname}${window.location.search}${window.location.hash}`
      router.push(`/onboarding?${new URLSearchParams({ next })}`)
    }
  }
  return <dialog ref={dialog} aria-labelledby="welcome-title" aria-describedby="welcome-description" className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-card border border-[var(--fs-field-border)] bg-[var(--fs-page)] p-6 text-[var(--fs-ink)] backdrop:bg-black/70 sm:p-8" onCancel={event => { event.preventDefault(); dismiss() }}>
    <h2 className="text-balance font-display text-3xl leading-tight sm:text-4xl" id="welcome-title">Welcome to Consumit.</h2><p className="mt-5 text-sm leading-7 text-[var(--fs-secondary)]" id="welcome-description">Set your audio and subtitle languages, choose a few Favorites, and make Watch feel like yours.</p><p className="mt-3 text-xs leading-6 text-[var(--fs-muted)]">A short setup. Every step is optional.</p><div className="mt-7 flex flex-wrap gap-3"><Button variant="accent" onClick={() => dismiss(true)}>Personalize my experience</Button><Button variant="ghost" onClick={() => dismiss()}>Skip for now</Button></div>
  </dialog>
}
