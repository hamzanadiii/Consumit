import { afterEach, describe, expect, it, vi } from 'vitest'

import { playbackRequest } from './playback-browser'

afterEach(() => vi.unstubAllGlobals())

const input = { ref: { kind: 'movie' as const, id: 1 }, capabilities: { native: true, hls: true, dash: false, nativeHls: false, maxHeight: 1080 }, audioLanguage: 'original' }

describe('playback browser request', () => {
  it('retries a proxy reset once during initial resolution', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('Internal Server Error', { status: 500 }))
      .mockResolvedValueOnce(Response.json({ id: 'invalid-on-purpose' }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(playbackRequest('resolve', input, new AbortController().signal)).rejects.toThrow('invalid source')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not replay stateful recovery or structured API failures', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('Internal Server Error', { status: 500 }))
    vi.stubGlobal('fetch', fetchMock)
    await expect(playbackRequest('session/fallback', input, new AbortController().signal)).rejects.toThrow('temporarily unavailable')
    expect(fetchMock).toHaveBeenCalledTimes(1)
    fetchMock.mockResolvedValue(Response.json({ error: { code: 'INTERNAL', message: 'API failed', requestId: 'fixture-id', retryable: true } }, { status: 500 }))
    await expect(playbackRequest('resolve', input, new AbortController().signal)).rejects.toThrow('API failed')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
