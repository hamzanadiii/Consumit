export type AnalyticsChoice = 'accepted' | 'declined'
export const ANALYTICS_CHOICE_KEY = 'consumit.analytics.choice.v1'
export const ANALYTICS_CHOICE_EVENT = 'consumit:analytics-choice'

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

export function analyticsReferrer(value: string): string {
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) ? url.origin : ''
  } catch { return '' }
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
