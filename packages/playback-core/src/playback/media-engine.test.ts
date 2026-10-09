import { describe, expect, it, vi } from 'vitest'
import { attachMediaEngine, dedupeSnappedQualities, orderQualityOptions, snapQualityHeight } from './media-engine'

const handlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => void>())
const instances = vi.hoisted(() => [] as Array<{ levels: Array<{ height?: number; bitrate: number }> }>)
const startLoad = vi.hoisted(() => vi.fn())
vi.mock('hls.js', () => ({
  default: class {
    static isSupported = () => true
    static Events = { MANIFEST_PARSED: 'manifest', AUDIO_TRACKS_UPDATED: 'audio', SUBTITLE_TRACKS_UPDATED: 'subs', ERROR: 'error' }
    static ErrorTypes = { MEDIA_ERROR: 'media' }
    levels: Array<{ height?: number; bitrate: number }> = []
    audioTracks: unknown[] = []
    subtitleTracks: unknown[] = []
    subtitleTrack = -1
    subtitleDisplay = false
    autoLevelCapping = 0
    constructor() { instances.push(this) }
    on = (event: string, callback: (...args: unknown[]) => void) => { handlers.set(event, callback) }
    loadSource() {}
    attachMedia() {}
    destroy() {}
    startLoad = startLoad
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

describe('media engine quality order', () => {
  it('lists the best rendition first with Auto pinned, keeping engine identifiers stable', async () => {
    instances.length = 0
    const video = document.createElement('video')
    const tracks = vi.fn()
    const engine = await attachMediaEngine(video, source, { tracks, fatal: vi.fn() })
    instances[0]!.levels = [{ height: 360, bitrate: 800_000 }, { height: 1080, bitrate: 8_000_000 }, { height: 720, bitrate: 3_000_000 }]
    handlers.get('manifest')?.()
    expect(tracks).toHaveBeenCalledWith(expect.objectContaining({
      qualities: [
        { value: 'auto', label: 'Auto' },
        expect.objectContaining({ value: '1', label: '1080p' }),
        expect.objectContaining({ value: '2', label: '720p' }),
        expect.objectContaining({ value: '0', label: '360p' }),
      ],
    }))
    // Selecting the top row still addresses the original level index.
    engine.quality('1')
    engine.destroy()
  })
  it('snaps odd rendition heights to their nearest standard rung, ties up', async () => {
    expect([960, 640, 900, 1080, 720, 480, 360, 2160, 1440, 800, 500, 240].map(snapQualityHeight)).toEqual(
      [1080, 720, 1080, 1080, 720, 480, 360, 2160, 1440, 720, 480, 240],
    )
    expect(snapQualityHeight(undefined)).toBeUndefined()
    instances.length = 0
    const video = document.createElement('video')
    const tracks = vi.fn()
    const engine = await attachMediaEngine(video, source, { tracks, fatal: vi.fn() })
    instances[0]!.levels = [{ height: 640, bitrate: 2_000_000 }, { height: 960, bitrate: 5_000_000 }, { height: 360, bitrate: 800_000 }]
    handlers.get('manifest')?.()
    expect(tracks).toHaveBeenCalledWith(expect.objectContaining({
      qualities: [
        { value: 'auto', label: 'Auto' },
        expect.objectContaining({ value: '1', label: '1080p' }),
        expect.objectContaining({ value: '0', label: '720p' }),
        expect.objectContaining({ value: '2', label: '360p' }),
      ],
    }))
    engine.destroy()
  })
  it('grounds a lone mislabeled rendition in decoded pixels once frames exist', async () => {
    instances.length = 0
    const video = document.createElement('video')
    const tracks = vi.fn()
    const engine = await attachMediaEngine(video, source, { tracks, fatal: vi.fn() })
    instances[0]!.levels = [{ height: 240, bitrate: 5_000_000 }]
    handlers.get('manifest')?.()
    expect(tracks).toHaveBeenLastCalledWith(expect.objectContaining({
      qualities: [{ value: 'auto', label: 'Auto' }, expect.objectContaining({ value: '0', label: '240p' })],
    }))
    Object.defineProperty(video, 'videoHeight', { configurable: true, value: 1080 })
    video.dispatchEvent(new Event('resize'))
    expect(tracks).toHaveBeenLastCalledWith(expect.objectContaining({
      qualities: [{ value: 'auto', label: 'Auto' }, expect.objectContaining({ value: '0', label: '1080p' })],
    }))
    const calls = tracks.mock.calls.length
    engine.destroy()
    video.dispatchEvent(new Event('resize'))
    expect(tracks.mock.calls.length).toBe(calls)
  })
  it('keeps manifest labels on multi-rung ladders regardless of decoded size', async () => {
    instances.length = 0
    const video = document.createElement('video')
    Object.defineProperty(video, 'videoHeight', { configurable: true, value: 1080 })
    const tracks = vi.fn()
    const engine = await attachMediaEngine(video, source, { tracks, fatal: vi.fn() })
    instances[0]!.levels = [{ height: 720, bitrate: 3_000_000 }, { height: 360, bitrate: 800_000 }]
    handlers.get('manifest')?.()
    expect(tracks).toHaveBeenLastCalledWith(expect.objectContaining({
      qualities: [
        { value: 'auto', label: 'Auto' },
        expect.objectContaining({ value: '0', label: '720p' }),
        expect.objectContaining({ value: '1', label: '360p' }),
      ],
    }))
    engine.destroy()
  })
  it('collapses same-rung duplicates from snapping, keeping the first entry', () => {
    expect(dedupeSnappedQualities([
      { value: '0', label: '1080p', height: 1080 },
      { value: '1', label: '1080p', height: 1080 },
      { value: '2', label: '720p', height: 720 },
      { value: 'x', label: '420 kbps' },
    ]).map((option) => option.value)).toEqual(['0', '2', 'x'])
  })
  it('sorts known heights best-first, keeping height-less entries in manifest order (Auto leads separately)', () => {
    expect(orderQualityOptions([
      { value: 'a', label: 'Auto' },
      { value: '0', label: '360p', height: 360 },
      { value: '1', label: '1080p', height: 1080 },
      { value: 'x', label: '420 kbps' },
      { value: '2', label: '720p', height: 720 },
    ]).map((option) => option.value)).toEqual(['1', '2', '0', 'a', 'x'])
  })
})

describe('media engine hls errors', () => {
  it('retries loading at the requested seek destination instead of the last decoded frame', async () => {
    startLoad.mockClear()
    const video = document.createElement('video')
    video.currentTime = 600
    const engine = await attachMediaEngine(video, source, { tracks: vi.fn(), fatal: vi.fn() })
    expect(engine.recover()).toBe(true)
    expect(startLoad).toHaveBeenCalledWith(600)
    engine.destroy()
  })
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
