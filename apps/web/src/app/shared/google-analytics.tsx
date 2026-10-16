'use client'

import { useEffect, useRef, useSyncExternalStore } from 'react'
import Script from 'next/script'
import { usePathname } from 'next/navigation'
import { Button } from '@consumit/ui'
import {
  analyticsMeasurementId, analyticsPage, analyticsPromptEnabled, analyticsReferrer, clearAnalyticsCookies,
  effectiveAnalyticsChoice, readAnalyticsChoice, saveAnalyticsChoice, subscribeAnalyticsChoice, type AnalyticsWindow,
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
  const initialized = useRef(false)
  const lastPage = useRef<string | null>(null)
  const permitted = Boolean(id && page && effectiveAnalyticsChoice(choice) === 'accepted')

  useEffect(() => {
    if (!id) return
    const browser = window as AnalyticsWindow
    browser[`ga-disable-${id}`] = !permitted
    if (!permitted || !pagePath) {
      lastPage.current = null
      if (choice === 'declined') clearAnalyticsCookies()
      return
    }
    browser.dataLayer ??= []
    browser.gtag ??= function () {
      // Google's command queue expects the documented Arguments shape.
      // eslint-disable-next-line prefer-rest-params
      browser.dataLayer!.push(arguments)
    }
    const parameters = {
      page_location: `${window.location.origin}${pagePath}`, page_title: `Consumit · ${pageTitle}`,
      page_referrer: analyticsReferrer(document.referrer),
    }
    if (!initialized.current) {
      browser.gtag('consent', 'default', {
        analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
      })
      browser.gtag('consent', 'update', { analytics_storage: 'granted' })
      browser.gtag('js', new Date())
      browser.gtag('config', id, {
        send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false,
        cookie_domain: 'none', cookie_expires: 15_552_000,
        ...parameters,
      })
      initialized.current = true
    }
    browser.gtag('consent', 'update', { analytics_storage: 'granted' })
    browser.gtag('set', parameters)
    if (lastPage.current === pathname) return
    browser.gtag('event', 'page_view', {
      send_to: id, ...parameters,
    })
    lastPage.current = pathname
  }, [id, permitted, pagePath, pageTitle, pathname, choice])

  if (!id || !page) return null
  return (
    <>
      {permitted ? <Script id="consumit-google-analytics" src={`https://www.googletagmanager.com/gtag/js?id=${id}`} strategy="afterInteractive" /> : null}
      {analyticsPromptEnabled() && choice === null ? (
        <section aria-label="Optional analytics" className="fixed inset-x-0 bottom-0 z-[100] border-t border-separator bg-surface px-5 pt-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-copy">
          <div className="mx-auto flex max-w-6xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-[65ch]">
              <h2 className="font-display text-xl text-ink">Help improve Consumit</h2>
              <p className="mt-2 text-sm leading-6">Allow Google Analytics cookies to measure visits to public browsing pages. Your private library and watch history stay out of analytics. <a className="text-orange underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-orange" href="/privacy#privacy-analytics">Privacy details</a></p>
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
