import { isSafeMediaUrl } from './media-source'
import { createVolumeBoost } from './volume-boost'
export type SeparateAudioTrack = { id: string; label: string; language: string; provider: string }
export type SeparateAudioSource = SeparateAudioTrack & { src: string; duration: number; expiresAt: string }

export type SeparateAudioState = { track: SeparateAudioSource | null; loading: boolean; active: boolean; error: string | null; offset: number; warning?: string | null }
type AudioEngine = { destroy(): void }
export async function attachSeparateAudio(audio: HTMLAudioElement, source: SeparateAudioSource, fail: () => void, signal: AbortSignal, startPosition = 0): Promise<AudioEngine> {
  if (!isSafeMediaUrl(source.src)) throw new Error('Unsafe audio source')
  const { default: Hls } = await import('hls.js')
  signal.throwIfAborted()
  if (!Hls.isSupported()) throw new Error('Separate audio requires Media Source support')
  const hls = new Hls({ enableWorker: true, progressive: false, backBufferLength: 15, maxBufferLength: 30, startPosition })
  hls.on(Hls.Events.BUFFER_CODECS, (_event, tracks) => {
    // A playlist URL alone never establishes audio-only delivery.
    if (tracks.video || tracks.audiovideo) fail()
  })
  hls.on(Hls.Events.ERROR, (_event, data) => { if (data.fatal) fail() })
  hls.loadSource(source.src); hls.attachMedia(audio)
  return { destroy() { hls.destroy(); audio.removeAttribute('src'); audio.load() } }
}

/** Optional second media element. The primary video is never reattached. */
export function createSeparateAudioPlayer(video: HTMLVideoElement, audio: HTMLAudioElement, options: {
  output(value: 0 | 1): Promise<void>; state(value: SeparateAudioState): void;
  attach?: typeof attachSeparateAudio; boost?: ReturnType<typeof createVolumeBoost>;
}) {
  let engine: AudioEngine | null = null, request: AbortController | null = null
  let generation = 0, stalled = false, switching = false, disposed = false
  let timer: ReturnType<typeof setTimeout> | undefined
  let value: SeparateAudioState = { track: null, loading: false, active: false, error: null, offset: 0 }
  const boost = options.boost ?? createVolumeBoost(audio)
  const emit = (patch: Partial<SeparateAudioState>) => { value = { ...value, ...patch }; if (!disposed) options.state(value) }
  const release = () => {
    generation++; request?.abort(); request = null; clearTimeout(timer); audio.pause(); engine?.destroy(); engine = null
    void options.output(1).catch(() => {})
  }
  const fail = (message = 'This audio could not play. The stream’s own audio has been restored.') => {
    if (!value.track || disposed) return
    release(); emit({ track: null, active: false, loading: false, error: message })
  }
  const volume = () => { audio.volume = video.volume; audio.muted = video.muted }
  const sync = (force = false) => {
    if (!value.active || disposed) return
    volume()
    const target = Math.max(0, video.currentTime + value.offset), drift = target - audio.currentTime
    if (force || Math.abs(drift) > 0.35) audio.currentTime = target
    audio.playbackRate = video.playbackRate * (Math.abs(drift) > 0.05 && !force ? 1 + Math.max(-0.02, Math.min(0.02, drift * 0.1)) : 1)
    if (video.paused || video.ended || stalled || video.currentTime + value.offset < 0) audio.pause()
    else if (audio.paused) void audio.play().catch(() => fail())
  }
  const pause = () => audio.pause()
  const seek = () => { stalled = true; sync(true); audio.pause() }
  const playing = () => { stalled = false; sync(true) }
  const waiting = () => { stalled = true; audio.pause() }
  const update = () => sync()
  const ready = async () => {
    if (!value.track || !value.loading || switching) return
    // Gross mismatches cannot be corrected by the bounded sync control. A
    // close duration is only a rejection guard, not proof of the same cut.
    const difference = Math.abs(video.duration - value.track.duration)
    if (Number.isFinite(video.duration) && difference > Math.max(2, Math.min(30, video.duration * 0.01))) {
      fail('This recording has a different length. The stream’s own audio has been kept.'); return
    }
    if (Number.isFinite(difference) && difference > 2) emit({ warning: `Recordings differ by ${difference.toFixed(1)}s. Adjust audio sync if dialogue does not match.` })
    const current = generation
    // Reach the current video position while its own sound is still audible.
    const target = Math.max(0, video.currentTime + value.offset)
    if (Math.abs(audio.currentTime - target) > 0.35) { audio.currentTime = target; return }
    switching = true
    try {
      await options.output(0)
      if (current !== generation || disposed) { await options.output(value.active ? 0 : 1); return }
      clearTimeout(timer); emit({ active: true, loading: false }); sync(true)
    } catch { fail('Separate audio is unavailable in this browser. The stream’s own audio has been kept.') }
    finally { switching = false }
  }
  const audioWaiting = () => {
    if (!value.active) return
    clearTimeout(timer); timer = setTimeout(() => fail('The added audio stalled. The stream’s own audio has been restored.'), 4000)
  }
  const audioPlaying = () => { clearTimeout(timer) }
  const ended = () => { if (!video.ended && video.duration - video.currentTime > 2) fail() }
  const listeners: Array<[HTMLMediaElement, string, EventListener]> = [
    [video, 'play', update], [video, 'pause', pause], [video, 'ended', pause], [video, 'seeking', seek], [video, 'seeked', playing],
    [video, 'playing', playing], [video, 'waiting', waiting], [video, 'timeupdate', update], [video, 'ratechange', update], [video, 'volumechange', volume],
    [audio, 'canplay', ready], [audio, 'error', () => fail()], [audio, 'waiting', audioWaiting], [audio, 'playing', audioPlaying], [audio, 'ended', ended],
  ]
  listeners.forEach(([element, name, handler]) => element.addEventListener(name, handler))
  const interval = setInterval(() => sync(), 250)
  return {
    async select(track: SeparateAudioSource) {
      release(); emit({ track, loading: true, active: false, error: null, offset: 0, warning: null })
      request = new AbortController(); const current = generation
      timer = setTimeout(() => fail(), 12000)
      try {
        const attached = await (options.attach ?? attachSeparateAudio)(audio, track, () => { if (current === generation) fail() }, request.signal, Math.max(0, video.currentTime))
        if (current !== generation || disposed) attached.destroy(); else engine = attached
      } catch { if (current === generation) fail() }
    },
    reset() { release(); emit({ track: null, loading: false, active: false, error: null, offset: 0, warning: null }) },
    offset(seconds: number) { emit({ offset: Math.max(-30, Math.min(30, seconds)) }); sync(true) },
    boost(value: number) { return boost.set(value) },
    dispose() { disposed = true; release(); clearInterval(interval); listeners.forEach(([element, name, handler]) => element.removeEventListener(name, handler)); if (!options.boost) boost.dispose() },
  }
}
