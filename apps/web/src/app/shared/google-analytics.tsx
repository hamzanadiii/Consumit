'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import Script from 'next/script'
import { usePathname } from 'next/navigation'
import { Button } from '@consumit/ui'
import {
  analyticsMeasurementId, analyticsPage, analyticsPromptEnabled, analyticsReferrer, clearAnalyticsCookies,
  effectiveAnalyticsChoice, hasPendingAnalyticsEvents, initializeAnalyticsTag, readAnalyticsChoice, saveAnalyticsChoice,
  subscribeAnalyticsChoice, trackConsumitAnalytics, ANALYTICS_TAG_REQUEST_EVENT, type AnalyticsWindow,
} from '@/lib/google-analytics'

const serverChoice = () => null

function useAnalyticsChoice() {
  return useSyncExternalStore(subscribeAnalyticsChoice, readAnalyticsChoice, serverChoice)
}

export function AnalyticsPreferences() {
  const choice = effectiveAnalyticsChoice(useAnalyticsChoice())
  if (!analyticsMeasurementId(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID)) return null
  return (
    <div className="space-y-3">
      <p role="status">Optional analytics: {choice === 'accepted' ? 'on' : 'off'} on this device.</p>
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" disabled={choice === 'declined'} onClick={() => saveAnalyticsChoice('declined')}>Decline analytics</Button>
        <Button variant="secondary" disabled={choice === 'accepted'} onClick={() => saveAnalyticsChoice('accepted')}>Allow analytics</Button>
      </div>
    </div>
  )
}

export function GoogleAnalytics({ measurementId }: { measurementId: string | undefined }) {
  const id = analyticsMeasurementId(measurementId)
  const pathname = usePathname() ?? ''
  const page = analyticsPage(pathname)
  const pagePath = page?.path
  const pageTitle = page?.title
  const choice = useAnalyticsChoice()
  const [eventTagRequested, setEventTagRequested] = useState(false)
  const lastPage = useRef<string | null>(null)
  const permitted = Boolean(id && page && effectiveAnalyticsChoice(choice) === 'accepted')
  const tagEnabled = Boolean(id && effectiveAnalyticsChoice(choice) === 'accepted' && (page || eventTagRequested))

  useEffect(() => {
    const requestTag = () => setEventTagRequested(true)
    window.addEventListener(ANALYTICS_TAG_REQUEST_EVENT, requestTag)
    return () => window.removeEventListener(ANALYTICS_TAG_REQUEST_EVENT, requestTag)
  }, [])

  useEffect(() => {
    if (!id) return
    const browser = window as AnalyticsWindow
    if (!permitted || !pagePath || !pageTitle) {
      lastPage.current = null
      if (effectiveAnalyticsChoice(choice) !== 'accepted' || !hasPendingAnalyticsEvents()) browser[`ga-disable-${id}`] = true
      if (choice === 'declined') clearAnalyticsCookies()
      return
    }
    browser[`ga-disable-${id}`] = false
    const parameters = {
      page_location: `${window.location.origin}${pagePath}`, page_title: `Consumit · ${pageTitle}`,
      page_referrer: analyticsReferrer(document.referrer),
    }
    initializeAnalyticsTag(browser, id, parameters)
    if (lastPage.current === pathname) return
    browser.gtag!('event', 'page_view', {
      send_to: id, ...parameters,
    })
    trackConsumitAnalytics({ name: 'title_opened' }, pathname)
    lastPage.current = pathname
  }, [id, permitted, pagePath, pageTitle, pathname, choice])

  if (!id) return null
  return (
    <>
      {tagEnabled ? <Script id="consumit-google-analytics" src={`https://www.googletagmanager.com/gtag/js?id=${id}`} strategy="afterInteractive" /> : null}
      {page && analyticsPromptEnabled() && choice === null ? (
        <section aria-label="Optional analytics" className="fixed inset-x-0 bottom-0 z-[100] border-t border-separator bg-surface px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-copy">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-[65ch]">
              <h2 className="font-display text-xl text-ink">Help improve Consumit</h2>
              <p className="mt-2 text-sm leading-6">Allow optional analytics to count public title opens, playback starts, 30 seconds of playback, and verified email sign-ups. No specific title, account identity, provider, or viewing position is sent. <a className="text-orange underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-orange" href="/privacy#privacy-analytics">Privacy details</a></p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button variant="secondary" onClick={() => saveAnalyticsChoice('declined')}>Decline analytics</Button>
              <Button variant="secondary" onClick={() => saveAnalyticsChoice('accepted')}>Allow analytics</Button>
            </div>
          </div>
        </section>
      ) : null}
    </>
  )
}
