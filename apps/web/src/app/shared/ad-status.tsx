'use client'

import { useEffect, useRef, useState } from 'react'
import { Button, PreferenceRow, Toggle } from '@consumit/ui'
import { useOptionalExperience } from '../experience/experience-provider'

export const AD_CHOICE_KEY = 'consumit.ads.enabled'
const eventName = 'consumit:ad-choice'
function deviceChoice() { try { const value = localStorage.getItem(AD_CHOICE_KEY); return value === null ? null : value === 'true' } catch { return false } }
function removeLoadedAdvertisingByReload() {
  if (location.pathname.startsWith('/watch/')) return
  if (document.querySelector('script[data-ad-popunder]')) location.reload()
}
export function useAdStatus() {
  const experience = useOptionalExperience()
  const [choice, setChoice] = useState<boolean | null>(null)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    let active = true
    queueMicrotask(() => { if (active) { setChoice(deviceChoice()); setLoaded(true) } })
    const change = () => {
      setChoice(deviceChoice())
      if (deviceChoice() === false) removeLoadedAdvertisingByReload()
    }
    window.addEventListener('storage', change); window.addEventListener(eventName, change)
    return () => { active = false; window.removeEventListener('storage', change); window.removeEventListener(eventName, change) }
  }, [])
  const ready = loaded && Boolean(experience?.ready)
  const unresolvedAccount = experience?.error?.startsWith('Your account preferences could not load')
  const enabled = ready && !unresolvedAccount && experience?.preferences.adsEnabled === true && choice !== false
  useEffect(() => {
    if (ready && !enabled) removeLoadedAdvertisingByReload()
  }, [ready, enabled])
  async function setEnabled(next: boolean) {
    if (!experience || !ready) return
    setChoice(next)
    try { localStorage.setItem(AD_CHOICE_KEY, String(next)) } catch { /* Experience retains the choice for this visit. */ }
    const pending = experience.patch({ adsEnabled: next })
    window.dispatchEvent(new Event(eventName))
    await pending
  }
  return { ready, enabled, setEnabled, error: experience?.error, retry: experience?.retry }
}
export function AdStatus() {
  const ads = useAdStatus()
  const retryRef = useRef<HTMLButtonElement>(null)
  useEffect(() => { if (ads.error) retryRef.current?.focus() }, [ads.error])
  const label = ads.ready ? ads.enabled ? 'On' : 'Off' : 'Loading'
  return <div>
    <PreferenceRow label="Ad status" description="Pop-under ads are On by default. Turn them Off to stop advertising windows on this device. Your choice saves immediately and syncs when signed in."
      control={<div className="flex items-center gap-3"><span aria-live="polite" className="text-sm text-copy">{label}</span><Toggle checked={ads.enabled} disabled={!ads.ready} label={`Ad status: ${label}`} onCheckedChange={next => { void ads.setEnabled(next).catch(() => {}) }} /></div>} />
    <p className="max-w-prose pb-4 text-xs leading-5 text-muted">Pop-unders are limited to four per rolling 30 minutes, with at least five minutes between them. Turning ads Off stops new pop-unders; Watch keeps playing. Some external players may still show their own ads.</p>
    {ads.error ? <div className="flex flex-wrap items-center gap-2 pb-4 text-xs text-copy" role="status"><p>{ads.error}</p><Button aria-label="Retry ad preference sync" className="min-h-11 focus:ring-2 focus:ring-orange" onClick={() => { void ads.retry?.().catch(() => {}) }} ref={retryRef} size="sm" variant="secondary">Retry sync</Button></div> : null}
  </div>
}
