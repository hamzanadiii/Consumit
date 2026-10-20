import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFrameDiagnostics, createProviderFrameEvents } from './provider-frame-events'

afterEach(() => vi.useRealTimers())
const src = 'https://embed.vidrift.net/embed/movie/550'
function fixture() {
  const frame = document.createElement('iframe'); document.body.append(frame)
  const report = vi.fn(); let at = 0
  const adapter = createProviderFrameEvents({ src, providerId: 'vidriftframe', ref: { kind: 'movie', id: 550 }, frameWindow: () => frame.contentWindow, report, now: () => at })
  const data = { type: 'vidrift:unpaused', tmdbId: 550, mediaType: 'movie', anilist: null, currentTime: 0 }
  return { adapter, frame, report, data, time(value: number) { at = value }, receive(override = {}) { adapter.receive({ origin: 'https://embed.vidrift.net', source: frame.contentWindow, data, ...override }) } }
}
describe('reviewed external frame boundary', () => {
  it('accepts an exact immediate frame identity and emits only normalized status', () => {
    const f = fixture(); f.receive()
    expect(f.report).toHaveBeenCalledExactlyOnceWith({ type: 'playing' })
  })
  it('rejects wrong origin, nested/unrelated windows and unsupported identity', () => {
    const f = fixture()
    f.receive({ origin: 'https://embed.vidrift.net.evil.test' }); f.receive({ source: window }); f.receive({ source: null })
    for (const data of [{ ...f.data, tmdbId: 551 }, { ...f.data, anilist: 550 }, { ...f.data, mediaType: 'tv' }, { ...f.data, episode: 1 }]) f.receive({ data })
    expect(f.report).not.toHaveBeenCalled()
  })
  it('rejects strings, oversized, unknown and nonfinite messages', () => {
    const f = fixture()
    for (const data of [JSON.stringify(f.data), null, { ...f.data, extra: true }, { ...f.data, currentTime: Infinity }, { ...f.data, type: 'vidrift:wont-play', reason: 'x'.repeat(2000) }, { ...f.data, type: 'vidrift:nextup-play' }]) f.receive({ data })
    expect(f.report).not.toHaveBeenCalled()
  })
  it('binds exact series season and episode and rejects unsupported sources/anime', () => {
    const f = fixture()
    const adapter = createProviderFrameEvents({ src: 'https://embed.vidrift.net/embed/tv/100/2/3', providerId: 'vidriftframe', ref: { kind: 'series', id: 100, season: 2, episode: 3 }, frameWindow: () => f.frame.contentWindow, report: f.report })
    const event = { origin: 'https://embed.vidrift.net', source: f.frame.contentWindow, data: { ...f.data, tmdbId: '100', mediaType: 'tv', season: 2, episode: 4 } }
    adapter.receive(event); expect(f.report).not.toHaveBeenCalled()
    adapter.receive({ ...event, data: { ...event.data, episode: 3 } }); expect(f.report).toHaveBeenCalledOnce()
    f.report.mockClear()
    for (const providerId of ['vixsrcframe', 'other']) createProviderFrameEvents({ src, providerId, ref: { kind: 'movie', id: 550 }, frameWindow: () => f.frame.contentWindow, report: f.report }).receive({ ...event, data: f.data })
    createProviderFrameEvents({ src, providerId: 'vidriftframe', ref: { kind: 'anime', id: 550, episode: 1 }, frameWindow: () => f.frame.contentWindow, report: f.report }).receive({ ...event, data: f.data })
    expect(f.report).not.toHaveBeenCalled()
  })
  it('caps flooding, requires monotonic finite samples and closes stale instances', () => {
    const f = fixture(); f.receive(); f.receive()
    for (let i = 1; i < 30; i++) { f.time(i * 500); f.receive() }
    expect(f.report).toHaveBeenCalledTimes(20)
    f.time(60_000); f.receive(); expect(f.report).toHaveBeenCalledTimes(21)
    f.adapter.close(); f.time(61_000); f.receive(); expect(f.report).toHaveBeenCalledTimes(21)
  })
  it('drops impossible and regressing provider progress without writing it anywhere', () => {
    const f = fixture(); const data = { ...f.data, type: 'vidrift:progress', currentTime: 10, duration: 100 }
    f.receive({ data }); f.time(1000); f.receive({ data: { ...data, currentTime: 9 } }); f.receive({ data: { ...data, currentTime: 101 } })
    expect(f.report).toHaveBeenCalledExactlyOnceWith({ type: 'progress' })
  })
  it('bounds batches and discards pending reports on source change', () => {
    vi.useFakeTimers(); const send = vi.fn(); const queue = createFrameDiagnostics('session', 'source', send)
    for (let i = 0; i < 30; i++) queue.push({ type: 'playing' })
    vi.advanceTimersByTime(5000)
    expect(send).toHaveBeenCalledOnce(); expect(send.mock.calls[0]![0].events).toHaveLength(20)
    queue.push({ type: 'paused' }); queue.close(); vi.advanceTimersByTime(5000)
    expect(send).toHaveBeenCalledOnce()
  })
})
