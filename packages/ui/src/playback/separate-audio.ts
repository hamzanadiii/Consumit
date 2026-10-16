import { isSafeMediaUrl } from './media-source'
import { createVolumeBoost } from './volume-boost'
export type SeparateAudioTrack = { id: string; label: string; language: string; provider: string }
export type SeparateAudioSource = SeparateAudioTrack & { src: string; duration: number; expiresAt: string }
export type SeparateAudioState = { track: SeparateAudioSource | null; loading: boolean; active: boolean; error: string | null; offset: number; warning?: string | null; needsGesture?: boolean }
type AudioEngine = { destroy(): void }
export async function attachSeparateAudio(audio: HTMLAudioElement, source: SeparateAudioSource, fail: () => void, signal: AbortSignal, startPosition = 0): Promise<AudioEngine> {
  if (!isSafeMediaUrl(source.src)) throw new Error('Unsafe audio source')
  const { default: Hls } = await import('hls.js')
  signal.throwIfAborted()
  if (!Hls.isSupported()) {
    if (!audio.canPlayType('application/vnd.apple.mpegurl')) throw new Error('Audio is unsupported')
    audio.src = source.src
    return { destroy() { audio.removeAttribute('src'); audio.load() } }
  }
  const hls = new Hls({ enableWorker: true, progressive: false, backBufferLength: 15, maxBufferLength: 30, startPosition })
  hls.on(Hls.Events.BUFFER_CODECS, (_event, tracks) => { if (tracks.video || tracks.audiovideo) fail() })
  hls.on(Hls.Events.ERROR, (_event, data) => { if (data.fatal) fail() })
  hls.loadSource(source.src); hls.attachMedia(audio)
  return { destroy() { hls.destroy(); audio.removeAttribute('src'); audio.load() } }
}

