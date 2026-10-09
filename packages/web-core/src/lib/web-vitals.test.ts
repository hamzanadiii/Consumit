import { describe, expect, it, vi } from 'vitest'
import { sendWebVital, webVitalPageForPath } from './web-vitals'

describe('anonymous Web Vitals reporting', () => {
  it('maps private and public routes into bounded groups', () => {
    expect(webVitalPageForPath('/')).toBe('home')
    expect(webVitalPageForPath('/watch/movie/123')).toBe('watch')
    expect(webVitalPageForPath('/title/123')).toBe('title')
    expect(webVitalPageForPath('/someone_private')).toBe('profile')
    expect(webVitalPageForPath('/library/history')).toBe('member')
  })

  it('sends only metric, route group, and value without blocking navigation', () => {
    const send = vi.fn().mockResolvedValue(new Response(null, { status: 202 }))
    sendWebVital({ metric: 'INP', page: 'catalog', value: 120 }, send)
    expect(send).toHaveBeenCalledWith('/v1/telemetry/web-vitals', expect.objectContaining({
      credentials: 'omit', keepalive: true, method: 'POST',
      body: JSON.stringify({ events: [{ metric: 'INP', page: 'catalog', value: 120 }] }),
    }))
  })
})
