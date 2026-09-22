import { audioTrackLabel, canPlayHlsNatively, deviceAutoCapHeight, isSafeMediaUrl, type DirectMediaSource } from './media-source'

export type MediaOption = { value: string; label: string; language?: string | undefined }
export type EngineTracks = { qualities: MediaOption[]; audio: MediaOption[]; subtitles: MediaOption[] }
export type MediaEngine = {
  destroy(): void
  recover(): boolean
  quality(value: string): void
  audio(value: string): void
  subtitle(value: string): void
}
export type EngineEvents = { tracks(value: EngineTracks): void; fatal(reason: 'network' | 'media' | 'gone'): void }
type NativeAudio = { id: string; label: string; language: string; enabled: boolean }

export async function attachMediaEngine(video: HTMLVideoElement, source: DirectMediaSource, events: EngineEvents, signal?: AbortSignal): Promise<MediaEngine> {
  signal?.throwIfAborted()
  if (!isSafeMediaUrl(source.src)) throw new Error('This media source is not allowed.')
  const auto = [{ value: 'auto', label: 'Auto' }]
  // Prefer the hls.js engine whenever MSE is available: several Chromium
  // builds report `canPlayType('application/vnd.apple.mpegurl') === 'maybe'`
  // yet fail every HLS manifest natively (MEDIA_ERR_SRC_NOT_SUPPORTED with no
  // rendition ever requested). Native is the fallback for MSE-less browsers
  // with real built-in HLS (iOS Safari), mirroring provider-lab's player order.
  const { default: Hls } = source.type === 'hls' ? await import('hls.js').catch(() => ({ default: null })) : { default: null }
  signal?.throwIfAborted()
  if (source.type === 'native' || (source.type === 'hls' && (!Hls || !Hls.isSupported()) && canPlayHlsNatively(video))) {
    const audio = () => Array.from((video as HTMLVideoElement & { audioTracks?: ArrayLike<NativeAudio> }).audioTracks ?? [])
    const publish = () => events.tracks({
      qualities: auto,
      audio: audio().map((track, index) => ({ value: String(index), label: track.label || track.language || `Audio ${index + 1}`, language: track.language })),
      subtitles: Array.from(video.textTracks).filter((track) => !track.id.startsWith('consumit-external-')).map((track) => ({ value: track.id || track.language, label: track.label || track.language, language: track.language })),
    })
    video.src = source.src
    video.addEventListener('loadedmetadata', publish)
    video.textTracks.addEventListener?.('addtrack', publish)
    publish()
    return {
      quality() { /* Native adaptive quality is browser-owned. */ },
      audio(value) { audio().forEach((track, index) => { track.enabled = String(index) === value }) },
      subtitle(value) { Array.from(video.textTracks).forEach((track) => { track.mode = value !== 'off' && (track.id || track.language) === value ? 'showing' : 'disabled' }) },
      recover() { return false },
      destroy() { video.removeEventListener('loadedmetadata', publish); video.textTracks.removeEventListener?.('addtrack', publish); video.removeAttribute('src'); video.load() },
    }
  }
  if (source.type === 'hls') {
    signal?.throwIfAborted()
    if (!Hls || !Hls.isSupported()) throw new Error('HLS playback is unavailable on this browser.')
    // Direct CDN media must stay credential-free so wildcard CORS remains
    // valid and no member cookies can cross the provider boundary.
    const hls = new Hls({ enableWorker: true, backBufferLength: 30, maxBufferLength: 30, capLevelToPlayerSize: true, renderTextTracksNatively: true })
    let lastError: 'network' | 'media' | 'gone' = 'network'
    const publish = () => {
      try {
        // Device-tier Auto ceiling (ADR-0002 amendment A): phones never burn
        // 1080p/4K bytes on Auto. Manual quality() sets currentLevel directly
        // and bypasses this Auto-only ceiling.
        const cap = deviceAutoCapHeight()
        const eligible = hls.levels
          .map((level, index) => ({ index, height: typeof level.height === 'number' ? level.height : undefined }))
          .filter((entry) => entry.height === undefined || entry.height <= cap)
        hls.autoLevelCapping = eligible.length ? Math.max(...eligible.map((entry) => entry.index)) : 0
      } catch {
        /* Auto cap is a preference, never a crash */
      }
      events.tracks({
      qualities: [...auto, ...hls.levels.map((level, index) => ({ value: String(index), label: level.height ? `${level.height}p` : source.qualityHint ?? `${Math.round(level.bitrate / 1000)} kbps` }))],
      audio: hls.audioTracks.map((track, index) => ({ value: String(index), label: audioTrackLabel({ name: track.name, lang: track.lang, isDefault: track.default }, index), language: track.lang })),
      subtitles: hls.subtitleTracks.map((track, index) => ({ value: String(index), label: track.name || track.lang || `Subtitles ${index + 1}`, language: track.lang })),
      })
    }
    hls.on(Hls.Events.MANIFEST_PARSED, publish)
    hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, publish)
    hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, publish)
    hls.on(Hls.Events.ERROR, (_event, data) => {
      if (!data.fatal) return
      // HTTP 410 Gone is definitive: the bytes are not coming back, so a
      // same-source retry or re-mint is pointless — the application should
      // switch sources instead of recovering in place.
      const gone = (data as unknown as { response?: { code?: unknown } }).response?.code === 410
      lastError = gone ? 'gone' : data.type === Hls.ErrorTypes.MEDIA_ERROR ? 'media' : 'network'
      events.fatal(lastError)
    })
    hls.loadSource(source.src); hls.attachMedia(video)
    return {
      quality(value) { hls.currentLevel = value === 'auto' ? -1 : Number(value) },
      audio(value) { hls.audioTrack = Number(value) },
      subtitle(value) {
        if (value === 'off') {
          hls.subtitleTrack = -1
          hls.subtitleDisplay = false
        } else {
          hls.subtitleTrack = Number(value)
          hls.subtitleDisplay = true
        }
      },
      recover() {
        // Gone sources never recover in place; report false so the controller
        // skips its retry wait and asks the application to switch sources.
        if (lastError === 'gone') return false
        if (lastError === 'media') hls.recoverMediaError(); else hls.startLoad(); return true
      },
      destroy() { hls.destroy(); video.removeAttribute('src'); video.load() },
    }
  }
  const dash = await import('dashjs')
  signal?.throwIfAborted()
  const player = dash.MediaPlayer().create()
  const publish = () => events.tracks({
    qualities: [...auto, ...player.getRepresentationsByType('video').map((track) => ({ value: track.id, label: track.height ? `${track.height}p` : 'Video' }))],
    audio: player.getTracksFor('audio').map((track, index) => ({ value: String(index), label: track.lang || `Audio ${index + 1}`, language: track.lang ?? undefined })),
    subtitles: player.getTracksFor('text').map((track, index) => ({ value: String(index), label: track.lang || `Subtitles ${index + 1}`, language: track.lang ?? undefined })),
  })
  player.on(dash.MediaPlayer.events.STREAM_INITIALIZED, publish)
  player.on(dash.MediaPlayer.events.ERROR, () => events.fatal('media'))
  player.initialize(video, source.src, false)
  return {
    quality(value) { player.updateSettings({ streaming: { abr: { autoSwitchBitrate: { video: value === 'auto' } } } }); if (value !== 'auto') player.setRepresentationForTypeById('video', value) },
    audio(value) { const track = player.getTracksFor('audio')[Number(value)]; if (track) player.setCurrentTrack(track) },
    subtitle(value) { player.setTextTrack(value === 'off' ? -1 : Number(value)) },
    recover() { return false },
    destroy() { player.reset(); video.removeAttribute('src'); video.load() },
  }
}
