import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAudioSwitch } from './audio-switch'
afterEach(() => vi.useRealTimers())
describe('stream audio activation', () => {
  it('waits for engine buffering and clock movement before saving a switch', async () => {
    const video = document.createElement('video'), apply = vi.fn(), restore = vi.fn()
    Object.defineProperty(video, 'paused', { value: false }); Object.defineProperty(video, 'readyState', { value: 4 })
    const switching = createAudioSwitch(video); let buffered!: () => void
    const activated = switching.select(apply, restore, ready => { buffered = ready; return () => {} })
    const settled = vi.fn(); void activated.then(settled)
    video.currentTime = 1; video.dispatchEvent(new Event('timeupdate')); await Promise.resolve(); expect(settled).not.toHaveBeenCalled()
    buffered(); video.currentTime = 2; video.dispatchEvent(new Event('timeupdate'))
    expect(await activated).toBe(true); expect(restore).not.toHaveBeenCalled(); switching.dispose()
  })
  it('restores the previous stream track on timeout and cancels stale selections', async () => {
    vi.useFakeTimers(); const video = document.createElement('video'), restore = vi.fn(), switching = createAudioSwitch(video)
    const first = switching.select(() => {}, restore)
    const second = switching.select(() => {}, restore)
    expect(await first).toBe(false)
    await vi.advanceTimersByTimeAsync(8000)
    expect(await second).toBe(false); expect(restore).toHaveBeenCalledTimes(2); switching.dispose()
  })
})
