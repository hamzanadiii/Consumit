import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { createProviderHttp } from './provider-http.ts'
import type { MediaTransport } from './transport.ts'

describe('bounded provider HTTP', () => {
  it('exposes bounded media scopes only on explicitly configured discovery transports', async () => {
    const transport=vi.fn<MediaTransport>(async url=>({status:200,url,headers:new Headers(),body:Readable.from(['media'])}))
    expect(createProviderHttp(['provider.example'],transport).mediaScope).toBeUndefined()
    const http=createProviderHttp(['provider.example'],transport,true),scope=http.mediaScope!(['rotating.example'])
    await scope('https://rotating.example/part.ts',{},new AbortController().signal,{readPrefixBytes:8})
    expect(transport.mock.calls[0]?.[1]).toEqual(['rotating.example'])
    expect(()=>http.mediaScope!(Array(9).fill('rotating.example'))).toThrow()
    expect(()=>http.mediaScope!(['*.example'])).toThrow()
    expect(scope.mediaScope).toBeUndefined()
  })
  it('preserves binary control envelopes and caps request bytes for binary and Unicode bodies', async () => {
    const bytes = Buffer.from([0, 255, 128, 1])
    const transport = vi.fn<MediaTransport>(async url => ({ status: 200, url, headers: new Headers(), body: Readable.from([bytes]) }))
    const http = createProviderHttp(['provider.example'], transport)
    const signal = new AbortController().signal
    const response = await http('https://provider.example/g', {}, signal, { method: 'POST', body: bytes })
    expect(response.bytes).toEqual(bytes)
    expect(transport.mock.calls[0]?.[4]).toEqual({ method: 'POST', body: bytes })
    await expect(http('https://provider.example/g', {}, signal, { method: 'POST', body: new Uint8Array(65_537) })).rejects.toThrow('limit')
    await expect(http('https://provider.example/g', {}, signal, { method: 'POST', body: 'é'.repeat(32_769) })).rejects.toThrow('limit')
    expect(transport).toHaveBeenCalledTimes(1)
  })
  it('applies destination policy and bounds streamed documents without content-length', async () => {
    const body = Readable.from([Buffer.alloc(700000), Buffer.alloc(700000)])
    const transport = vi.fn<MediaTransport>(async (url) => ({ status: 200, url, headers: new Headers(), body }))
    const http = createProviderHttp(['provider.example'], transport)
    await expect(http('https://provider.example/api', {}, new AbortController().signal)).rejects.toThrow('limit')
    expect(body.destroyed).toBe(true)
    expect(transport.mock.calls[0]?.[1]).toEqual(['provider.example'])
  })
  it('forwards the configured media host patterns to the transport gate and defaults to none', async () => {
    const patterns = [/^hls[0-9]*\.cdnvideo11\.shop$/i]
    const transport = vi.fn<MediaTransport>(async url => ({ status: 200, url, headers: new Headers(), body: Readable.from(['media']) }))
    const signal = new AbortController().signal
    await createProviderHttp(['sub.cdnvideo11.shop'], transport, false, patterns)('https://hls03.cdnvideo11.shop/master.m3u8', {}, signal)
    expect(transport.mock.calls[0]?.[5]).toEqual(patterns)
    await createProviderHttp(['sub.cdnvideo11.shop'], transport)('https://sub.cdnvideo11.shop/sub.srt', {}, signal)
    expect(transport.mock.calls[1]?.[5]).toEqual([])
    const scoped = createProviderHttp(['provider.example'], transport, true, patterns)
    await scoped.mediaScope!(['rotating.example'])('https://rotating.example/part.ts', {}, signal)
    expect(transport.mock.calls[2]?.[5]).toEqual([])
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
