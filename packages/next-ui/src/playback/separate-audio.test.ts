import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSeparateAudioPlayer, type SeparateAudioState } from './separate-audio'

afterEach(() => vi.useRealTimers())
const track = { id: 'hindi', label: 'Hindi', language: 'hi', provider: 'Apogee', src: 'https://media.example/audio.m3u8', duration: 120, expiresAt: '2099-01-01T00:00:00.000Z' }
function fixture() {
  const video = document.createElement('video'), audio = document.createElement('audio')
  Object.defineProperty(video, 'duration', { configurable: true, value: 120 })
  Object.defineProperty(video, 'paused', { configurable: true, value: false })
  video.src = 'https://media.example/video.m3u8'; video.currentTime = 40; video.volume = 0.4
  const play = vi.spyOn(audio, 'play').mockResolvedValue(); const pause = vi.spyOn(audio, 'pause').mockImplementation(() => {})
  const state = vi.fn<(value: SeparateAudioState) => void>(), output = vi.fn(async (value: 0 | 1) => { void value })
  const destroy = vi.fn(), attach = vi.fn(async () => ({ destroy })), boost = { set: vi.fn(async (n: number) => n), output: vi.fn(async () => {}), dispose: vi.fn() }
  const player = createSeparateAudioPlayer(video, audio, { state, output, attach, boost })
  return { video, audio, player, state, output, play, pause, destroy, attach }
}
async function ready(f: ReturnType<typeof fixture>) { await f.player.select(track); f.audio.currentTime = f.video.currentTime; f.audio.dispatchEvent(new Event('canplay')); await Promise.resolve(); await Promise.resolve() }
describe('independent audio playback', () => {
  it('changes only sound and follows seeking, pause, rate, volume and mute', async () => {
    const f = fixture(); await ready(f)
    expect(f.output).toHaveBeenLastCalledWith(0)
    expect(f.audio.currentTime).toBe(40)
    expect(f.video.src).toBe('https://media.example/video.m3u8')
    expect(f.video.volume).toBe(0.4); expect(f.video.muted).toBe(false)
    f.video.currentTime = 95; f.video.dispatchEvent(new Event('seeking')); expect(f.audio.currentTime).toBe(95)
    f.video.playbackRate = 1.5; f.video.dispatchEvent(new Event('seeked')); expect(f.audio.playbackRate).toBe(1.5)
    f.video.muted = true; f.video.dispatchEvent(new Event('volumechange')); expect(f.audio.muted).toBe(true)
    f.video.dispatchEvent(new Event('pause')); expect(f.pause).toHaveBeenCalled()
    f.player.offset(-1.2); expect(f.audio.currentTime).toBe(93.8)
    f.player.reset(); expect(f.output).toHaveBeenLastCalledWith(1); expect(f.destroy).toHaveBeenCalledOnce()
    f.player.dispose()
  })
  it('rejects a different recording length before suppressing the main audio', async () => {
    const f = fixture(); await f.player.select({ ...track, duration: 130 }); f.audio.dispatchEvent(new Event('canplay')); await Promise.resolve()
    expect(f.output).not.toHaveBeenCalledWith(0)
    expect(f.state).toHaveBeenLastCalledWith(expect.objectContaining({ active: false, error: expect.stringContaining('different length') }))
    f.player.dispose()
  })
  it('restores main audio after an external stall without touching the video source', async () => {
    vi.useFakeTimers(); const f = fixture(); await ready(f)
    f.audio.dispatchEvent(new Event('waiting')); await vi.advanceTimersByTimeAsync(4000)
    expect(f.output).toHaveBeenLastCalledWith(1)
    expect(f.state).toHaveBeenLastCalledWith(expect.objectContaining({ active: false, error: expect.stringContaining('stalled') }))
    expect(f.video.currentTime).toBe(40); expect(f.video.src).toBe('https://media.example/video.m3u8'); f.player.dispose()
  })
  it('ignores late attachment and never plays a cancelled track', async () => {
    const f = fixture(); let finish!: (v: { destroy: typeof f.destroy }) => void
    f.attach.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const selected = f.player.select(track); f.player.reset(); finish({ destroy: f.destroy }); await selected
    expect(f.destroy).toHaveBeenCalledOnce(); expect(f.output).not.toHaveBeenCalledWith(0); expect(f.play).not.toHaveBeenCalled(); f.player.dispose()
  })
})
