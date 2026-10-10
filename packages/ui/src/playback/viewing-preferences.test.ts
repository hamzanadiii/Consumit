import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPlaybackController } from './playback-controller'
import { createPlaybackControllerNext } from './playback-controller-next'
import type { MediaEngine } from './media-engine'

afterEach(() => { localStorage.clear(); vi.restoreAllMocks() })
for (const [name, create] of [['original', createPlaybackController], ['next core', createPlaybackControllerNext]] as const) {
  describe(`${name} semantic viewing preferences`, () => {
    it('upgrades English fallback to late Arabic without overriding an intentional Off', async () => {
      const video = document.createElement('video')
      const adapter: MediaEngine = { destroy: vi.fn(), recover: vi.fn(() => false), quality: vi.fn(), audio: vi.fn(), subtitle: vi.fn() }
      const change = vi.fn(), preferenceChange = vi.fn()
      const controller = create(video, { change, fatal: vi.fn(), preferenceChange, initialPreferences: { qualityHeight: null, subtitlesEnabled: true, subtitleLanguages: ['ar', 'en'] } }, async (_video, _source, events) => {
        events.tracks({ qualities: [], audio: [], subtitles: [{ value: 'english', label: 'English', language: 'en' }] })
        return adapter
      })
      await controller.load({ type: 'native', src: 'https://media.example/movie.mp4' })
      expect(change).toHaveBeenLastCalledWith(expect.objectContaining({ subtitleTrack: 'english' }))
      const arabic = { id: 'arabic', label: 'Arabic', language: 'ar', url: 'https://media.example/arabic.vtt' }
      controller.externalSubtitles([arabic])
      expect(change).toHaveBeenLastCalledWith(expect.objectContaining({ subtitleTrack: 'external:consumit-external-arabic' }))
      expect(preferenceChange).not.toHaveBeenCalled()
      controller.subtitle('off')
      controller.externalSubtitles([arabic])
      expect(change).toHaveBeenLastCalledWith(expect.objectContaining({ subtitleTrack: 'off' }))
      controller.destroy()
    })
    it('uses ordered language fallback and quality before playing, keeps defaults across sources, and emits only intentional changes', async () => {
      const video = document.createElement('video'); video.play = vi.fn().mockResolvedValue(undefined)
      const adapter: MediaEngine = { destroy: vi.fn(), recover: vi.fn(() => false), quality: vi.fn(), audio: vi.fn(), subtitle: vi.fn() }
      const change = vi.fn(), preferenceChange = vi.fn()
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Storage blocked') })
      const controller = create(video, { change, fatal: vi.fn(), preferenceChange, initialPreferences: { audioLanguage: 'ar', qualityHeight: 1080, subtitlesEnabled: true, subtitleLanguages: ['ar', 'fr', 'en'] } }, async (_video, _source, events) => {
        events.tracks({ qualities: [{ value: 'auto', label: 'Auto' }, { value: 'hd', label: '720p', height: 720 }], audio: [{ value: 'english-track', label: 'English', language: 'en' }], subtitles: [{ value: 'en-track', label: 'English', language: 'en' }, { value: 'fr-track', label: 'French', language: 'fr' }] })
        return adapter
      })
      await controller.load({ type: 'native', src: 'https://media.example/first.mp4' })
      expect(adapter.subtitle).toHaveBeenLastCalledWith('fr-track')
      expect(change).toHaveBeenLastCalledWith(expect.objectContaining({ audioNotice: expect.stringContaining('ar audio unavailable'), preferences: expect.objectContaining({ audioLanguage: 'ar', qualityHeight: 1080 }) }))
      expect(preferenceChange).not.toHaveBeenCalled()
      controller.subtitle('off')
      expect(preferenceChange).toHaveBeenLastCalledWith({ subtitlesEnabled: false })
      await controller.load({ type: 'native', src: 'https://media.example/second.mp4' })
      expect(adapter.subtitle).toHaveBeenLastCalledWith('off')
      controller.subtitle('en-track')
      expect(preferenceChange).toHaveBeenLastCalledWith({ subtitlesEnabled: true, subtitleLanguages: ['en', 'ar', 'fr'] })
      controller.audio('english-track')
      expect(preferenceChange).toHaveBeenLastCalledWith(expect.objectContaining({ audioLanguage: 'en' }))
      controller.destroy()
    })
    it('leaves unavailable subtitles off while keeping language intent for a later source', async () => {
      const video = document.createElement('video'); video.play = vi.fn().mockResolvedValue(undefined)
      const adapter: MediaEngine = { destroy: vi.fn(), recover: vi.fn(() => false), quality: vi.fn(), audio: vi.fn(), subtitle: vi.fn() }
      const change = vi.fn(), preferenceChange = vi.fn()
      let hasFrench = false
      const controller = create(video, { change, fatal: vi.fn(), preferenceChange, initialPreferences: { audioLanguage: 'en', qualityHeight: null, subtitlesEnabled: true, subtitleLanguages: ['fr'] } }, async (_video, _source, events) => {
        events.tracks({ qualities: [], audio: [], subtitles: hasFrench ? [{ value: 'french', label: 'French', language: 'fr' }] : [] }); return adapter
      })
      await controller.load({ type: 'native', src: 'https://media.example/one.mp4' })
      expect(change).toHaveBeenLastCalledWith(expect.objectContaining({ subtitleNotice: expect.stringContaining('unavailable'), subtitleTrack: 'off' }))
      hasFrench = true
      await controller.load({ type: 'native', src: 'https://media.example/two.mp4' })
      expect(adapter.subtitle).toHaveBeenLastCalledWith('french')
      expect(change).toHaveBeenLastCalledWith(expect.objectContaining({ subtitleNotice: undefined }))
      expect(preferenceChange).not.toHaveBeenCalled()
      controller.destroy()
    })
  })
}
