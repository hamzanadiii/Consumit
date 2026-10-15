import { audioTrackLabel, canPlayHlsNatively, deviceAutoCapHeight, isSafeMediaUrl, type DirectMediaSource } from './media-source'
import { RelayLeaseRouter, relayLeaseLoader } from './relay-lease'
import { standardQualityHeight } from './quality-tier'
import { vttPlaylistLoader } from './vtt-playlist-loader'
import { createAudioSwitch } from './audio-switch'

export type MediaOption = { value: string; label: string; language?: string | undefined; height?: number | undefined }

/** Best-first menu order: known heights descend, height-less entries keep
 *  manifest order at the end. Values stay bound to their engine identifiers,
 *  so selection is unaffected by display order. Auto always leads separately. */
export function orderQualityOptions(options: MediaOption[]): MediaOption[] {
  return [...options].sort((a, b) => (b.height ?? -1) - (a.height ?? -1))
}

/** Preserve measured pixels, including cropped and nonstandard renditions. */
export function validQualityHeight(height: number | undefined): number | undefined {
  return height !== undefined && Number.isFinite(height) && height > 0 ? Math.round(height) : undefined
}

/** Collapse equal-height duplicates (first manifest entry wins,
 *  matching player dedupe). Height-less entries always survive. */
export function dedupeQualityHeights(options: MediaOption[]): MediaOption[] {
  const seen = new Set<number>()
  return options.filter((option) => {
    if (option.height === undefined) return true
    if (seen.has(option.height)) return false
    seen.add(option.height)
    return true
  })
}
export type EngineTracks = { qualities: MediaOption[]; audio: MediaOption[]; subtitles: MediaOption[] }
export type MediaEngine = {
  destroy(): void
  recover(): boolean
  quality(value: string): void
  audio(value: string): void | Promise<boolean>
  subtitle(value: string): void
}
export type EngineFailure = 'network' | 'media' | 'gone' | 'expired'
export type EngineDeliveryFailure = 'cors' | 'headers' | 'manifest' | 'timeout' | 'unstable'
export type EngineEvents = { tracks(value: EngineTracks): void; fatal(reason: EngineFailure, deliveryFailure?: EngineDeliveryFailure): void }
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
    const switching = createAudioSwitch(video)
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
      audio(value) { const before = audio().map(track => track.enabled); return switching.select(() => audio().forEach((track, index) => { track.enabled = String(index) === value }), () => audio().forEach((track, index) => { track.enabled = before[index] ?? false })) },
      subtitle(value) { Array.from(video.textTracks).forEach((track) => { track.mode = value !== 'off' && (track.id || track.language) === value ? 'showing' : 'disabled' }) },
      recover() { return false },
      // Removing src already empties the element and aborts its fetch per
      // spec. An extra explicit load() here inserts a synchronous empty
      // cycle that intermittently strands WebKit's resource loader on
      // same-element source switches: the renewal URL installs but never
      // reaches loadedmetadata, leaving the clip paused at 0:00. The next
      // attach assigns src in the same task and starts the new load
      // directly. MSE engines below keep their explicit load for teardown.
      destroy() { switching.dispose(); video.removeEventListener('loadedmetadata', publish); video.textTracks.removeEventListener?.('addtrack', publish); video.removeAttribute('src') },
    }
  }
  if (source.type === 'hls') {
    signal?.throwIfAborted()
    if (!Hls || !Hls.isSupported()) throw new Error('HLS playback is unavailable on this browser.')
    // Direct CDN media must stay credential-free so wildcard CORS remains
    // valid and no member cookies can cross the provider boundary.
    // Keep the stable XHR loader: progressive FetchLoader cancellation leaked
    // AbortError rejections during recovery in the deployed browser. Retain a
    // minute of forward reserve and the existing adaptive/device quality limits.
    const lease = source.relayLease ? new RelayLeaseRouter(source.src, source.relayLease) : undefined
    const loader = lease ? relayLeaseLoader(Hls.DefaultConfig.loader, lease) : source.hlsSubtitlePlaylistFormat === 'vtt' ? Hls.DefaultConfig.loader : undefined
    const hls = new Hls({ enableWorker: true, progressive: false, backBufferLength: 30, maxBufferLength: 60, capLevelToPlayerSize: true, renderTextTracksNatively: true,
      ...(loader ? { loader: source.hlsSubtitlePlaylistFormat === 'vtt' ? vttPlaylistLoader(loader) : loader } : {}),
    })
    const switching = createAudioSwitch(video)
    let lastError: EngineFailure = 'network'
    let lastDeliveryFailure: EngineDeliveryFailure | undefined
    const measuredHeights = new Map<number, number>()
    let frameRequest: number | undefined
    let destroyed = false
    const decodedHeight = () => {
      const height = video.videoHeight
      return standardQualityHeight(height, video.videoWidth)
    }
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
      qualities: [...auto, ...orderQualityOptions(dedupeQualityHeights(hls.levels.map((level, index) => {
        const declared = typeof level.height === 'number' ? level.height : undefined
        const truth = measuredHeights.get(index) ?? (hls.levels.length === 1 ? decodedHeight() : undefined)
        const height = truth ?? standardQualityHeight(declared, level.width)
        return { value: String(index), label: height ? `${height}p` : source.qualityHint ?? `${Math.round(level.bitrate / 1000)} kbps`, height: height ?? undefined }
      })))],
      audio: hls.audioTracks.map((track, index) => ({ value: String(index), label: audioTrackLabel({ name: track.name, lang: track.lang, isDefault: track.default }, index), language: track.lang })),
      subtitles: hls.subtitleTracks.map((track, index) => ({ value: String(index), label: track.name || track.lang || `Subtitles ${index + 1}`, language: track.lang })),
      })
    }
    hls.on(Hls.Events.MANIFEST_PARSED, publish)
    hls.on(Hls.Events.AUDIO_TRACKS_UPDATED, publish)
    hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, publish)
    // Observe the playing fragment, never a downloaded or selected future
    // level. Waiting for a decoded frame avoids relabeling a new rendition
    // with the dimensions of the previous frame during an ABR switch.
    hls.on(Hls.Events.FRAG_CHANGED, (_event, { frag }) => {
      if (frameRequest !== undefined) video.cancelVideoFrameCallback?.(frameRequest)
      frameRequest = video.requestVideoFrameCallback?.((_now, frame) => {
        frameRequest = undefined
        if (destroyed || frame.mediaTime < frag.start || frame.mediaTime >= frag.end) return
        const height = standardQualityHeight(frame.height, frame.width)
        if (height !== undefined && hls.levels[frag.level]) measuredHeights.set(frag.level, height)
        publish()
      })
    })
    hls.on(Hls.Events.ERROR, (_event, data) => {
      const detail = String((data as unknown as { details?: unknown }).details ?? '')
      if (switching.pending() && (/^audioTrack/i.test(detail) || data.frag?.type === 'audio')) { switching.fail(); return }
      if (!data.fatal) return
      // HTTP 410 Gone is definitive: the bytes are not coming back, so a
      // same-source retry or re-mint is pointless — the application should
      // switch sources instead of recovering in place.
      const status = (data as unknown as { response?: { code?: unknown } }).response?.code
      const networkError = data.type === Hls.ErrorTypes.NETWORK_ERROR
      const forbidden = status === 401 || status === 403
      const manifestFailure = /manifest/i.test(detail)
      // A 401/403 from a direct media URL may be a provider referer gate, not
      // an expired lease. Try another direct provider when renewal fails.
      lastError = status === 410 ? 'gone' : forbidden || manifestFailure ? 'network' : data.type === Hls.ErrorTypes.MEDIA_ERROR ? 'media' : 'network'
      lastDeliveryFailure = lastError !== 'network' || (!networkError && !forbidden && !manifestFailure) ? undefined
        : forbidden ? 'headers'
        : /timeout/i.test(detail) ? 'timeout'
        : manifestFailure ? 'manifest'
        : (status === undefined || status === 0) ? 'cors'
        : undefined
      events.fatal(lastError, lastDeliveryFailure)
    })
    const onVideoResize = () => {
      const height = decodedHeight()
      const level = hls.currentLevel
      if (height !== undefined && hls.levels[level]) measuredHeights.set(level, height)
      publish()
    }
    video.addEventListener('resize', onVideoResize)
    hls.loadSource(source.src); hls.attachMedia(video)
    return {
      quality(value) { hls.currentLevel = value === 'auto' ? -1 : Number(value) },
      audio(value) {
        const previous = hls.audioTrack
        if (previous === Number(value)) return Promise.resolve(true)
        const select = (index: number) => {
          if (video.paused) hls.audioTrack = index
          else hls.nextAudioTrack = index
        }
        return switching.select(() => select(Number(value)), () => select(previous), ready => {
          const changed = (_event: string, data: { id: number }) => { if (data.id === Number(value)) ready() }
          hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, changed)
          return () => hls.off(Hls.Events.AUDIO_TRACK_SWITCHED, changed)
        })
      },
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
        if (lastError === 'gone' || lastError === 'expired' || lastDeliveryFailure === 'headers') return false
        // The default startLoad position can rewind to the last decoded frame
        // when a seek is waiting for bytes. Retry the element's destination.
        if (lastError === 'media') hls.recoverMediaError(); else hls.startLoad(video.currentTime); return true
      },
      destroy() { destroyed = true; switching.dispose(); if (frameRequest !== undefined) video.cancelVideoFrameCallback?.(frameRequest); video.removeEventListener('resize', onVideoResize); lease?.destroy(); hls.destroy(); video.removeAttribute('src'); video.load() },
    }
  }
  const dash = await import('dashjs')
  signal?.throwIfAborted()
  const player = dash.MediaPlayer().create()
  const switching = createAudioSwitch(video)
  const publish = () => events.tracks({
    qualities: [...auto, ...orderQualityOptions(dedupeQualityHeights(player.getRepresentationsByType('video').map((track) => {
      const height = standardQualityHeight(typeof track.height === 'number' ? track.height : undefined, typeof track.width === 'number' ? track.width : undefined)
      return { value: track.id, label: height ? `${height}p` : 'Video', height: height ?? undefined }
    })))],
    audio: player.getTracksFor('audio').map((track, index) => ({ value: String(index), label: track.lang || `Audio ${index + 1}`, language: track.lang ?? undefined })),
    subtitles: player.getTracksFor('text').map((track, index) => ({ value: String(index), label: track.lang || `Subtitles ${index + 1}`, language: track.lang ?? undefined })),
  })
  player.on(dash.MediaPlayer.events.STREAM_INITIALIZED, publish)
  player.on(dash.MediaPlayer.events.ERROR, (event: unknown) => {
    const detail = event as { error?: { data?: { status?: number }; code?: number } } | undefined
    const status = detail?.error?.data?.status
    const failure = status === 410 ? 'gone' : status === 401 || status === 403 ? 'expired' : status === 0 || (status !== undefined && status >= 500) ? 'network' : 'media'
    events.fatal(failure, status === 0 ? 'cors' : undefined)
  })
  player.initialize(video, source.src, false)
  return {
    quality(value) { player.updateSettings({ streaming: { abr: { autoSwitchBitrate: { video: value === 'auto' } } } }); if (value !== 'auto') player.setRepresentationForTypeById('video', value) },
    audio(value) {
      const track = player.getTracksFor('audio')[Number(value)], previous = player.getCurrentTrackFor('audio')
      if (!track) return Promise.resolve(false)
      if (previous === track) return Promise.resolve(true)
      return switching.select(() => player.setCurrentTrack(track), () => { if (previous) player.setCurrentTrack(previous) }, ready => {
        const rendered = () => { if (player.getCurrentTrackFor('audio') === track) ready() }
        player.on(dash.MediaPlayer.events.TRACK_CHANGE_RENDERED, rendered)
        return () => player.off(dash.MediaPlayer.events.TRACK_CHANGE_RENDERED, rendered)
      })
    },
    subtitle(value) { player.setTextTrack(value === 'off' ? -1 : Number(value)) },
    recover() { return false },
    destroy() { switching.dispose(); player.reset(); video.removeAttribute('src'); video.load() },
  }
}
