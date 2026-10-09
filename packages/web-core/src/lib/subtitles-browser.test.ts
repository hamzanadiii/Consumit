import { afterEach, describe, expect, it, vi } from 'vitest'
import { discoverSubtitles, pageSubtitles, prepareSubtitle } from './subtitles-browser'

const ref = { kind: 'movie' as const, id: 550 }
const signal = new AbortController().signal
const searchId = 'f702c893-0757-4fc5-85f2-7d0527c2b2c8'
afterEach(() => vi.unstubAllGlobals())

describe('subtitle response boundaries', () => {
  it('reads fragmented discovery events and a final line without a newline', async () => {
    const event = { type: 'complete', searchId, languages: [{ code: 'ar', count: 2 }] }
    const text = JSON.stringify(event)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new ReadableStream({
      start(controller) { const encoder = new TextEncoder(); controller.enqueue(encoder.encode(text.slice(0, 20))); controller.enqueue(encoder.encode(text.slice(20))); controller.close() },
    }))))
    const received = vi.fn()
    await discoverSubtitles(ref, signal, received)
    expect(received).toHaveBeenCalledExactlyOnceWith(event)
  })
  it.each([
    `${JSON.stringify({ type: 'complete', searchId, languages: [{ code: 'ar', count: -1 }] })}\n`,
    'x'.repeat(262145),
  ])('rejects malformed or oversized streams and releases the reader', async (text) => {
    const cancel = vi.fn()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode(text)) }, cancel,
    }))))
    const received = vi.fn()
    await expect(discoverSubtitles(ref, signal, received)).rejects.toThrow()
    expect(received).not.toHaveBeenCalled()
    expect(cancel).toHaveBeenCalledOnce()
  })
  it('rejects invalid pages and unvalidated prepared tracks', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ tracks: {}, total: 1, nextCursor: null })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'one', label: 'English', language: 'en', url: 'javascript:alert(1)' }))))
    await expect(pageSubtitles(searchId, 'en', 0, [], signal)).rejects.toThrow('could not be loaded')
    await expect(prepareSubtitle(searchId, 'one', signal)).rejects.toThrow('Choose another track')
  })
  it('reports a truncated discovery instead of leaving the player checking forever', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ type: 'snapshot', searchId, languages: [] }))))
    await expect(discoverSubtitles(ref, signal, vi.fn())).rejects.toThrow('stopped before finishing')
  })
})
