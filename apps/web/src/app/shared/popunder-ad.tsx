'use client'

import { useEffect } from 'react'

/** Owner-configured popunder network script (2026-10-10). */
const POPUNDER_SCRIPT = 'https://pl29474263.profitableratecpmnetwork.com/a9/92/22/a9922243a391df320bd9848954d045e6.js'
const STORAGE_KEY = 'consumit.ads.popunders'
const MAX_POPUNDERS_PER_HOUR = 2
const HOUR_MS = 60 * 60 * 1000

/** One script injection claims one popunder for the rolling hour: the network
 *  fires at most one popunder per injection, so counting injections at their
 *  start is the conservative bound — a blocked script may spend budget without
 *  showing a popup, but the member never sees more than two per hour. */
function recentPopunders(): number[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]')
    if (!Array.isArray(parsed)) return []
    const cutoff = Date.now() - HOUR_MS
    return parsed.filter((entry): entry is number => typeof entry === 'number' && Number.isFinite(entry) && entry > cutoff)
  } catch {
    return []
  }
}

let injectedThisDocument = false

/**
 * Loads the configured popunder script on browse surfaces at most twice per
 * rolling hour per device. Watch, authentication, onboarding, settings and
 * admin use reduced shells and never mount this component, so playback and
 * private work stay free of popunders.
 */
export function PopunderAd() {
  useEffect(() => {
    if (injectedThisDocument) return
    const recent = recentPopunders()
    if (recent.length >= MAX_POPUNDERS_PER_HOUR) return
    if (document.querySelector('script[data-ad-popunder]')) return
    injectedThisDocument = true
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...recent, Date.now()]))
    } catch { /* A blocked store never blocks browsing; the document guard still holds. */ }
    const script = document.createElement('script')
    script.src = POPUNDER_SCRIPT
    script.setAttribute('async', '')
    script.dataset.adPopunder = ''
    document.head.appendChild(script)
  }, [])

  return null
}
