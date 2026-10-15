import { describe, it, expect, vi } from 'vitest'
import { authorizedInternal, createInternalClient } from './internal'
const secret = 'fixture-internal-service-secret-32-bytes'
describe('private application interface', () => {
  it('requires the exact bearer secret and rejects missing or malformed credentials', () => {
    expect(authorizedInternal(`Bearer ${secret}`, secret)).toBe(true)
    for (const value of [undefined, secret, `Bearer ${secret}x`, `Basic ${secret}`]) expect(authorizedInternal(value, secret)).toBe(false)
  })
  it('rejects paths, credentials, and non-HTTP origins before making a request', () => {
    for (const origin of ['not-a-url', 'https://api.example/path', 'https://name:password@api.example', 'file:///tmp']) expect(() => createInternalClient({ origin, secret })).toThrow()
  })
  it('bounds responses and refuses arbitrary URL operations', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('x'.repeat(1025)))
    const call = createInternalClient({ origin: 'https://api.example', secret }, fetcher)
    await expect(call('https://other.example', {})).rejects.toThrow('Invalid internal operation')
    expect(fetcher).not.toHaveBeenCalled()
    await expect(call('/v1/internal/playback/config', {}, { maximumBytes: 1024 })).rejects.toThrow('exceeded')
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ redirect: 'error', credentials: 'omit' })
  })
})
