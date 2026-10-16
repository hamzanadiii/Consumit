import { afterEach, expect, it, vi } from 'vitest'
import { createPlaybackController } from './playback-controller'
import { createPlaybackControllerNext } from './playback-controller-next'
import type { EngineEvents, MediaEngine } from './media-engine'

afterEach(() => localStorage.clear())

it.each([
  ['legacy', createPlaybackController],
  ['next', createPlaybackControllerNext],
] as const)('%s keeps the latest subtitle choice when streaming tracks refresh after a source switch', async (_name, create) => {
  const video = document.createElement('video')
  video.play = vi.fn().mockResolvedValue(undefined)
  const change = vi.fn()
  let events: EngineEvents | undefined
  const engine: MediaEngine = { destroy: vi.fn(), recover: () => false, quality: vi.fn(), audio: vi.fn(), subtitle: vi.fn() }
  const controller = create(video, { change, fatal: vi.fn() }, async (_video, _source, callbacks) => { events = callbacks; return engine })
  const english = { id: 'english', label: 'English', language: 'en', url: 'https://media.example/en.vtt' }
  const upload = { id: 'upload', label: 'captions.srt', language: 'und', url: 'https://media.example/upload.vtt' }
  const englishValue = 'external:consumit-external-english'
  const uploadValue = 'external:consumit-external-upload'
  try {
    controller.externalSubtitles([english])
    await controller.load({ type: 'native', src: 'https://media.example/one.mp4' }, 0, false)
    controller.subtitle(englishValue)
    await controller.load({ type: 'native', src: 'https://media.example/two.mp4' }, 12, false)
    controller.externalSubtitles([english, upload])
    controller.subtitle(uploadValue)
    expect(change.mock.lastCall?.[0].subtitleTrack).toBe(uploadValue)
    // HLS republishes track metadata when a new fragment decodes.
    events!.tracks({ qualities: [], audio: [], subtitles: [] })
    expect(change.mock.lastCall?.[0].subtitleTrack).toBe(uploadValue)
    controller.subtitle('off')
    events!.tracks({ qualities: [], audio: [], subtitles: [] })
    expect(change.mock.lastCall?.[0].subtitleTrack).toBe('off')
  } finally {
    controller.destroy()
  }
})
