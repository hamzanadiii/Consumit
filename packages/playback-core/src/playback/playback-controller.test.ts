import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPlaybackController } from './playback-controller'
import type { EngineEvents, MediaEngine } from './media-engine'

const source = { type: 'native' as const, src: 'https://media.example/one.mp4' }
function media() {
  const video = document.createElement('video')
  Object.defineProperty(video, 'duration', { configurable: true, value: 100 })
  Object.defineProperty(video, 'readyState', { configurable: true, value: 1 })
  video.play = vi.fn().mockResolvedValue(undefined)
  return video
}
function engine(): MediaEngine { return { destroy: vi.fn(), recover: vi.fn(() => false), quality: vi.fn(), audio: vi.fn(), subtitle: vi.fn() } }
afterEach(() => { vi.useRealTimers(); localStorage.clear() })
describe('playback controller', () => {
  it('bounds a seek that never receives media while preserving the destination', async () => {
    vi.useFakeTimers()
    const video = media(), fatal = vi.fn()
    Object.defineProperty(video, 'paused', { configurable: true, value: false })
    Object.defineProperty(video, 'seeking', { configurable: true, value: true })
    const controller = createPlaybackController(video, { change: vi.fn(), fatal }, async () => engine())
    await controller.load(source)
    video.dispatchEvent(new Event('playing'))
    video.currentTime = 42
    video.dispatchEvent(new Event('seeking'))
    video.dispatchEvent(new Event('waiting'))
    await vi.advanceTimersByTimeAsync(8000)
    expect(fatal).toHaveBeenCalledExactlyOnceWith('network', 'timeout')
    expect(video.currentTime).toBe(42)
    controller.destroy()
  })
  it('leaves a paused seek alone and cancels the watchdog when playback resumes', async () => {
    vi.useFakeTimers()
    const video = media(), fatal = vi.fn()
    const controller = createPlaybackController(video, { change: vi.fn(), fatal }, async () => engine())
    await controller.load(source)
    video.dispatchEvent(new Event('playing'))
    video.dispatchEvent(new Event('pause'))
    video.dispatchEvent(new Event('seeking'))
    await vi.advanceTimersByTimeAsync(10000)
    expect(fatal).not.toHaveBeenCalled()
    Object.defineProperty(video, 'paused', { configurable: true, value: false })
    video.dispatchEvent(new Event('seeking'))
    await vi.advanceTimersByTimeAsync(3000)
    video.dispatchEvent(new Event('playing'))
    await vi.advanceTimersByTimeAsync(10000)
    expect(fatal).not.toHaveBeenCalled()
    controller.destroy()
  })
  it('recovers when an attached source never supplies metadata', async () => {
    vi.useFakeTimers()
    const fatal = vi.fn()
    const controller = createPlaybackController(media(), { change: vi.fn(), fatal }, async () => engine())
    await controller.load(source)
    await vi.advanceTimersByTimeAsync(12_000)
    expect(fatal).toHaveBeenCalledWith('network', 'timeout')
    controller.destroy()
  })
  it('keeps a blocked autoplay in the gesture state without a startup timeout', async () => {
    vi.useFakeTimers()
    const video = media()
    video.play = vi.fn().mockRejectedValue(new DOMException('Gesture required', 'NotAllowedError'))
    const fatal = vi.fn(), change = vi.fn()
    const controller = createPlaybackController(video, { change, fatal }, async () => engine())
    await controller.load(source)
    video.dispatchEvent(new Event('loadedmetadata'))
    await vi.advanceTimersByTimeAsync(0)
    await controller.play()
    await vi.advanceTimersByTimeAsync(13_000)
    expect(change).toHaveBeenLastCalledWith(expect.objectContaining({ needsGesture: true }))
    expect(fatal).not.toHaveBeenCalled()
    controller.destroy()
  })
  it('recovers when metadata arrives but first playback never starts', async () => {
    vi.useFakeTimers()
    const video = media(), fatal = vi.fn()
    const controller = createPlaybackController(video, { change: vi.fn(), fatal }, async () => engine())
    await controller.load(source, 0, true)
    video.dispatchEvent(new Event('loadedmetadata'))
    await vi.advanceTimersByTimeAsync(12_000)
    expect(fatal).toHaveBeenCalledWith('network', 'timeout')
    controller.destroy()
  })
  it('cancels the startup timeout when playback starts', async () => {
    vi.useFakeTimers()
    const video = media(), fatal = vi.fn()
    const controller = createPlaybackController(video, { change: vi.fn(), fatal }, async () => engine())
    await controller.load(source, 0, true)
    video.dispatchEvent(new Event('loadedmetadata'))
    video.dispatchEvent(new Event('playing'))
    await vi.advanceTimersByTimeAsync(13_000)
    expect(fatal).not.toHaveBeenCalled()
    controller.destroy()
  })
  it('selects English from real tracks and preserves an explicit Off preference across sources', async () => {
    const adapter = engine()
    const controller = createPlaybackController(media(), { change: vi.fn(), fatal: vi.fn() }, async (_video, _source, events) => {
      events.tracks({ qualities: [], audio: [], subtitles: [{ value: '0', label: 'French', language: 'fr' }, { value: '1', label: 'English', language: 'en' }] })
      return adapter
    })
    await controller.load(source)
    expect(adapter.subtitle).toHaveBeenLastCalledWith('1')
    controller.subtitle('off')
    await controller.load({ ...source, src: 'https://media.example/renewed.mp4' })
    expect(adapter.subtitle).toHaveBeenLastCalledWith('off')
    controller.destroy()
  })
  it('fails a stalled engine attachment and destroys it if it arrives after the deadline', async () => {
    vi.useFakeTimers()
    const adapter = engine(); const fatal = vi.fn()
    let finish: (engine: MediaEngine) => void = () => undefined
    const controller = createPlaybackController(media(), { change: vi.fn(), fatal }, () => new Promise((resolve) => { finish = resolve }))
    const loaded = controller.load(source)
    await vi.advanceTimersByTimeAsync(8000)
    await loaded
    expect(fatal).toHaveBeenCalledOnce()
    finish(adapter)
    await Promise.resolve()
    expect(adapter.destroy).toHaveBeenCalledOnce()
    controller.destroy()
  })
  it('restores position and play intent, and maps real quality/audio actions', async () => {
    const video = media(); const adapter = engine()
    const controller = createPlaybackController(video, { change: vi.fn(), fatal: vi.fn() }, async (_video, _source, events) => {
      events.tracks({ qualities: [{ value: 'auto', label: 'Auto' }, { value: '0', label: '720p' }], audio: [{ value: '0', label: 'Original' }], subtitles: [] })
      return adapter
    })
    await controller.load(source, 42, true)
    expect(video.currentTime).toBe(0)
    video.dispatchEvent(new Event('loadedmetadata'))
    expect(video.currentTime).toBe(42)
    video.currentTime = 0
    video.dispatchEvent(new Event('canplay'))
    expect(video.currentTime).toBe(42)
    expect(video.play).toHaveBeenCalledTimes(1)
    controller.quality('0'); controller.audio('0')
    expect(adapter.quality).toHaveBeenCalledWith('0')
    expect(adapter.audio).toHaveBeenCalledWith('0')
    controller.quality('fake')
    expect(adapter.quality).toHaveBeenCalledTimes(1)
    controller.destroy()
    expect(adapter.destroy).toHaveBeenCalledOnce()
  })
  it('preserves the selected playback rate across a source replacement', async () => {
    const video = media()
    const adapter = engine()
    adapter.destroy = vi.fn(() => { video.playbackRate = 1 })
    const controller = createPlaybackController(video, { change: vi.fn(), fatal: vi.fn() }, async () => adapter)
    await controller.load(source)
    video.playbackRate = 0.75
    controller.setPlaybackRate(0.75)
    await controller.load({ ...source, src: 'https://media.example/renewed.mp4' })
    expect(video.playbackRate).toBe(1)
    video.dispatchEvent(new Event('loadedmetadata'))
    expect(video.playbackRate).toBe(0.75)
    video.playbackRate = 1
    video.dispatchEvent(new Event('canplay'))
    expect(video.playbackRate).toBe(0.75)
    controller.destroy()
  })
  it('restores a position WebKit resets just after new media becomes playable', async () => {
    vi.useFakeTimers()
    const video = media()
    const controller = createPlaybackController(video, { change: vi.fn(), fatal: vi.fn() }, async () => engine())
    await controller.load(source, 42, false)
    video.dispatchEvent(new Event('loadedmetadata'))
    video.dispatchEvent(new Event('canplay'))
    video.currentTime = 0
    await vi.advanceTimersByTimeAsync(500)
    expect(video.currentTime).toBe(42)
    controller.destroy()
  })
  it('does not overwrite a member seek while delayed restoration checks are pending', async () => {
    vi.useFakeTimers()
    const video = media()
    const controller = createPlaybackController(video, { change: vi.fn(), fatal: vi.fn() }, async () => engine())
    await controller.load(source, 42, false)
    video.dispatchEvent(new Event('loadedmetadata'))
    video.dispatchEvent(new Event('canplay'))
    video.currentTime = 12
    await vi.advanceTimersByTimeAsync(1500)
    expect(video.currentTime).toBe(12)
    controller.destroy()
  })
  it('turns autoplay rejection into a ready state requiring a gesture', async () => {
    const video = media(); video.play = vi.fn().mockRejectedValue(new DOMException('gesture required', 'NotAllowedError'))
    const change = vi.fn(); const fatal = vi.fn()
    const controller = createPlaybackController(video, { change, fatal }, async () => engine())
    await controller.load(source)
    await controller.play()
    expect(change).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'ready', needsGesture: true }))
    expect(fatal).not.toHaveBeenCalled()
    controller.destroy()
  })
  it('bounds engine recovery before asking the application for a fallback', async () => {
    vi.useFakeTimers()
    const adapter = engine(); adapter.recover = vi.fn(() => true)
    let events: EngineEvents | undefined
    const fatal = vi.fn()
    const controller = createPlaybackController(media(), { change: vi.fn(), fatal }, async (_video, _source, callbacks) => { events = callbacks; return adapter })
    await controller.load(source)
    events?.fatal('network')
    expect(adapter.recover).toHaveBeenCalledOnce()
    expect(fatal).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(3000)
    expect(fatal).toHaveBeenCalledOnce()
    events?.fatal('network')
    expect(fatal).toHaveBeenCalledOnce()
    controller.destroy()
  })
  it('does not fail a waiting stream while its playback position keeps advancing', async () => {
    vi.useFakeTimers()
    const video = media()
    Object.defineProperty(video, 'paused', { configurable: true, value: false })
    const fatal = vi.fn()
    const controller = createPlaybackController(video, { change: vi.fn(), fatal }, async () => engine())
    await controller.load(source)
    video.dispatchEvent(new Event('waiting'))
    for (let position = 1; position <= 5; position++) {
      await vi.advanceTimersByTimeAsync(2000)
      video.currentTime = position
      video.dispatchEvent(new Event('timeupdate'))
    }
    expect(fatal).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(8000)
    expect(fatal).toHaveBeenCalledWith('network', 'timeout')
    controller.destroy()
  })
  it('reports a declined recovery immediately without waiting', async () => {
    vi.useFakeTimers()
    const adapter = engine()
    let events: EngineEvents | undefined
    const fatal = vi.fn()
    const controller = createPlaybackController(media(), { change: vi.fn(), fatal }, async (_video, _source, callbacks) => { events = callbacks; return adapter })
    await controller.load(source)
    events?.fatal('gone')
    // A definitive Gone skips in-place recovery and asks the application to switch.
    expect(adapter.recover).not.toHaveBeenCalled()
    expect(fatal).toHaveBeenCalledOnce()
    expect(fatal).toHaveBeenCalledWith('gone', undefined)
    controller.destroy()
  })
  it('leaves external subtitles to the merged list instead of the load', async () => {
    const video = media(); const adapter = engine()
    const change = vi.fn()
    const controller = createPlaybackController(video, { change, fatal: vi.fn() }, async (_video, _source, events) => {
      events.tracks({ qualities: [], audio: [], subtitles: [] })
      return adapter
    })
    // Source loads carry no tracks by themselves; the caller merges the
    // source tracks with every aggregated extra track in one call.
    await controller.load({ ...source, subtitles: [{ id: 'a', label: 'A', language: 'en', url: 'https://media.example/a.vtt' }] })
    expect(video.querySelectorAll('track')).toHaveLength(0)
    controller.externalSubtitles([
      { id: 'a', label: 'A', language: 'en', url: 'https://media.example/a.vtt' },
      { id: 'b', label: 'B', language: 'fr', url: 'https://media.example/b.vtt' },
    ])
    expect(video.querySelectorAll('track')).toHaveLength(2)
    expect(change).toHaveBeenLastCalledWith(expect.objectContaining({ subtitles: expect.arrayContaining([
      expect.objectContaining({ value: 'external:consumit-external-a' }),
      expect.objectContaining({ value: 'external:consumit-external-b' }),
    ]) }))
    // The current selection survives when still offered...
    controller.subtitle('external:consumit-external-a')
    controller.externalSubtitles([{ id: 'b', label: 'B', language: 'fr', url: 'https://media.example/b.vtt' }])
    expect(video.querySelectorAll('track')).toHaveLength(1)
    // ...and falls back to the language preference when it disappears.
    expect(change).toHaveBeenLastCalledWith(expect.objectContaining({ subtitleTrack: 'off' }))
    controller.destroy()
  })
  it('keeps the shared subtitle menu across source switches', async () => {
    const video = media(); const adapter = engine()
    const change = vi.fn()
    const controller = createPlaybackController(video, { change, fatal: vi.fn() }, async (_video, _source, events) => {
      events.tracks({ qualities: [], audio: [], subtitles: [] })
      return adapter
    })
    await controller.load(source)
    const shared = [
      { id: 'server-a-en', label: 'English (server-a)', language: 'en', url: 'https://media.example/a-en.vtt' },
      { id: 'yify-en', label: 'English (yify)', language: 'en', url: 'https://subs.example/yify-en.vtt' },
    ]
    controller.externalSubtitles(shared)
    expect(video.querySelectorAll('track')).toHaveLength(2)
    controller.subtitle('external:consumit-external-yify-en')
    // Switching servers reloads media but must never wipe the menu: the
    // caller re-passes the merged list and the film-picked track survives.
    await controller.load({ ...source, src: 'https://media.example/two.mp4' })
    controller.externalSubtitles(shared)
    expect(video.querySelectorAll('track')).toHaveLength(2)
    expect(change).toHaveBeenLastCalledWith(expect.objectContaining({ subtitleTrack: 'external:consumit-external-yify-en' }))
    controller.destroy()
  })
  it('accepts same-origin served subtitle files over plain http', async () => {
    const video = media(); const adapter = engine()
    const change = vi.fn()
    const controller = createPlaybackController(video, { change, fatal: vi.fn() }, async (_video, _source, events) => {
      events.tracks({ qualities: [], audio: [], subtitles: [] })
      return adapter
    })
    await controller.load(source)
    const host = window.location.hostname
    controller.externalSubtitles([
      { id: 'served', label: 'English (yify)', language: 'en', url: `http://${host}/v1/subtitles/file/abc123` },
    ])
    expect(video.querySelectorAll('track')).toHaveLength(1)
    expect(change).toHaveBeenLastCalledWith(expect.objectContaining({ subtitles: expect.arrayContaining([
      expect.objectContaining({ value: 'external:consumit-external-served' }),
    ]) }))
    controller.destroy()
  })
  it('disposes late attachments and never lets old loads replace a newer source', async () => {
    const first = engine(); const second = engine()
    let finish: (value: MediaEngine) => void = () => undefined
    const attach = vi.fn().mockImplementationOnce(() => new Promise<MediaEngine>((resolve) => { finish = resolve })).mockResolvedValueOnce(second)
    const controller = createPlaybackController(media(), { change: vi.fn(), fatal: vi.fn() }, attach)
    const old = controller.load(source)
    await Promise.resolve(); await Promise.resolve()
    const fresh = controller.load({ ...source, src: 'https://media.example/two.mp4' })
    finish(first)
    await Promise.all([old, fresh])
    expect(first.destroy).toHaveBeenCalledOnce()
    expect(second.destroy).not.toHaveBeenCalled()
    controller.destroy()
    expect(second.destroy).toHaveBeenCalledOnce()
  })
})
