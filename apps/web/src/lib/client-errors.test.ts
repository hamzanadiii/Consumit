import { afterEach, describe, expect, it, vi } from 'vitest'
import { observeClientErrors } from './client-errors'
afterEach(() => vi.restoreAllMocks())
describe('browser error projection', () => {
  it('never sends exception details, private paths, cookies, or source credentials', () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(new Response())
    const target = document.createElement('iframe').contentWindow ?? new EventTarget()
    const stop = observeClientErrors('/profile/private-person', target as Window, send)
    target.dispatchEvent(new ErrorEvent('error', { error: new TypeError('https://media.example/?secret=credential') }))
    expect(send).toHaveBeenCalledOnce()
    const request = send.mock.calls[0]?.[1]
    expect(request?.credentials).toBe('omit')
    expect(JSON.parse(String(request?.body))).toEqual({ events: [{ page: 'profile', kind: 'error', name: 'TypeError' }] })
    stop(); target.dispatchEvent(new ErrorEvent('error', { error: new Error('more') })); expect(send).toHaveBeenCalledOnce()
  })
})
