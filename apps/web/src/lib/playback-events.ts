import type { PlaybackDelivery, PlaybackEvents } from '@consumit/contracts'

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
  let lastSample: { position: number; at: number; delivery: PlaybackDelivery } | undefined
  const viewing = { direct: 0, relay: 0 }
  const flush = () => {
    for (const delivery of ['direct', 'relay'] as const) {
      if (viewing[delivery] > 0 && pending.length < 20) {
        pending.push({ type: 'viewing', position: lastSample?.position ?? 0, elapsedMs: Math.min(viewing[delivery], 60_000), delivery, browser })
        viewing[delivery] = 0
      }
    }
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
    /** Count advancing local playback wall time; pauses, stalls and seeks do
     * not become viewing hours. Long background gaps are conservatively capped. */
    sample(position: number, playing: boolean, delivery: PlaybackDelivery, at = performance.now()) {
      if (delivery === 'embed') { lastSample = undefined; return }
      if (lastSample && playing && lastSample.delivery === delivery && position > lastSample.position && position - lastSample.position < 30) {
        viewing[delivery] += Math.max(0, Math.min(5000, at - lastSample.at))
      }
      lastSample = playing ? { position, at, delivery } : undefined
    },
    resetViewing() { lastSample = undefined },
    push(event: PlaybackEvents['events'][number]) { if (pending.length < 20) pending.push({ ...event, browser }) },
    close() { clearInterval(timer); flush(); pending = [] },
  }
}
