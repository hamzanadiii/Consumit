import { attachMediaEngine, type EngineFailure, type EngineDeliveryFailure, type EngineTracks, type MediaEngine, type MediaOption } from './media-engine'
import { isSafeMediaUrl, type DirectMediaSource } from './media-source'
import type { ControllerEvent, ControllerSnapshot } from './playback-controller'

type Callbacks = {
  change(snapshot: ControllerSnapshot): void
  fatal(reason: EngineFailure, deliveryFailure?: EngineDeliveryFailure): void
  event?(event: ControllerEvent): void
}

type ExternalTrack = { id: string; label: string; language: string; url: string }

const EMPTY_TRACKS: EngineTracks = { qualities: [{ value: 'auto', label: 'Auto' }], audio: [], subtitles: [] }
const ATTACH_TIMEOUT_MS = 8_000
const FIRST_FRAME_TIMEOUT_MS = 12_000
const STALL_TIMEOUT_MS = 8_000

function playableCaption(url: string): boolean {
  if (isSafeMediaUrl(url)) return true
  try {
    const parsed = new URL(url, window.location.href)
    if (parsed.protocol === 'blob:') return parsed.origin === window.location.origin
    return ['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password && parsed.hostname === window.location.hostname
  } catch { return false }
}

/** A fresh media-element controller. Session and provider policy stay with the caller. */
export function createPlaybackControllerNext(
  video: HTMLVideoElement,
  callbacks: Callbacks,
  attach: typeof attachMediaEngine = attachMediaEngine,
) {
  let generation = 0
  let disposed = false
  let tearingDown = false
  let engine: MediaEngine | undefined
  let attachment: AbortController | undefined
  let sourceStartedAt = performance.now()
  let bufferStartedAt = 0
  let firstFrame = false
  let framePending = false
  let recoveryAttempted = false
  let fatalTimer: ReturnType<typeof setTimeout> | undefined
  let startupTimer: ReturnType<typeof setTimeout> | undefined
  let stallTimer: ReturnType<typeof setTimeout> | undefined
  let seekTimers: ReturnType<typeof setTimeout>[] = []
  let metadataCleanup = () => {}
  let tracks: HTMLTrackElement[] = []
  let externalOptions: MediaOption[] = []
  let engineOptions: EngineTracks = EMPTY_TRACKS
  let lastAdvanceAt = performance.now()
  let lastPosition = 0
  let audioPreference = 'original'
  let subtitlePreference = 'en'
  try { audioPreference = localStorage.getItem('consumit.player.audio-language') ?? 'original' } catch { /* Optional storage. */ }
  try { subtitlePreference = localStorage.getItem('consumit.player.subtitle-language') ?? 'en' } catch { /* Optional storage. */ }
  let preferredPlaybackRate = video.playbackRate
  const restorePlaybackRate = () => {
    try { if (Number.isFinite(preferredPlaybackRate) && preferredPlaybackRate > 0) video.playbackRate = preferredPlaybackRate } catch { /* Playback speed is a preference, never a crash. */ }
  }

  let snapshot: ControllerSnapshot = {
    ...EMPTY_TRACKS, phase: 'loading', needsGesture: false,
    quality: 'auto', audioTrack: '', subtitleTrack: 'off',
  }
  const update = (value: Partial<ControllerSnapshot>) => {
    if (disposed) return
    snapshot = { ...snapshot, ...value }
    callbacks.change(snapshot)
  }
  const emit = (type: ControllerEvent['type']) => {
    if (disposed) return
    callbacks.event?.({
      type,
      position: Number.isFinite(video.currentTime) ? video.currentTime : 0,
      elapsedMs: Math.max(0, performance.now() - (type === 'buffer-end' ? bufferStartedAt : sourceStartedAt)),
    })
  }
  const clearTimers = () => {
    clearTimeout(fatalTimer)
    clearTimeout(startupTimer)
    clearTimeout(stallTimer)
    seekTimers.forEach(clearTimeout)
    seekTimers = []
  }
  const fail = (reason: EngineFailure, deliveryFailure?: EngineDeliveryFailure) => {
    if (disposed || snapshot.phase === 'failed') return
    clearTimeout(stallTimer)
    if (!recoveryAttempted && reason !== 'gone' && reason !== 'expired' && engine?.recover()) {
      recoveryAttempted = true
      update({ phase: 'buffering' })
      fatalTimer = setTimeout(() => fail(reason, deliveryFailure), 3_000)
      return
    }
    clearTimers()
    metadataCleanup()
    update({ phase: 'failed' })
    emit('error')
    callbacks.fatal(reason, deliveryFailure)
  }
  const inspectStall = () => {
    if (disposed || snapshot.phase !== 'buffering' || video.paused || video.seeking) return
    if (video.currentTime > lastPosition + 0.1) {
      lastPosition = video.currentTime
      lastAdvanceAt = performance.now()
    }
    if (performance.now() - lastAdvanceAt >= STALL_TIMEOUT_MS) { fail('network', 'timeout'); return }
    stallTimer = setTimeout(inspectStall, 1_000)
  }
  const mergeTracks = () => {
    const seen = new Set<string>()
    const subtitles = [...engineOptions.subtitles, ...externalOptions].filter((option) => {
      if (seen.has(option.value)) return false
      seen.add(option.value)
      return true
    })
    update({ ...engineOptions, subtitles })
  }
  const selectSubtitle = (value: string) => {
    engine?.subtitle(value.startsWith('external:') ? 'off' : value)
    for (const track of tracks) {
      const selected = value === `external:${track.id}`
      if (track.track) track.track.mode = selected ? 'hidden' : 'disabled'
      track.default = selected
    }
    Array.from(video.textTracks ?? []).forEach((track) => {
      if (track.id.startsWith('consumit-external-')) return
      if (value === 'off' || value.startsWith('external:')) track.mode = 'disabled'
      else if (track.id === value || track.language === value) track.mode = 'showing'
    })
    update({ subtitleTrack: value })
  }
  const preferredSubtitle = () => {
    const selected = snapshot.subtitles.find((option) =>
      option.language?.split('-')[0] === subtitlePreference.split('-')[0] ||
      option.label.toLowerCase() === subtitlePreference.toLowerCase())
    selectSubtitle(subtitlePreference === 'off' ? 'off' : selected?.value ?? 'off')
  }
  const preferredAudio = () => {
    const selected = snapshot.audio.find((option) => option.language === audioPreference || option.label.toLowerCase() === audioPreference)
    if (selected) { engine?.audio(selected.value); update({ audioTrack: selected.value }) }
  }
  const replaceExternal = (entries: readonly ExternalTrack[]) => {
    tracks.forEach((track) => track.remove())
    tracks = []
    externalOptions = []
    const ids = new Set<string>(), urls = new Set<string>()
    for (const entry of entries) {
      if (!playableCaption(entry.url) || ids.has(entry.id) || urls.has(entry.url)) continue
      ids.add(entry.id); urls.add(entry.url)
      const track = document.createElement('track')
      track.id = `consumit-external-${entry.id}`
      track.kind = 'subtitles'
      track.srclang = entry.language
      track.label = entry.label
      track.src = entry.url
      video.append(track)
      tracks.push(track)
      externalOptions.push({ value: `external:${track.id}`, label: entry.label, language: entry.language })
    }
  }
  const onPlaying = () => {
    if (tearingDown || snapshot.phase === 'failed') return
    clearTimeout(fatalTimer); clearTimeout(stallTimer)
    const resumed = snapshot.phase === 'buffering'
    update({ phase: 'playing', needsGesture: false })
    if (!firstFrame && !framePending) {
      framePending = true
      const current = generation
      const markFrame = () => {
        if (disposed || current !== generation || firstFrame || snapshot.phase === 'failed') return
        framePending = false
        firstFrame = true
        clearTimeout(startupTimer)
        emit('started')
      }
      if ('requestVideoFrameCallback' in video) video.requestVideoFrameCallback(markFrame)
      else markFrame()
    } else if (resumed && firstFrame) emit('buffer-end')
  }
  const onWaiting = () => {
    if (video.paused || video.seeking || snapshot.phase === 'failed') return
    if (snapshot.phase !== 'buffering') {
      bufferStartedAt = performance.now()
      lastAdvanceAt = bufferStartedAt
      lastPosition = video.currentTime
      update({ phase: 'buffering' })
      emit('buffer-start')
    }
    clearTimeout(stallTimer)
    stallTimer = setTimeout(inspectStall, 1_000)
  }
  const onTimeUpdate = () => {
    if (video.currentTime > lastPosition + 0.1) { lastPosition = video.currentTime; lastAdvanceAt = performance.now() }
  }
  const onPause = () => {
    clearTimeout(stallTimer); clearTimeout(startupTimer)
    if (!['loading', 'switching', 'failed'].includes(snapshot.phase)) update({ phase: 'paused' })
  }
  const onEnded = () => {
    if (tearingDown || snapshot.phase === 'failed') return
    clearTimers(); update({ phase: 'ended' }); emit('ended')
  }
  const onError = () => {
    if (tearingDown) return
    const networkFailure = video.error?.code === 2
    fail(networkFailure ? 'network' : 'media', networkFailure ? 'unstable' : undefined)
  }
  video.addEventListener('playing', onPlaying)
  video.addEventListener('waiting', onWaiting)
  video.addEventListener('timeupdate', onTimeUpdate)
  video.addEventListener('pause', onPause)
  video.addEventListener('ended', onEnded)
  video.addEventListener('error', onError)

  const play = async () => {
    const current = generation
    if (!firstFrame) {
      clearTimeout(startupTimer)
      startupTimer = setTimeout(() => { if (current === generation && !firstFrame && !snapshot.needsGesture) fail('network', 'timeout') }, FIRST_FRAME_TIMEOUT_MS)
    }
    try { await video.play(); if (!disposed && current === generation) { restorePlaybackRate(); update({ needsGesture: false }) } }
    catch (error) {
      if (disposed || current !== generation) return
      if (error instanceof DOMException && error.name === 'NotAllowedError') { clearTimeout(startupTimer); update({ phase: 'ready', needsGesture: true }) }
      else fail('media')
    }
  }

  return {
    async load(source: DirectMediaSource, position = 0, shouldPlay = false) {
      const current = ++generation
      attachment?.abort()
      metadataCleanup()
      clearTimers()
      tearingDown = true
      try { engine?.destroy() } finally { tearingDown = false }
      engine = undefined
      recoveryAttempted = false
      firstFrame = false
      framePending = false
      sourceStartedAt = performance.now()
      lastAdvanceAt = sourceStartedAt
      lastPosition = position
      const previousSubtitle = snapshot.subtitleTrack
      engineOptions = EMPTY_TRACKS
      update({ ...EMPTY_TRACKS, phase: current === 1 ? 'loading' : 'switching', needsGesture: false, quality: 'auto', audioTrack: '', subtitleTrack: 'off' })
      const controller = new AbortController()
      attachment = controller
      const deadline = setTimeout(() => controller.abort(new DOMException('Player loading timed out.', 'TimeoutError')), ATTACH_TIMEOUT_MS)
      let metadataRestored = false
      const restore = () => {
        if (disposed || current !== generation || snapshot.phase === 'failed') return
        metadataRestored = true
        clearTimeout(startupTimer)
        // Native resource replacement can reset Safari's playback rate to
        // 1×. Restore the member's selected speed before playback resumes.
        restorePlaybackRate()
        if (Number.isFinite(position) && position > 0 && Number.isFinite(video.duration)) video.currentTime = Math.min(position, Math.max(0, video.duration - 0.25))
        update({ phase: 'ready' })
        if (shouldPlay) void play()
      }
      const confirmSeek = () => {
        restorePlaybackRate()
        if (disposed || current !== generation || snapshot.phase === 'failed' || position <= 0) return
        const target = Math.min(position, Math.max(0, video.duration - 0.25))
        const check = () => { if (!disposed && current === generation && video.currentTime < 1) video.currentTime = target }
        check()
        for (const delay of [100, 500, 1500]) seekTimers.push(setTimeout(() => { restorePlaybackRate(); check() }, delay))
      }
      video.addEventListener('loadedmetadata', restore, { once: true })
      video.addEventListener('canplay', confirmSeek, { once: true })
      metadataCleanup = () => { video.removeEventListener('loadedmetadata', restore); video.removeEventListener('canplay', confirmSeek) }
      const pending = attach(video, source, {
        tracks(value) {
          if (disposed || current !== generation) return
          engineOptions = value
          mergeTracks()
          if (engine) {
            if (previousSubtitle.startsWith('external:') && snapshot.subtitles.some((option) => option.value === previousSubtitle)) selectSubtitle(previousSubtitle)
            else preferredSubtitle()
            preferredAudio()
          }
        },
        fatal(reason, deliveryFailure) { if (current === generation) fail(reason, deliveryFailure) },
      }, controller.signal)
      // An engine arriving after timeout, switch, or unmount must never own the element.
      let disposedEngine: MediaEngine | undefined
      const disposeEngine = (value: MediaEngine) => {
        if (disposedEngine === value) return
        disposedEngine = value
        value.destroy()
      }
      void pending.then((late) => { if (disposed || current !== generation || controller.signal.aborted) disposeEngine(late) }, () => {})
      let abort = () => {}
      try {
        const attached = await Promise.race([pending, new Promise<never>((_, reject) => {
          abort = () => reject(controller.signal.reason)
          controller.signal.addEventListener('abort', abort, { once: true })
        })])
        if (disposed || current !== generation) { disposeEngine(attached); return }
        engine = attached
        mergeTracks()
        if (!metadataRestored && !firstFrame) startupTimer = setTimeout(() => { if (current === generation && !metadataRestored && !firstFrame) fail('network', 'timeout') }, FIRST_FRAME_TIMEOUT_MS)
        if (previousSubtitle.startsWith('external:') && snapshot.subtitles.some((option) => option.value === previousSubtitle)) selectSubtitle(previousSubtitle)
        else preferredSubtitle()
        preferredAudio()
      } catch {
        if (!disposed && current === generation && !controller.signal.aborted) fail('media')
        else if (!disposed && current === generation && controller.signal.reason?.name === 'TimeoutError') fail('network', 'timeout')
      } finally {
        clearTimeout(deadline)
        controller.signal.removeEventListener('abort', abort)
      }
    },
    play,
    setPlaybackRate(rate: number) {
      if (!Number.isFinite(rate) || rate <= 0) return
      preferredPlaybackRate = rate
      restorePlaybackRate()
    },
    quality(value: string) { if (snapshot.qualities.some((option) => option.value === value)) { engine?.quality(value); update({ quality: value }) } },
    audio(value: string) {
      const selected = snapshot.audio.find((option) => option.value === value)
      if (!selected) return
      audioPreference = selected.language || selected.label.toLowerCase()
      try { localStorage.setItem('consumit.player.audio-language', audioPreference) } catch { /* Optional storage. */ }
      engine?.audio(value); update({ audioTrack: value })
    },
    subtitle(value: string) {
      const selected = snapshot.subtitles.find((option) => option.value === value || option.language === value || option.label.toLowerCase() === value.toLowerCase())
      if (value !== 'off' && !selected) return
      const resolved = selected?.value ?? 'off'
      subtitlePreference = resolved === 'off' ? 'off' : selected?.language ?? 'en'
      try { localStorage.setItem('consumit.player.subtitle-language', subtitlePreference) } catch { /* Optional storage. */ }
      selectSubtitle(resolved)
    },
    externalSubtitles(entries: readonly ExternalTrack[]) {
      if (disposed) return
      const previous = snapshot.subtitleTrack
      replaceExternal(entries)
      mergeTracks()
      if (snapshot.subtitles.some((option) => option.value === previous)) selectSubtitle(previous)
      else preferredSubtitle()
    },
    destroy() {
      if (disposed) return
      disposed = true; generation++
      attachment?.abort(); metadataCleanup(); clearTimers()
      video.removeEventListener('playing', onPlaying)
      video.removeEventListener('waiting', onWaiting)
      video.removeEventListener('timeupdate', onTimeUpdate)
      video.removeEventListener('pause', onPause)
      video.removeEventListener('ended', onEnded)
      video.removeEventListener('error', onError)
      engine?.destroy(); tracks.forEach((track) => track.remove())
    },
  }
}
