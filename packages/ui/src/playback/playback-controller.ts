import { attachMediaEngine, type EngineTracks, type MediaEngine, type MediaOption } from './media-engine'
import { isSafeMediaUrl, type DirectMediaSource } from './media-source'

export type PlaybackPhase = 'loading' | 'ready' | 'playing' | 'paused' | 'buffering' | 'switching' | 'ended' | 'failed'
export type ControllerSnapshot = EngineTracks & {
  phase: PlaybackPhase; needsGesture: boolean; quality: string; audioTrack: string; subtitleTrack: string
}
export type ControllerEvent = { type: 'started' | 'buffer-start' | 'buffer-end' | 'error' | 'ended'; position: number; elapsedMs?: number }

/** One controller per media element; async engine loads are serialized and generation-guarded. */
export function createPlaybackController(video: HTMLVideoElement, callbacks: {
  change: (snapshot: ControllerSnapshot) => void
  fatal: (reason: 'network' | 'media' | 'gone') => void
  event?: (event: ControllerEvent) => void
}, attach = attachMediaEngine) {
  let engine: MediaEngine | undefined
  let generation = 0
  let destroyed = false
  let retries = 0
  let recoveryTimer: ReturnType<typeof setTimeout> | undefined
  let queue = Promise.resolve()
  let tracks: HTMLTrackElement[] = []
  let externalOptions: MediaOption[] = []
  let engineOptions: EngineTracks = { qualities: [{ value: 'auto', label: 'Auto' }], audio: [], subtitles: [] }
  function publishTracks() {
    if (destroyed) return
    // Engine subtitles (e.g. HLS manifest tracks) and external tracks share
    // one menu keyed by `value`. Guard the merge so a repeated engine publish
    // or an id collision can never emit duplicate values.
    const seen = new Set<string>()
    const subtitles = [...engineOptions.subtitles, ...externalOptions].filter((option) => {
      if (seen.has(option.value)) return false
      seen.add(option.value)
      return true
    })
    update({ ...engineOptions, subtitles })
  }
  /** First-party converted caption files live on the app origin under
   *  whatever scheme it uses (http in dev). Same-host files are ours, so
   *  they pass alongside strict-https upstream tracks. */
  function isPlayableSubtitleUrl(url: string): boolean {
    if (isSafeMediaUrl(url)) return true
    try {
      if (typeof window === 'undefined' || !window.location?.hostname) return false
      const parsed = new URL(url, window.location.href)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
      if (parsed.username || parsed.password) return false
      return parsed.hostname === window.location.hostname
    } catch {
      return false
    }
  }
  /**
   * The single owner of the external track list. The caller passes the
   * active source's tracks together with every aggregated extra track, so
   * server switches reconcile the menu instead of wiping it: tracks that
   * survive stay selected, vanished ones fall back to the language
   * preference. `load()` never touches these elements.
   */
  function appendExternal(entries: readonly { id: string; label: string; language: string; url: string }[]) {
    tracks.forEach((track) => track.remove()); tracks = []
    externalOptions = []
    // Backend sessions can still carry a duplicated subtitle id (e.g. a
    // carried lease track plus its fresh upstream twin share
    // `stellar-sub-0` with different URLs). Dedupe by id AND url here so
    // we never create two `<track id="consumit-external-...">` elements
    // with the same id, which surfaces as duplicate React keys downstream.
    const seenExternalIds = new Set<string>()
    const seenExternalUrls = new Set<string>()
    for (const entry of entries) {
      if (!isPlayableSubtitleUrl(entry.url)) continue
      if (seenExternalIds.has(entry.id) || seenExternalUrls.has(entry.url)) continue
      seenExternalIds.add(entry.id)
      seenExternalUrls.add(entry.url)
      const track = document.createElement('track')
      track.id = `consumit-external-${entry.id}`; track.kind = 'subtitles'; track.srclang = entry.language
      track.label = entry.label; track.src = entry.url
      track.default = false
      video.append(track); tracks.push(track)
      externalOptions.push({ value: `external:${track.id}`, label: track.label, language: entry.language })
    }
  }
  let subtitlePreference = 'en'
  let audioPreference = 'original'
  try { subtitlePreference = localStorage.getItem('consumit.player.subtitle-language') ?? 'en' } catch { /* Storage is optional. */ }
  try { audioPreference = localStorage.getItem('consumit.player.audio-language') ?? 'original' } catch { /* Storage is optional. */ }
  let metadataCleanup = () => {}
  let attachment: AbortController | undefined
  let startedAt = performance.now()
  let bufferedAt = 0
  let firstFrame = false
  let snapshot: ControllerSnapshot = { phase: 'loading', needsGesture: false, qualities: [{ value: 'auto', label: 'Auto' }], audio: [], subtitles: [], quality: 'auto', audioTrack: '', subtitleTrack: 'off' }
  function update(value: Partial<ControllerSnapshot>) { if (destroyed) return; snapshot = { ...snapshot, ...value }; callbacks.change(snapshot) }
  function event(type: ControllerEvent['type']) {
    const elapsedMs = Math.max(0, performance.now() - (type === 'buffer-end' ? bufferedAt : startedAt))
    if (!destroyed) callbacks.event?.({ type, position: Number.isFinite(video.currentTime) ? video.currentTime : 0, elapsedMs })
  }
  async function play() {
    const current = generation
    try { await video.play(); if (current === generation) update({ needsGesture: false }) }
    catch (error) {
      if (current !== generation || destroyed) return
      if (typeof error === 'object' && error !== null && 'name' in error && error.name === 'NotAllowedError') update({ phase: 'ready', needsGesture: true })
      else if (!destroyed) fatal('media')
    }
  }
  function fatal(reason: 'network' | 'media' | 'gone') {
    if (destroyed || snapshot.phase === 'failed') return
    if (retries++ === 0 && engine?.recover()) {
      update({ phase: 'buffering' })
      recoveryTimer = setTimeout(() => fatal(reason), 3000)
      return
    }
    clearTimeout(recoveryTimer); update({ phase: 'failed' }); event('error'); callbacks.fatal(reason)
  }
  function selectSubtitle(value: string) {
    engine?.subtitle(value.startsWith('external:') ? 'off' : value)
    // A track element without a TextTrack (e.g. in test DOMs) must never
    // crash selection; real browsers always provide one.
    tracks.forEach((track) => {
      const textTrack = track.track as TextTrack | undefined
      if (textTrack) {
        const isSelected = value === `external:${track.id}`
        textTrack.mode = isSelected ? 'showing' : 'disabled'
        track.default = isSelected
      }
    })
    if (typeof video.textTracks !== 'undefined') {
      Array.from(video.textTracks).forEach((textTrack) => {
        if (!textTrack.id.startsWith('consumit-external-')) {
          if (value === 'off' || value.startsWith('external:')) {
            textTrack.mode = 'disabled'
          } else if (textTrack.id === value || textTrack.language === value) {
            textTrack.mode = 'showing'
          }
        }
      })
    }
    update({ subtitleTrack: value })
  }
  function preferredSubtitle() {
    const match = snapshot.subtitles.find((option) =>
      option.language?.split('-')[0] === subtitlePreference.split('-')[0] ||
      option.label.toLowerCase() === subtitlePreference.toLowerCase()
    )
    selectSubtitle(subtitlePreference === 'off' ? 'off' : match?.value ?? 'off')
  }
  function subtitle(value: string) {
    let target = snapshot.subtitles.find((option) => option.value === value)
    if (!target && value !== 'off') {
      target = snapshot.subtitles.find(
        (option) =>
          option.value.toLowerCase() === value.toLowerCase() ||
          option.language?.toLowerCase() === value.toLowerCase() ||
          option.label.toLowerCase() === value.toLowerCase() ||
          (option.language && value.toLowerCase().startsWith(option.language.toLowerCase())),
      )
    }
    if (value !== 'off' && !target) return
    const resolvedValue = target ? target.value : 'off'
    subtitlePreference = resolvedValue === 'off' ? 'off' : target?.language ?? 'en'
    try { localStorage.setItem('consumit.player.subtitle-language', subtitlePreference) } catch { /* Storage is optional. */ }
    selectSubtitle(resolvedValue)
  }
  function preferredAudio() {
    const match = snapshot.audio.find((option) => option.language === audioPreference || option.label.toLowerCase() === audioPreference)
    if (match) { engine?.audio(match.value); update({ audioTrack: match.value }) }
  }
  function audio(value: string) {
    const option = snapshot.audio.find((entry) => entry.value === value)
    if (!option) return
    audioPreference = option.language || option.label.toLowerCase()
    try { localStorage.setItem('consumit.player.audio-language', audioPreference) } catch { /* Storage is optional. */ }
    engine?.audio(value); update({ audioTrack: value })
  }
  const listeners: [string, EventListener][] = [
    ['playing', () => { clearTimeout(recoveryTimer); const wasBuffering = snapshot.phase === 'buffering'; update({ phase: 'playing', needsGesture: false }); if (!firstFrame) { firstFrame = true; event('started') } else if (wasBuffering) event('buffer-end') }],
    ['pause', () => { clearTimeout(recoveryTimer); if (snapshot.phase !== 'switching' && snapshot.phase !== 'loading' && snapshot.phase !== 'failed') update({ phase: 'paused' }) }],
    ['waiting', () => { if (!video.paused && snapshot.phase !== 'failed') { if (snapshot.phase !== 'buffering') { bufferedAt = performance.now(); update({ phase: 'buffering' }); event('buffer-start') } clearTimeout(recoveryTimer); recoveryTimer = setTimeout(() => fatal('network'), 8000) } }],
    ['ended', () => { clearTimeout(recoveryTimer); update({ phase: 'ended' }); event('ended') }],
    ['error', () => fatal('media')],
  ]
  listeners.forEach(([name, listener]) => video.addEventListener(name, listener))

  return {
    async load(source: DirectMediaSource, position = 0, shouldPlay = false) {
      const current = ++generation
      startedAt = performance.now(); firstFrame = false
      attachment?.abort(); metadataCleanup()
      clearTimeout(recoveryTimer); retries = 0
      const previousSubtitle = snapshot.subtitleTrack
      update({ phase: engine ? 'switching' : 'loading', needsGesture: false, quality: 'auto', audioTrack: '', subtitleTrack: 'off', qualities: [{ value: 'auto', label: 'Auto' }], audio: [], subtitles: [] })
      queue = queue.catch(() => undefined).then(async () => {
        if (destroyed || current !== generation) return
        engine?.destroy(); engine = undefined
        attachment = new AbortController()
        const controller = attachment
        engineOptions = { qualities: [{ value: 'auto', label: 'Auto' }], audio: [], subtitles: [] }
        // External track elements stay owned by appendExternal (driven by
        // the caller's merged list): a source switch must reconcile the
        // shared menu, never wipe it. Republish so the fresh engine tracks
        // join the surviving external set immediately.
        publishTracks()
        const restore = () => {
          if (destroyed || current !== generation) return
          if (Number.isFinite(position) && position > 0 && Number.isFinite(video.duration)) video.currentTime = Math.min(position, Math.max(0, video.duration - 0.25))
          update({ phase: 'ready' })
          if (shouldPlay) void play()
        }
        video.addEventListener('loadedmetadata', restore, { once: true })
        metadataCleanup = () => video.removeEventListener('loadedmetadata', restore)
        const deadline = setTimeout(() => controller.abort(new DOMException('Player loading timed out.', 'TimeoutError')), 8000)
        const pending = attach(video, source, {
          tracks(next) {
            if (current !== generation || destroyed) return
            engineOptions = next
            publishTracks()
            if (engine) {
              // A server switch must not steal an explicit caption pick:
              // when the previous external track survives the reload, keep
              // it instead of re-solving the language preference.
              const kept = previousSubtitle.startsWith('external:') &&
                snapshot.subtitles.some((option) => option.value === previousSubtitle)
              if (kept) selectSubtitle(previousSubtitle)
              else preferredSubtitle()
              preferredAudio()
            }
          },
          fatal(reason) { if (current === generation) fatal(reason) },
        }, controller.signal)
        let settled = false
        const settle = (late: MediaEngine) => {
          // An attachment that resolves after its generation lost (abort race,
          // supersede, unmount) would otherwise leak a live engine instance.
          if (settled) return
          settled = true
          if (current !== generation || destroyed || controller.signal.aborted) late.destroy()
        }
        void pending.then(settle, () => {})
        let abort = () => {}
        const attached = await Promise.race([pending, new Promise<never>((_, reject) => {
          abort = () => reject(controller.signal.reason)
          controller.signal.addEventListener('abort', abort, { once: true })
        })]).finally(() => { clearTimeout(deadline); controller.signal.removeEventListener('abort', abort) })
        if (destroyed || current !== generation) { video.removeEventListener('loadedmetadata', restore); settle(attached); return }
        engine = {
          ...attached,
          destroy() { video.removeEventListener('loadedmetadata', restore); attached.destroy() },
        }
        // The tracks callback above runs before any engine exists, so an
        // explicit pick can only be honored here: when the pre-load
        // external track survives the reload, keep it instead of
        // re-solving the language preference. Otherwise solve the
        // preference (first-load auto-select takes this branch).
        const reselected = previousSubtitle.startsWith('external:') &&
          snapshot.subtitles.some((option) => option.value === previousSubtitle)
        if (reselected) selectSubtitle(previousSubtitle)
        else preferredSubtitle()
        preferredAudio()
        if (video.readyState >= 1) { video.removeEventListener('loadedmetadata', restore); restore() }
      }).catch(() => { if (current === generation && !destroyed) { metadataCleanup(); fatal('media') } })
      await queue
    },
    play,
    quality(value: string) { if (snapshot.qualities.some((option) => option.value === value)) { engine?.quality(value); update({ quality: value }) } },
    audio,
    subtitle,
    /** Replace the external caption set without reloading media: late tracks
     *  (e.g. other providers' subtitles arriving after first frame) join the
     *  menu live. The current selection survives when still offered. */
    externalSubtitles(entries: readonly { id: string; label: string; language: string; url: string }[]) {
      if (destroyed) return
      const previous = snapshot.subtitleTrack
      appendExternal(entries)
      publishTracks()
      if (snapshot.subtitles.some((option) => option.value === previous)) selectSubtitle(previous)
      else preferredSubtitle()
    },
    destroy() {
      destroyed = true; generation++; clearTimeout(recoveryTimer)
      attachment?.abort(); metadataCleanup()
      listeners.forEach(([name, listener]) => video.removeEventListener(name, listener))
      engine?.destroy(); engine = undefined; tracks.forEach((track) => track.remove()); tracks = []
    },
  }
}
