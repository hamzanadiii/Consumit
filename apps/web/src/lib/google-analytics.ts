export type AnalyticsChoice = 'accepted' | 'declined'
export const ANALYTICS_CHOICE_KEY = 'consumit.analytics.choice.v1'
export const ANALYTICS_CHOICE_EVENT = 'consumit:analytics-choice'
export const ANALYTICS_TAG_REQUEST_EVENT = 'consumit:analytics-tag-request'

export type ConsumitAnalyticsEvent =
  | { name: 'title_opened' }
  | { name: 'playback_started' | 'playback_30s'; playerType: 'html5' | 'cast' }
  | { name: 'sign_up'; method?: 'email' | 'google' }

export function analyticsMeasurementId(value: string | undefined): string | null {
  return value && /^G-[A-Z0-9]+$/.test(value) ? value : null
}

/** Only the exact value `off` hides the consent prompt; unset or any other value keeps it. */
export function analyticsPromptEnabled(): boolean {
  return process.env.NEXT_PUBLIC_GA_PROMPT !== 'off'
}

/** With the prompt hidden, an unset device choice behaves as accepted until explicitly declined. */
export function effectiveAnalyticsChoice(choice: AnalyticsChoice | null): AnalyticsChoice | null {
  return analyticsPromptEnabled() ? choice : choice ?? 'accepted'
}

/** Explicit public surfaces only; unknown and member routes fail closed. */
export function analyticsPage(pathname: string): { path: string; title: string } | null {
  const fixed: Record<string, string> = {
    '/': 'Home', '/movies': 'Movies', '/series': 'Series', '/anime': 'Anime',
    '/search': 'Search', '/about': 'About', '/help': 'Help', '/terms': 'Terms',
    '/privacy': 'Privacy', '/dmca': 'DMCA',
  }
  if (fixed[pathname]) return { path: pathname, title: fixed[pathname] }
  if (/^\/title\/\d+$/.test(pathname)) return { path: '/title', title: 'Title' }
  if (/^\/series\/\d+$/.test(pathname)) return { path: '/series/title', title: 'Series title' }
  if (/^\/anime\/\d+$/.test(pathname)) return { path: '/anime/title', title: 'Anime title' }
  return null
}

function analyticsContentType(pathname: string): 'movie' | 'series' | 'anime' | null {
  if (/^\/title\/\d+$/.test(pathname)) return 'movie'
  if (/^\/series\/\d+$/.test(pathname)) return 'series'
  if (/^\/anime\/\d+$/.test(pathname)) return 'anime'
  return null
}

export function analyticsReferrer(value: string): string {
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) ? url.origin : ''
  } catch { return '' }
}

function eventContext(event: ConsumitAnalyticsEvent, pathname: string): {
  page: { path: string; title: string }
  parameters: Record<string, string>
} | null {
  if (event.name === 'title_opened') {
    const contentType = analyticsContentType(pathname)
    const page = analyticsPage(pathname)
    return contentType && page ? { page, parameters: { content_type: contentType } } : null
  }
  if (event.name === 'playback_started' || event.name === 'playback_30s') {
    const contentType = /^\/watch\/(movie|series|anime)\/\d+(?:\/|$)/.exec(pathname)?.[1]
    return contentType ? {
      page: { path: '/watch', title: 'Watch' },
      parameters: { content_type: contentType, player_type: event.playerType },
    } : null
  }
  if (event.name !== 'sign_up') return null
  return pathname === '/sign-up' || pathname === '/sign-up/google'
    ? { page: { path: '/sign-up', title: 'Sign up' }, parameters: { method: event.method ?? 'email' } }
    : null
}

function queueGoogleTag(browser: AnalyticsWindow) {
  browser.dataLayer ??= []
  browser.gtag ??= function () {
    // Google's command queue expects the documented Arguments shape.
    // eslint-disable-next-line prefer-rest-params
    browser.dataLayer!.push(arguments)
  }
}

function googleTagConfigured(browser: AnalyticsWindow, id: string): boolean {
  return browser.dataLayer?.some((entry) => {
    if (!entry || typeof entry !== 'object' || !('length' in entry)) return false
    const command = Array.from(entry as ArrayLike<unknown>)
    return command[0] === 'config' && command[1] === id
  }) ?? false
}

