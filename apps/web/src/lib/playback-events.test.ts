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
})
