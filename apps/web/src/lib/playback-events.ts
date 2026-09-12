import type { PlaybackEvents } from '@consumit/contracts'

/** Telemetry is bounded, disposable, and never blocks watching. */
export function createPlaybackEvents(id: string) {
  let pending: PlaybackEvents['events'] = []
  const flush = () => {
    if (!pending.length) return
    const events = pending.splice(0, 20)
    void fetch(`/v1/playback/${id}/events`, { method: 'POST', credentials: 'same-origin',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify({ events }),
      keepalive: true, signal: AbortSignal.timeout(3000),
    }).catch(() => undefined)
  }
  const timer = setInterval(flush, 5000)
  return {
    push(event: PlaybackEvents['events'][number]) { if (pending.length < 20) pending.push(event) },
    close() { clearInterval(timer); flush(); pending = [] },
  }
}