function analyticsPageParameters(page: { path: string; title: string }) {
  return {
    page_location: `${window.location.origin}${page.path}`,
    page_title: `Consumit · ${page.title}`,
    page_referrer: analyticsReferrer(document.referrer),
  }
}

export function initializeAnalyticsTag(browser: AnalyticsWindow, id: string, parameters: {
  page_location: string; page_title: string; page_referrer: string
}) {
  queueGoogleTag(browser)
  if (!googleTagConfigured(browser, id)) {
    browser.gtag!('consent', 'default', {
      analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
    })
    browser.gtag!('consent', 'update', { analytics_storage: 'granted' })
    browser.gtag!('js', new Date())
    browser.gtag!('config', id, {
      send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false,
      cookie_domain: 'none', cookie_expires: 15_552_000,
      ...parameters,
    })
  } else {
    browser.gtag!('consent', 'update', { analytics_storage: 'granted' })
  }
  browser.gtag!('set', parameters)
}

let pendingAnalyticsEvents = 0

export function hasPendingAnalyticsEvents(): boolean {
  return pendingAnalyticsEvents > 0
}

/** Send only the four explicitly approved events, with route-derived low-cardinality parameters. */
export function trackConsumitAnalytics(event: ConsumitAnalyticsEvent, pathname?: string): boolean {
  if (typeof window === 'undefined') return false
  const id = analyticsMeasurementId(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID)
  if (!id || effectiveAnalyticsChoice(readAnalyticsChoice()) !== 'accepted') return false
  const currentPath = pathname ?? window.location.pathname
  const context = eventContext(event, currentPath)
  if (!context) return false

  const browser = window as AnalyticsWindow
  const disabledKey = `ga-disable-${id}` as const
  const contextParameters = analyticsPageParameters(context.page)
  initializeAnalyticsTag(browser, id, contextParameters)
  browser[disabledKey] = false

  pendingAnalyticsEvents += 1
  let finished = false
  const finish = () => {
    if (finished) return
    finished = true
    pendingAnalyticsEvents = Math.max(0, pendingAnalyticsEvents - 1)
    const accepted = effectiveAnalyticsChoice(readAnalyticsChoice()) === 'accepted'
    browser[disabledKey] = !accepted || !analyticsPage(window.location.pathname)
  }
  browser.gtag!('event', event.name, {
    send_to: id,
    ...context.parameters,
    event_timeout: 5000,
    event_callback: finish,
  })
  window.setTimeout(finish, 6000)
  window.dispatchEvent(new Event(ANALYTICS_TAG_REQUEST_EVENT))
  return true
}

let memoryChoice: AnalyticsChoice | null = null

export function readAnalyticsChoice(): AnalyticsChoice | null {
  try {
    const value = window.localStorage.getItem(ANALYTICS_CHOICE_KEY)
    return value === 'accepted' || value === 'declined' ? value : null
  } catch { return memoryChoice }
}

export function saveAnalyticsChoice(choice: AnalyticsChoice): void {
  memoryChoice = choice
  try { window.localStorage.setItem(ANALYTICS_CHOICE_KEY, choice) } catch { /* This visit only. */ }
  window.dispatchEvent(new Event(ANALYTICS_CHOICE_EVENT))
}

export function subscribeAnalyticsChoice(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === ANALYTICS_CHOICE_KEY || event.key === null) listener()
  }
  window.addEventListener('storage', onStorage)
  window.addEventListener(ANALYTICS_CHOICE_EVENT, listener)
  return () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener(ANALYTICS_CHOICE_EVENT, listener)
  }
}

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
    [key: `ga-disable-${string}`]: boolean | undefined
  }
}
export type AnalyticsWindow = Window

export function clearAnalyticsCookies(): void {
  // cookie_domain: 'none' keeps our analytics cookies on this host.
  for (const cookie of document.cookie.split(';')) {
    const name = cookie.split('=')[0]?.trim()
    if (name && /^_ga(?:_|$)/.test(name)) document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax`
  }
}
