import { afterEach, describe, expect, it, vi } from 'vitest'
import { getCurrentMember, loginMember, IdentityApiError } from './identity-browser'

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('identity request boundaries', () => {
  it('times out a stalled account request with retryable recovery copy', async () => {
    vi.useFakeTimers()
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => reject(init.signal!.reason), { once: true })
    })))
    // AbortSignal.timeout uses the host timer rather than Vitest's fake clock.
    const deadline = new AbortController()
    vi.spyOn(AbortSignal, 'timeout').mockReturnValueOnce(deadline.signal)
    const result = loginMember({ email: 'member@example.com', password: 'a-secure-password' })
    const failure = expect(result).rejects.toMatchObject({ code: 'AUTH_STATE_UNAVAILABLE', retryable: true, message: expect.stringContaining('too long') })
    deadline.abort(new DOMException('Timeout', 'TimeoutError'))
    await failure
    vi.restoreAllMocks()
  })
  it('preserves caller cancellation without reporting a service outage', async () => {
    const controller = new AbortController()
    vi.stubGlobal('fetch', vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal!.addEventListener('abort', () => reject(init.signal!.reason), { once: true })
    })))
    const result = getCurrentMember(controller.signal)
    const failure = expect(result).rejects.toMatchObject({ name: 'AbortError' })
    controller.abort()
    await failure
  })
  it('rejects malformed success responses and retains server rate-limit errors', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('{}')).mockResolvedValueOnce(new Response(JSON.stringify({ error: {
      code: 'RATE_LIMITED', message: 'Wait before trying again.', requestId: 'request-1', retryable: true,
    } }), { status: 429 }))
    vi.stubGlobal('fetch', fetcher)
    await expect(getCurrentMember()).rejects.toBeInstanceOf(IdentityApiError)
    await expect(getCurrentMember()).rejects.toMatchObject({ status: 429, retryable: true, requestId: 'request-1' })
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ cache: 'no-store', credentials: 'same-origin', signal: expect.any(AbortSignal) })
  })
})
