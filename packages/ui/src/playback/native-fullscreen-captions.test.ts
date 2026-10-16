import { afterEach, expect, it, vi } from 'vitest'
import { createNativeFullscreenCaptions } from './native-fullscreen-captions'
import { createPlaybackController } from './playback-controller'
import { createPlaybackControllerNext } from './playback-controller-next'
import type { EngineEvents } from './media-engine'
import type { DirectMediaSource } from './media-source'

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })

function fixture() {
  vi.stubGlobal('VTTCue', class { constructor(public startTime: number, public endTime: number, public text: string) {} })
  const video = document.createElement('video'), element = document.createElement('track')
  element.id = 'consumit-external-upload'
  element.kind = 'subtitles'
  const cues: VTTCue[] = []
  const track = { kind: 'subtitles', mode: 'hidden', cues, addCue: (cue: VTTCue) => { cues.push(cue) }, removeCue: (cue: VTTCue) => { cues.splice(cues.indexOf(cue), 1) } }
  Object.defineProperty(element, 'track', { value: track })
  const nativeTracks = [track]
  Object.defineProperty(video, 'textTracks', { value: nativeTracks })
  video.append(element)
  return { video, element, track, nativeTracks, bridge: createNativeFullscreenCaptions(video) }
}

it('makes the selected file a default showing native track with the same sync offset', () => {
  const { video, element, track, bridge } = fixture()
  bridge.update({ value: `external:${element.id}`, delayMs: 1000, cues: [{ startTime: 0, endTime: 0.5, text: 'Already ended' }, { startTime: 1, endTime: 4, text: 'Our Arabic العربية & <text>' }] })
  expect(track.mode).toBe('hidden')
  bridge.enter()
  expect(video).toHaveAttribute('data-native-fullscreen', 'true')
  expect(element.default).toBe(true)
  expect(track.mode).toBe('showing')
  expect(track.cues).toEqual([{ startTime: 0, endTime: 3, text: 'Our Arabic العربية &amp; &lt;text&gt;' }])
  bridge.leave()
  expect(video).not.toHaveAttribute('data-native-fullscreen')
  expect(track.mode).toBe('hidden')
  bridge.destroy()
})

it('reapplies shifted cues if the browser finishes loading the original VTT in fullscreen', () => {
  const { element, track, bridge } = fixture()
  bridge.update({ value: `external:${element.id}`, delayMs: -1000, cues: [{ startTime: 1, endTime: 4, text: 'Shifted' }] })
  bridge.enter()
  track.cues.splice(0, track.cues.length, { startTime: 1, endTime: 4, text: 'Original loader' } as VTTCue)
  element.dispatchEvent(new Event('load'))
  expect(track.cues).toEqual([{ startTime: 2, endTime: 5, text: 'Shifted' }])
  expect(track.mode).toBe('showing')
  bridge.destroy()
})

it('keeps Off disabled and removes the native caption presentation on destruction', () => {
  const { video, element, track, bridge } = fixture()
  bridge.update({ value: `external:${element.id}`, delayMs: 0, cues: [{ startTime: 0, endTime: 5, text: 'Selected' }] })
  bridge.enter()
  bridge.update({ value: 'off', delayMs: 0, cues: [] })
  expect(track.mode).toBe('disabled')
  expect(element.default).toBe(false)
  bridge.destroy()
  expect(video).not.toHaveAttribute('data-native-fullscreen')
  expect(track.mode).toBe('disabled')
})

it('retains browser-loaded captions if native cue construction is unavailable', () => {
  const { element, track, bridge } = fixture()
  track.cues.push({ startTime: 0, endTime: 5, text: 'Original file' } as VTTCue)
  vi.stubGlobal('VTTCue', class { constructor() { throw new Error('Unavailable') } })
  bridge.update({ value: `external:${element.id}`, delayMs: 1000, cues: [{ startTime: 1, endTime: 4, text: 'Prepared' }] })
  bridge.enter()
  expect(track.cues).toEqual([{ startTime: 0, endTime: 5, text: 'Original file' }])
  expect(track.mode).toBe('showing')
  bridge.destroy()
})

it('disables the previous native file when the selected upload changes in fullscreen', () => {
  const { video, element, track, nativeTracks, bridge } = fixture()
  bridge.update({ value: `external:${element.id}`, delayMs: 0, cues: [{ startTime: 0, endTime: 5, text: 'First' }] })
  bridge.enter()
  const next = document.createElement('track')
  next.id = 'consumit-external-next'
  next.kind = 'subtitles'
  const nextCues: VTTCue[] = []
  const nextTrack = { kind: 'subtitles', mode: 'disabled', cues: nextCues, addCue: (cue: VTTCue) => { nextCues.push(cue) }, removeCue: (cue: VTTCue) => { nextCues.splice(nextCues.indexOf(cue), 1) } }
  Object.defineProperty(next, 'track', { value: nextTrack })
  nativeTracks.push(nextTrack)
  video.append(next)
  bridge.update({ value: `external:${next.id}`, delayMs: 0, cues: [{ startTime: 0, endTime: 5, text: 'Next' }] })
  expect(track.mode).toBe('disabled')
  expect(element.default).toBe(false)
  expect(nextTrack.mode).toBe('showing')
  expect(next.default).toBe(true)
  bridge.destroy()
})

it.each([['legacy', createPlaybackController], ['next', createPlaybackControllerNext]] as const)('keeps native captions showing through %s engine track updates', async (_name, createController) => {
  const video = document.createElement('video')
  let publish: EngineEvents['tracks'] | undefined
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  const controller = createController(video, { change: vi.fn(), fatal: vi.fn(), initialPreferences: { qualityHeight: null, subtitlesEnabled: true, subtitleLanguages: ['en'] } }, async (_video: HTMLVideoElement, _source: DirectMediaSource, events: EngineEvents) => {
    publish = events.tracks
    return { quality: vi.fn(), audio: vi.fn(), subtitle: vi.fn(), destroy: vi.fn(), recover: () => false }
  })
  await controller.load({ type: 'native', src: 'https://media.example/movie.mp4' })
  controller.externalSubtitles([{ id: 'upload', label: 'Our file', language: 'en', url: 'https://subs.example/our.vtt' }])
  const element = video.querySelector('track')!
  const track = { mode: 'disabled' }
  Object.defineProperty(element, 'track', { value: track })
  controller.subtitle(`external:${element.id}`)
  expect(track.mode).toBe('hidden')
  video.setAttribute('data-native-fullscreen', 'true')
  publish?.({ qualities: [], audio: [], subtitles: [] })
  expect(track.mode).toBe('showing')
  video.removeAttribute('data-native-fullscreen')
  controller.subtitle(`external:${element.id}`)
  expect(track.mode).toBe('hidden')
  controller.destroy()
})
