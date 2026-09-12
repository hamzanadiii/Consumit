import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { createProviderHttp } from './provider-http.ts'
import type { MediaTransport } from './transport.ts'

describe('bounded provider HTTP', () => {
  it('applies destination policy and bounds streamed documents without content-length', async () => {
    const body = Readable.from([Buffer.alloc(700000), Buffer.alloc(700000)])
    const transport = vi.fn<MediaTransport>(async (url) => ({ status: 200, url, headers: new Headers(), body }))
    const http = createProviderHttp(['provider.example'], transport)
    await expect(http('https://provider.example/api', {}, new AbortController().signal)).rejects.toThrow('limit')
    expect(body.destroyed).toBe(true)
    expect(transport.mock.calls[0]?.[1]).toEqual(['provider.example'])
  })
  it('cancels stalled document bodies and releases the upstream stream', async () => {
    const body = new Readable({ read() {} })
    const http = createProviderHttp(['provider.example'], async (url) => ({ status: 200, url, headers: new Headers(), body }))
    const controller = new AbortController()
    const pending = http('https://provider.example/api', {}, controller.signal)
    await new Promise((resolve) => setImmediate(resolve))
    controller.abort()
    await expect(pending).rejects.toThrow('cancelled')
    expect(body.destroyed).toBe(true)
  })
})