/** Prepare a replacement independently; commit only after playback starts. */
export function createSeparateAudioPlayer(video: HTMLVideoElement, first: HTMLAudioElement, options: {
  output(value: 0 | 1): Promise<void>; state(value: SeparateAudioState): void;
  attach?: typeof attachSeparateAudio; boost?: ReturnType<typeof createVolumeBoost>;
}) {
  type Channel = { audio: HTMLAudioElement; track: SeparateAudioSource; request: AbortController; engine?: AudioEngine; timer?: ReturnType<typeof setTimeout>; boost: ReturnType<typeof createVolumeBoost>; cleanup(): void; finish(ok: boolean): void; starting: boolean }
  let active: Channel | null = null, pending: Channel | null = null, disposed = false, stalled = false, boostLevel = 1
  let state: SeparateAudioState = { track: null, loading: false, active: false, error: null, offset: 0 }
  const emit = (patch: Partial<SeparateAudioState>) => { state = { ...state, ...patch }; if (!disposed) options.state(state) }
  const release = (channel: Channel) => {
    channel.request.abort(); clearTimeout(channel.timer); channel.cleanup(); channel.audio.pause(); channel.engine?.destroy()
    if (channel.audio !== first || !options.boost) channel.boost.dispose()
    channel.finish(false)
  }
  const reject = (channel: Channel, message = 'This recording could not play. Your previous audio is still selected.') => {
    if (channel === pending) { pending = null; release(channel); void options.output(active ? 0 : 1).catch(() => {}); emit({ loading: false, needsGesture: false, error: message }) }
    else if (channel === active) { active = null; release(channel); void options.output(1).catch(() => {}); emit({ track: null, active: false, error: 'The added audio stalled or stopped. Stream audio has been restored.' }) }
  }
  const volume = () => { if (active) { active.audio.volume = video.volume; active.audio.muted = video.muted } }
  const sync = (force = false) => {
    if (!active || disposed) return
    const channel = active, audio = channel.audio, target = Math.max(0, video.currentTime + state.offset), drift = target - audio.currentTime
    volume()
    if (force || Math.abs(drift) > .35) audio.currentTime = target
    audio.playbackRate = video.playbackRate * (Math.abs(drift) > .05 && !force ? 1 + Math.max(-.02, Math.min(.02, drift * .1)) : 1)
    if (video.paused || video.ended || stalled || video.currentTime + state.offset < 0) audio.pause()
    else if (audio.paused) void audio.play().catch(() => reject(channel))
  }
  const activate = async (channel: Channel) => {
    if (channel !== pending || channel.starting || disposed) return
    const difference = Math.abs(video.duration - channel.track.duration)
    if (Number.isFinite(difference) && difference > Math.max(2, Math.min(30, video.duration * .01))) { reject(channel, 'This recording has a different length. Your previous audio has been kept.'); return }
    channel.starting = true
    try {
      channel.audio.currentTime = Math.max(0, video.currentTime)
      channel.audio.volume = 0
      // Resolve play before muting the old channel, including browser-policy rejection.
      await channel.audio.play()
      if (pending !== channel || disposed) return
      await channel.boost.set(boostLevel)
      await options.output(0)
      if (pending !== channel || disposed) { await options.output(active ? 0 : 1); return }
      const previous = active; active = channel; pending = null
      if (previous) release(previous)
      clearTimeout(channel.timer)
      emit({ track: channel.track, active: true, loading: false, needsGesture: false, error: null, offset: 0, warning: difference > 2 ? `Recordings differ by ${difference.toFixed(1)}s. Adjust audio sync if needed.` : null })
      sync(true); channel.finish(true)
    } catch (error) {
      if (pending !== channel) return
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        clearTimeout(channel.timer)
        emit({ loading: false, needsGesture: true, error: 'Your browser needs another tap to enable audio.' })
        channel.finish(false)
        channel.timer = setTimeout(() => reject(channel), 60_000)
      } else reject(channel)
    } finally { channel.starting = false }
  }
  const pause = () => active?.audio.pause()
  const waiting = () => { stalled = true; pause() }
  const seek = () => { stalled = true; sync(true); pause() }
  const playing = () => { stalled = false; sync(true) }
  const update = () => sync()
  const listeners: Array<[string, EventListener]> = [['play', update], ['pause', pause], ['ended', pause], ['seeking', seek], ['seeked', playing], ['playing', playing], ['waiting', waiting], ['timeupdate', update], ['ratechange', update], ['volumechange', volume]]
  listeners.forEach(([name, handler]) => video.addEventListener(name, handler))
  const interval = setInterval(update, 250)
  const reset = () => {
    const oldPending = pending, oldActive = active; pending = active = null
    if (oldPending) release(oldPending)
    if (oldActive) release(oldActive)
    void options.output(1).catch(() => {})
    emit({ track: null, loading: false, active: false, needsGesture: false, error: null, offset: 0, warning: null })
  }
  return {
    select(track: SeparateAudioSource): Promise<boolean> {
      if (disposed) return Promise.resolve(false)
      if (pending) { const previous = pending; pending = null; release(previous) }
      const audio = active?.audio === first ? document.createElement('audio') : first
      audio.crossOrigin = 'anonymous'; audio.preload = 'auto'
      return new Promise(resolve => {
        const channel: Channel = { audio, track, request: new AbortController(), boost: audio === first && options.boost ? options.boost : createVolumeBoost(audio), cleanup() {}, finish: resolve, starting: false }
        pending = channel
        const ready = () => { void activate(channel) }
        const fail = () => reject(channel)
        const stalled = () => { if (active === channel) { clearTimeout(channel.timer); channel.timer = setTimeout(() => reject(channel), 4000) } }
        const started = () => { if (active === channel) clearTimeout(channel.timer) }
        const ended = () => { if (!video.ended && video.duration - video.currentTime > 2) reject(channel) }
        const events: Array<[string, EventListener]> = [['canplay', ready], ['error', fail], ['waiting', stalled], ['playing', started], ['ended', ended]]
        events.forEach(([name, handler]) => audio.addEventListener(name, handler))
        channel.cleanup = () => events.forEach(([name, handler]) => audio.removeEventListener(name, handler))
        emit({ loading: true, error: null, needsGesture: false })
        channel.timer = setTimeout(fail, 12_000)
        void (options.attach ?? attachSeparateAudio)(audio, track, fail, channel.request.signal, Math.max(0, video.currentTime)).then(engine => {
          if (channel !== pending || disposed) engine.destroy()
          else { channel.engine = engine; if (audio.readyState >= 3) ready() }
        }, fail)
      })
    },
    enable() { return pending ? activate(pending) : Promise.resolve() },
    needsGesture() { return Boolean(state.needsGesture) },
    currentTrack() { return active?.track },
    reset,
    offset(seconds: number) { emit({ offset: Math.max(-30, Math.min(30, seconds)) }); sync(true) },
    async boost(value: number) { boostLevel = value; return active ? active.boost.set(value) : value },
    dispose() { disposed = true; reset(); clearInterval(interval); listeners.forEach(([name, handler]) => video.removeEventListener(name, handler)) },
  }
}
