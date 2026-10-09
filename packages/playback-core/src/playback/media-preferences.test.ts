import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPlaybackController } from './playback-controller'
import { createPlaybackControllerNext } from './playback-controller-next'
import { createQualityPreference, readQualityPreference, preferredAudioOption, mediaPreferences } from './media-preferences'
import type { MediaEngine } from './media-engine'

afterEach(() => localStorage.clear())
describe.each([['legacy', createPlaybackController], ['next', createPlaybackControllerNext]] as const)('%s source preferences', (_, create) => {
  it('maps quality and language to new identifiers and restores them after a downgrade', async () => {
    const video = document.createElement('video')
    const change = vi.fn()
    let generation = 0
    const engines: MediaEngine[] = []
    const controller = create(video, { change, fatal: vi.fn() }, async (_video, _source, events) => {
      const engine = { destroy: vi.fn(), recover: vi.fn(() => false), quality: vi.fn(), audio: vi.fn(), subtitle: vi.fn() }
      engines.push(engine)
      const index = generation++
      events.tracks({ qualities: [{ value: 'auto', label: 'Auto' }, { value: `low-${index}`, label: '720p', height: 720 }, ...(index === 1 ? [] : [{ value: `high-${index}`, label: '1080p', height: 1080 }])],
        audio: [{ value: `english-${index}`, label: 'English', language: 'en' }, { value: `french-${index}`, label: 'French', language: 'fr-FR' }], subtitles: [] })
      return engine
    })
    const source = { type: 'hls' as const, src: 'https://media.example/one.m3u8' }
    await controller.load(source)
    controller.quality('high-0'); controller.audio('french-0')
    await controller.load({ ...source, src: 'https://media.example/two.m3u8' }, 30, false)
    expect(engines[1]!.quality).toHaveBeenLastCalledWith('low-1')
    expect(engines[1]!.audio).toHaveBeenLastCalledWith('french-1')
    expect(change.mock.lastCall![0]).toMatchObject({ quality: 'low-1', preferences: { qualityHeight: 1080, audioLanguage: 'fr-fr' }, qualityNotice: '1080p unavailable on this source. Using 720p.' })
    await controller.load({ ...source, src: 'https://media.example/three.m3u8' })
    expect(engines[2]!.quality).toHaveBeenLastCalledWith('high-2')
    expect(change.mock.lastCall![0].qualityNotice).toBeUndefined()
    controller.quality('auto')
    expect(readQualityPreference()).toBeNull()
    controller.destroy()
  })
})
it('keeps an unavailable preference without inventing a native resolution', () => {
  localStorage.setItem('consumit.player.quality-height', '1080')
  const preference = createQualityPreference()
  expect(preference.resolve([{ value: 'auto', label: 'Auto' }])).toEqual({ value: 'auto', notice: '1080p preferred; this source does not report a selectable resolution.' })
  expect(preference.resolve([{ value: 'auto', label: 'Auto' }], '1080p').notice).toBeUndefined()
  expect(preference.height).toBe(1080)
  localStorage.setItem('consumit.player.quality-height', '999999')
  expect(readQualityPreference()).toBeNull()
})
it('matches ISO audio aliases and keeps language intent independent of rendition identifiers', () => {
  expect(preferredAudioOption([{ value: 'new-index', label: 'Main audio', language: 'eng' }], 'en')?.value).toBe('new-index')
  expect(preferredAudioOption([{ value: 'fr-index', label: 'French', language: 'fr-CA' }], 'fra')?.value).toBe('fr-index')
  expect(mediaPreferences(1080, 'eng')).toEqual({ qualityHeight: 1080, audioLanguage: 'en' })
})
