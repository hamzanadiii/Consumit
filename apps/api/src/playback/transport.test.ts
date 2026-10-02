import { EventEmitter } from 'node:events'
import { Readable } from 'node:stream'
import type { IncomingMessage } from 'node:http'
import type { RequestOptions } from 'node:https'
import { gzipSync } from 'node:zlib'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }))
vi.mock('node:dns/promises', () => ({ lookup: mocks.lookup }))
vi.mock('node:https', () => ({ request: mocks.request }))
import { createMediaTransport } from './transport.ts'
let fetchMedia = createMediaTransport()

beforeEach(() => {
  vi.clearAllMocks()
  fetchMedia = createMediaTransport()
  mocks.lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }])
})
function response(status = 200, headers: Record<string, string> = { 'content-type': 'video/mp4' }) {
  return (_url: URL, _options: RequestOptions, callback: (value: IncomingMessage) => void) => {
    const request = Object.assign(new EventEmitter(), {
      setTimeout: vi.fn(), destroy: vi.fn(),
      end() { queueMicrotask(() => callback(Object.assign(Readable.from(['media']), { statusCode: status, headers }) as IncomingMessage)) },
    })
    return request
  }
}
describe('provider network boundary', () => {
  it('shares one DNS lookup across concurrent callers without sharing cancellation', async () => {
    let answer!: (addresses: { address: string; family: number }[]) => void
    mocks.lookup.mockImplementation(() => new Promise((resolve) => { answer = resolve }))
    mocks.request.mockImplementation(response())
    const controller = new AbortController()
    const abandoned = fetchMedia('https://media.example/a', ['media.example'], {}, controller.signal).catch((error: Error) => error.message)
    const active = fetchMedia('https://media.example/b', ['media.example'], {}, new AbortController().signal)
    controller.abort(new Error('Member left'))
    expect(await abandoned).toBe('Member left')
    answer([{ address: '8.8.8.8', family: 4 }])
    const resolved = await active
    expect(mocks.lookup).toHaveBeenCalledOnce()
    expect(mocks.request).toHaveBeenCalledOnce()
    resolved.body.destroy()
  })
  it('cancels DNS immediately when the caller leaves, without opening a socket', async () => {
    mocks.lookup.mockImplementation(() => new Promise(() => {}))
    const controller = new AbortController()
    const pending = fetchMedia('https://media.example/a', ['media.example'], {}, controller.signal)
    controller.abort(new Error('Member left'))
    const result = await Promise.race([pending.catch((error: Error) => error.message), new Promise((resolve) => setTimeout(() => resolve('still waiting'), 50))])
    expect(result).toBe('Member left')
    expect(mocks.request).not.toHaveBeenCalled()
  })
  it('rejects a hostname resolving to any private address before opening a socket', async () => {
    mocks.lookup.mockResolvedValue([{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }])
    await expect(fetchMedia('https://media.example/a', ['media.example'], {}, new AbortController().signal)).rejects.toThrow('Blocked media address')
    expect(mocks.request).not.toHaveBeenCalled()
  })
  it('pins validated DNS and strips credentials on an allowlisted cross-host redirect', async () => {
    mocks.request.mockImplementationOnce(response(302, { location: 'https://cdn.example/video' })).mockImplementationOnce(response())
    const result = await fetchMedia('https://media.example/a', ['media.example', 'cdn.example'], { Authorization: 'fixture', Cookie: 'fixture', Range: 'bytes=0-3' }, new AbortController().signal)
    expect(mocks.lookup).toHaveBeenCalledTimes(2)
    const options = mocks.request.mock.calls[1]![1] as RequestOptions
    expect(options.headers).toMatchObject({ Range: 'bytes=0-3' })
    expect(options.headers).not.toHaveProperty('Authorization')
    expect(options.headers).not.toHaveProperty('Cookie')
    expect(options.lookup).toBeTypeOf('function')
    result.body.destroy()
  })
  it('revalidates redirect destinations and stops off-allowlist hosts', async () => {
    mocks.request.mockImplementationOnce(response(302, { location: 'https://internal.example/secret' }))
    await expect(fetchMedia('https://media.example/a', ['media.example'], {}, new AbortController().signal)).rejects.toThrow('Blocked media destination')
    expect(mocks.request).toHaveBeenCalledOnce()
  })
  it('does not resolve DNS for cancelled requests or URLs with user information', async () => {
    const controller = new AbortController(); controller.abort()
    await expect(fetchMedia('https://media.example/a', ['media.example'], {}, controller.signal)).rejects.toThrow()
    await expect(fetchMedia('https://user:password@media.example/a', ['media.example'], {}, new AbortController().signal)).rejects.toThrow()
    expect(mocks.lookup).not.toHaveBeenCalled()
  })
  it('decodes gzip documents and strips transport framing headers', async () => {
    const compressed = gzipSync('media')
    mocks.request.mockImplementation((_url: URL, _options: RequestOptions, callback: (value: IncomingMessage) => void) => {
      const request = Object.assign(new EventEmitter(), {
        setTimeout: vi.fn(), destroy: vi.fn(),
        end() { queueMicrotask(() => callback(Object.assign(Readable.from([compressed]), { statusCode: 200, headers: { 'content-type': 'application/json', 'content-encoding': 'gzip', 'content-length': String(compressed.length) } }) as IncomingMessage)) },
      })
      return request
    })
    const result = await fetchMedia('https://media.example/a', ['media.example'], {}, new AbortController().signal)
    const chunks: Buffer[] = []
    for await (const chunk of result.body) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
    expect(Buffer.concat(chunks).toString('utf8')).toBe('media')
    expect(result.headers.get('content-encoding')).toBeNull()
    expect(result.headers.get('content-length')).toBeNull()
    result.body.destroy()
  })
  it('rejects unknown content codings instead of handing over opaque bytes', async () => {
    mocks.request.mockImplementationOnce(response(200, { 'content-type': 'application/json', 'content-encoding': 'zstd' }))
    await expect(fetchMedia('https://media.example/a', ['media.example'], {}, new AbortController().signal)).rejects.toThrow('Unsupported provider document encoding')
  })
})
