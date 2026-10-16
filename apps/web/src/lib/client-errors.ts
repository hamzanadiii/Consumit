import { webVitalPageForPath } from './web-vitals'
import { clientErrorNames } from '@consumit/contracts'
const names: ReadonlySet<string> = new Set(clientErrorNames)
export function observeClientErrors(pathname: string, target: Window = window, send: typeof fetch = fetch) {
  if (pathname.startsWith('/_internal/')) return () => {}
  let count = 0, windowStart = Date.now()
  const report = (kind: 'error' | 'promise', error: unknown) => {
    if (Date.now() - windowStart > 60000) { count = 0; windowStart = Date.now() }
    if (++count > 10) return
    const name = error instanceof Error && names.has(error.name) ? error.name : 'Unknown'
    void send('/v1/telemetry/client-errors', { method: 'POST', credentials: 'omit', keepalive: true, headers: { 'content-type': 'application/json' }, body: JSON.stringify({ events: [{ page: webVitalPageForPath(pathname), kind, name }] }) }).catch(() => undefined)
  }
  const failure = (event: ErrorEvent) => report('error', event.error), rejection = (event: PromiseRejectionEvent) => report('promise', event.reason)
  target.addEventListener('error', failure); target.addEventListener('unhandledrejection', rejection)
  return () => { target.removeEventListener('error', failure); target.removeEventListener('unhandledrejection', rejection) }
}
