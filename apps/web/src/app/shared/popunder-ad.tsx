'use client'

import { useEffect } from 'react'
import { useAdStatus } from './ad-status'

/** Publisher-supplied Adsterra pop-under tag already used by Consumit. */
const POPUNDER_SCRIPT = 'https://pl29474263.profitableratecpmnetwork.com/a9/92/22/a9922243a391df320bd9848954d045e6.js'
const STORAGE_KEY = 'consumit.ads.popunders'
const MAX_POPUNDERS_PER_WINDOW = 4
const WINDOW_MS = 30 * 60 * 1000
const MIN_GAP_MS = 5 * 60 * 1000
const LOCK_NAME = 'consumit.ads.popunders.rate-limit'

function recentPopunders(now: number): number[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    const cutoff = now - WINDOW_MS
    return parsed.filter((entry): entry is number => typeof entry === 'number' && Number.isFinite(entry) && entry > cutoff)
  } catch {
    return []
  }
}

let injectedThisDocument = false

function claimAndInject() {
  if (injectedThisDocument || document.querySelector('script[data-ad-popunder]')) return

  const now = Date.now()
  const recent = recentPopunders(now).sort((a, b) => a - b)
  const last = recent.at(-1)
  if (recent.length >= MAX_POPUNDERS_PER_WINDOW || (last !== undefined && now - last < MIN_GAP_MS)) return

  injectedThisDocument = true
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...recent, now]))
  } catch { /* Browsing remains available when device storage is blocked. */ }

  const script = document.createElement('script')
  script.src = POPUNDER_SCRIPT
  script.async = true
  script.dataset.adPopunder = ''
  document.head.appendChild(script)
}

/**
 * Loads the existing publisher tag on public browse surfaces, with a maximum
 * of four injections per rolling thirty minutes and at least five minutes between
 * injections on this device. Private, playback, settings and admin surfaces
 * do not mount this component.
 */
export function PopunderAd() {
  const { ready, enabled } = useAdStatus()

  useEffect(() => {
    if (!ready || !enabled || injectedThisDocument) return

    // Serialize tabs so two simultaneous route loads cannot spend the same
    // remaining interval and open pop-unders together. Older browsers fail
    // closed to the same local rate checks in this tab.
    const locks = navigator.locks
    if (locks) {
      void locks.request(LOCK_NAME, () => claimAndInject()).catch(() => { /* Do not bypass a failed cross-tab lock. */ })
      return
    }
    claimAndInject()
  }, [ready, enabled])

  return null
}
