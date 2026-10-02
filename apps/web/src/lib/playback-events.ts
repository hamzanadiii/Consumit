import type { PlaybackEvents } from '@consumit/contracts'

type BrowserFamily = NonNullable<PlaybackEvents['events'][number]['browser']>

function browserFamily(): BrowserFamily {
  const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent
  if (/edg\//i.test(userAgent)) return 'edge'
  if (/firefox\//i.test(userAgent)) return 'firefox'
  if (/chrome\//i.test(userAgent) || /crios\//i.test(userAgent)) return 'chrome'
  if (/safari\//i.test(userAgent)) return 'safari'
  return 'other'
}

/** Telemetry is bounded, disposable, and never blocks watching. */
export function createPlaybackEvents(id: string, send?: (events: PlaybackEvents) => void) {
  let pending: PlaybackEvents['events'] = []
  const browser = browserFamily()
  const flush = () => {
    if (!pending.length) return
    const events = pending.splice(0, 20)
    if (send) send({ events })
    else void fetch(`/v1/playback/${id}/events`, { method: 'POST', credentials: 'same-origin',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ events }),
      keepalive: true, signal: AbortSignal.timeout(3000),
    }).catch(() => undefined)
  }
  const timer = setInterval(flush, 5000)
  return {
    push(event: PlaybackEvents['events'][number]) { if (pending.length < 20) pending.push({ ...event, browser }) },
    close() { clearInterval(timer); flush(); pending = [] },
  }
}
