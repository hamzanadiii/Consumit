import { describe, expect, it, vi } from 'vitest'
import { attachMediaEngine } from './media-engine'

const handlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => void>())
vi.mock('hls.js', () => ({
  default: class {
    static isSupported = () => true
    static Events = { MANIFEST_PARSED: 'manifest', AUDIO_TRACKS_UPDATED: 'audio', SUBTITLE_TRACKS_UPDATED: 'subs', ERROR: 'error' }
    static ErrorTypes = { MEDIA_ERROR: 'media' }
    levels: unknown[] = []
    audioTracks: unknown[] = []
    subtitleTracks: unknown[] = []
    subtitleTrack = -1
    subtitleDisplay = false
    autoLevelCapping = 0
    on = (event: string, callback: (...args: unknown[]) => void) => { handlers.set(event, callback) }
    loadSource() {}
    attachMedia() {}
    destroy() {}
    startLoad = vi.fn()
    recoverMediaError = vi.fn()
  },
}))

const source = { type: 'hls' as const, src: 'https://cdn.consumit.example/master.m3u8' }

describe('media engine native teardown', () => {
  it('empties a native engine without an intermediate empty load', async () => {
    const video = document.createElement('video')
    const load = vi.spyOn(video, 'load')
    const engine = await attachMediaEngine(
      video,
      { type: 'native', src: 'https://cdn.consumit.example/clip.mp4' },
      { tracks: vi.fn(), fatal: vi.fn() },
    )
    expect(video.getAttribute('src')).toBe('https://cdn.consumit.example/clip.mp4')
    engine.destroy()
    expect(video.hasAttribute('src')).toBe(false)
    expect(load).not.toHaveBeenCalled()
  })
})

describe('media engine hls errors', () => {
  it('maps a fatal 410 segment error to gone and declines in-place recovery', async () => {
    handlers.clear()
    const video = document.createElement('video')
    const fatal = vi.fn()
    const engine = await attachMediaEngine(video, source, { tracks: vi.fn(), fatal })
    handlers.get('error')?.('error', { fatal: true, type: 'other', response: { code: 410 } })
    expect(fatal).toHaveBeenCalledWith('gone', undefined)
    expect(engine.recover()).toBe(false)
    engine.destroy()
  })
  it('classifies a fatal 403 as a header delivery failure and skips futile in-place retry', async () => {
    handlers.clear()
    const video = document.createElement('video')
    const fatal = vi.fn()
    const engine = await attachMediaEngine(video, source, { tracks: vi.fn(), fatal })
    handlers.get('error')?.('error', { fatal: true, type: 'other', response: { code: 403 } })
    expect(fatal).toHaveBeenCalledWith('network', 'headers')
    expect(engine.recover()).toBe(false)
    engine.destroy()
  })
})
