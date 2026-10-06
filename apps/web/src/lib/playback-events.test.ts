import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPlaybackEvents } from './playback-events'

describe('playback client telemetry', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('sends only a bounded browser family, never the raw user agent', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 Chrome/125.0.0.0 Edg/125.0.0.0' })
    const send = vi.fn()
    const events = createPlaybackEvents('session', send)
    events.push({ type: 'started', position: 0, elapsedMs: 1250 })
    events.close()

    expect(send).toHaveBeenCalledWith({ events: [{ type: 'started', position: 0, elapsedMs: 1250, browser: 'edge' }] })
    expect(JSON.stringify(send.mock.calls)).not.toContain('Mozilla/5.0')
  })
  it('measures advancing wall time separately for direct and relay, excluding pauses, seeks and stalls', () => {
    const send = vi.fn()
    const events = createPlaybackEvents('session', send)
    events.sample(0, true, 'direct', 0)
    events.sample(2, true, 'direct', 1000) // 2x speed still counts one second.
    events.sample(2, true, 'direct', 2000) // Stall.
    events.sample(2, false, 'direct', 3000)
    events.sample(2, true, 'direct', 4000)
    events.resetViewing()
    events.sample(100, true, 'direct', 5000) // Seek establishes a new baseline.
    events.sample(101, true, 'relay', 6000) // Delivery switch.
    events.sample(102, true, 'relay', 7000)
    events.close()
    expect(send.mock.calls[0]![0].events).toEqual([
      expect.objectContaining({ type: 'viewing', delivery: 'direct', elapsedMs: 1000 }),
      expect.objectContaining({ type: 'viewing', delivery: 'relay', elapsedMs: 1000 }),
    ])
  })
})
