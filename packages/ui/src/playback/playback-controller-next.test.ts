import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPlaybackControllerNext } from './playback-controller-next'
import type { EngineEvents, MediaEngine } from './media-engine'

const source = { type: 'native' as const, src: 'https://media.example/one.mp4' }
function videoElement() {
  const video = document.createElement('video')
  Object.defineProperty(video, 'duration', { configurable: true, value: 100 })
  video.play = vi.fn().mockResolvedValue(undefined)
  return video
}
function engine(): MediaEngine {
  return { destroy: vi.fn(), recover: vi.fn(() => false), quality: vi.fn(), audio: vi.fn(), subtitle: vi.fn() }
}
afterEach(() => { vi.useRealTimers(); localStorage.clear() })

describe('next playback controller', () => {
  it('bounds a seek that never receives media while preserving the destination', async () => {
    vi.useFakeTimers()
    const video = videoElement(), fatal = vi.fn()
    Object.defineProperty(video, 'paused', { configurable: true, value: false })
    Object.defineProperty(video, 'seeking', { configurable: true, value: true })
    const controller = createPlaybackControllerNext(video, { change: vi.fn(), fatal }, async () => engine())
    await controller.load(source)
    video.dispatchEvent(new Event('playing'))
    video.currentTime = 42
    video.dispatchEvent(new Event('seeking'))
    video.dispatchEvent(new Event('waiting'))
    await vi.advanceTimersByTimeAsync(30_000)
    expect(fatal).toHaveBeenCalledExactlyOnceWith('network', 'timeout')
    expect(video.currentTime).toBe(42)
    controller.destroy()
  })
  it('lets a slow seek finish inside the seek budget without failing', async () => {
    vi.useFakeTimers()
    const video = videoElement(), fatal = vi.fn()
    Object.defineProperty(video, 'paused', { configurable: true, value: false })
    Object.defineProperty(video, 'seeking', { configurable: true, value: true })
    const controller = createPlaybackControllerNext(video, { change: vi.fn(), fatal }, async () => engine())
    await controller.load(source)
    video.dispatchEvent(new Event('playing'))
    video.currentTime = 42
    video.dispatchEvent(new Event('seeking'))
    video.dispatchEvent(new Event('waiting'))
    await vi.advanceTimersByTimeAsync(12_000)
    expect(fatal).not.toHaveBeenCalled()
    Object.defineProperty(video, 'seeking', { configurable: true, value: false })
    video.dispatchEvent(new Event('seeked'))
    video.currentTime = 43
    video.dispatchEvent(new Event('timeupdate'))
    video.dispatchEvent(new Event('playing'))
    await vi.advanceTimersByTimeAsync(5000)
    expect(fatal).not.toHaveBeenCalled()
    controller.destroy()
  })
  it('preserves the selected playback rate across a source replacement', async () => {
    const video = videoElement()
    const adapter = engine()
    adapter.destroy = vi.fn(() => { video.playbackRate = 1 })
    const controller = createPlaybackControllerNext(video, { change: vi.fn(), fatal: vi.fn() }, async () => adapter)
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

  it('restores a paused position after source replacement and does not overwrite a later seek', async () => {
    vi.useFakeTimers()
    const video = videoElement()
    const controller = createPlaybackControllerNext(video, { change: vi.fn(), fatal: vi.fn() }, async () => engine())
    await controller.load(source, 42, false)
    video.dispatchEvent(new Event('loadedmetadata'))
    expect(video.currentTime).toBe(42)
    video.currentTime = 0
    video.dispatchEvent(new Event('canplay'))
    await vi.advanceTimersByTimeAsync(500)
    expect(video.currentTime).toBe(42)
    video.currentTime = 12
    await vi.advanceTimersByTimeAsync(1500)
    expect(video.currentTime).toBe(12)
    expect(video.play).not.toHaveBeenCalled()
    controller.destroy()
  })

  it('disposes a late attachment after a newer source wins', async () => {
    const first = engine(), second = engine()
    let finish: (value: MediaEngine) => void = () => undefined
    const attach = vi.fn().mockImplementationOnce(() => new Promise<MediaEngine>((resolve) => { finish = resolve })).mockResolvedValueOnce(second)
    const controller = createPlaybackControllerNext(videoElement(), { change: vi.fn(), fatal: vi.fn() }, attach)
    const stale = controller.load(source)
    const fresh = controller.load({ ...source, src: 'https://media.example/two.mp4' })
    finish(first)
    await Promise.all([stale, fresh])
    expect(first.destroy).toHaveBeenCalledOnce()
    expect(second.destroy).not.toHaveBeenCalled()
    controller.destroy()
    expect(second.destroy).toHaveBeenCalledOnce()
  })

  it('asks the session coordinator to replace a gone source immediately', async () => {
    const fatal = vi.fn(), adapter = engine()
    let events: EngineEvents | undefined
    const controller = createPlaybackControllerNext(videoElement(), { change: vi.fn(), fatal }, async (_video, _source, callbacks) => { events = callbacks; return adapter })
    await controller.load(source)
    events?.fatal('gone')
    expect(adapter.recover).not.toHaveBeenCalled()
    expect(fatal).toHaveBeenCalledExactlyOnceWith('gone', undefined)
    controller.destroy()
  })

  it('keeps a failed source failed when late media events arrive', async () => {
    const video = videoElement(), change = vi.fn(), fatal = vi.fn(), event = vi.fn()
    let engineEvents: EngineEvents | undefined
    const controller = createPlaybackControllerNext(video, { change, fatal, event }, async (_video, _source, callbacks) => {
      engineEvents = callbacks
      return engine()
    })
    await controller.load(source, 42, true)
    engineEvents?.fatal('gone')
    expect(fatal).toHaveBeenCalledExactlyOnceWith('gone', undefined)
    const updatesAtFailure = change.mock.calls.length
    video.dispatchEvent(new Event('loadedmetadata'))
    video.dispatchEvent(new Event('canplay'))
    video.dispatchEvent(new Event('playing'))
    video.dispatchEvent(new Event('ended'))
    expect(change).toHaveBeenCalledTimes(updatesAtFailure)
    expect(change).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'failed' }))
    expect(event).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'started' }))
    controller.destroy()
  })

  it('retains an external caption choice across source changes', async () => {
    const video = videoElement(), change = vi.fn()
    const controller = createPlaybackControllerNext(video, { change, fatal: vi.fn() }, async () => engine())
    const subtitles = [{ id: 'english', label: 'English', language: 'en', url: 'https://subs.example/english.vtt' }]
    await controller.load(source)
    controller.externalSubtitles(subtitles)
    controller.subtitle('external:consumit-external-english')
    await controller.load({ ...source, src: 'https://media.example/two.mp4' })
    controller.externalSubtitles(subtitles)
    expect(change).toHaveBeenLastCalledWith(expect.objectContaining({ subtitleTrack: 'external:consumit-external-english' }))
    expect(video.querySelectorAll('track')).toHaveLength(1)
    controller.destroy()
  })

  it('bounds a stalled attachment and disposes the engine when it arrives later', async () => {
    vi.useFakeTimers()
    const fatal = vi.fn(), adapter = engine()
    let finish: (value: MediaEngine) => void = () => undefined
    const controller = createPlaybackControllerNext(videoElement(), { change: vi.fn(), fatal }, () => new Promise((resolve) => { finish = resolve }))
    const loaded = controller.load(source)
    await vi.advanceTimersByTimeAsync(8_000)
    await loaded
    expect(fatal).toHaveBeenCalledExactlyOnceWith('network', 'timeout')
    finish(adapter)
    await Promise.resolve()
    expect(adapter.destroy).toHaveBeenCalledOnce()
    controller.destroy()
  })

  it('fails a source that accepts play but never reaches its first frame', async () => {
    vi.useFakeTimers()
    const fatal = vi.fn()
    const controller = createPlaybackControllerNext(videoElement(), { change: vi.fn(), fatal }, async () => engine())
    await controller.load(source)
    await controller.play()
    await vi.advanceTimersByTimeAsync(12_000)
    expect(fatal).toHaveBeenCalledExactlyOnceWith('network', 'timeout')
    controller.destroy()
  })

  it('reports viewer startup only after a decoded video frame', async () => {
    const video = videoElement(), event = vi.fn()
    let frame: (() => void) | undefined
    Object.defineProperty(video, 'requestVideoFrameCallback', { value: (callback: () => void) => { frame = callback; return 1 } })
    const controller = createPlaybackControllerNext(video, { change: vi.fn(), fatal: vi.fn(), event }, async () => engine())
    await controller.load(source, 0, true)
    video.dispatchEvent(new Event('loadedmetadata'))
    video.dispatchEvent(new Event('playing'))
    expect(event).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'started' }))
    frame?.()
    expect(event).toHaveBeenCalledWith(expect.objectContaining({ type: 'started' }))
    controller.destroy()
  })

  it('fails a source that never supplies metadata', async () => {
    vi.useFakeTimers()
    const fatal = vi.fn()
    const controller = createPlaybackControllerNext(videoElement(), { change: vi.fn(), fatal }, async () => engine())
    await controller.load(source, 0, false)
    await vi.advanceTimersByTimeAsync(12_000)
    expect(fatal).toHaveBeenCalledExactlyOnceWith('network', 'timeout')
    controller.destroy()
  })
})
