import { usernameSchema, type WebVitalEvent } from '@consumit/contracts'

export type WebVitalPage = WebVitalEvent['page']

const startsWithRoute = (path: string, route: string) => path === route || path.startsWith(`${route}/`)

/** Collapse member-specific routes into a small, privacy-safe metric label. */
export function webVitalPageForPath(pathname: string): WebVitalPage {
  if (pathname === '/') return 'home'
  if (startsWithRoute(pathname, '/watch')) return 'watch'
  if (startsWithRoute(pathname, '/embed')) return 'embed'
  if (startsWithRoute(pathname, '/title')) return 'title'
  if (startsWithRoute(pathname, '/movies') || startsWithRoute(pathname, '/search')) return 'catalog'
  if (['/series', '/anime'].some((route) => startsWithRoute(pathname, route))) {
    return pathname === '/series' || pathname === '/anime' ? 'catalog' : 'title'
  }
  if (startsWithRoute(pathname, '/profile')) return 'profile'
  if (startsWithRoute(pathname, '/lists')) return 'member'
  if (['/library', '/settings', '/admin', '/imports'].some((route) => startsWithRoute(pathname, route))) return 'member'
  if (['/sign-in', '/sign-up', '/verify-email', '/forgot-password', '/reset-password', '/onboarding'].some((route) => startsWithRoute(pathname, route))) return 'auth'
  if (['/help', '/support', '/report-issue', '/api'].some((route) => startsWithRoute(pathname, route))) return 'support'
  // Public profiles use /:username. Emit only the shared group, never that path.
  if (/^\/[^/]+$/.test(pathname) && usernameSchema.safeParse(pathname.slice(1)).success) return 'profile'
  return 'other'
}

export function sendWebVital(event: WebVitalEvent, send: typeof fetch = fetch): void {
  void send('/v1/telemetry/web-vitals', {
    method: 'POST',
    credentials: 'omit',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ events: [event] }),
    keepalive: true,
  }).catch(() => undefined)
}
