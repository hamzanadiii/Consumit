import { describe, expect, it, vi } from 'vitest'
import { createVolumeBoost } from './volume-boost'

function audioFixture(resume = vi.fn(async () => {})) {
  const gain = { gain: { value: 1, setTargetAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() }
  const source = { connect: vi.fn(), disconnect: vi.fn() }
  const context = { resume, close: vi.fn(async () => {}), state: 'running', currentTime: 2, destination: {}, createGain: vi.fn(() => gain), createMediaElementSource: vi.fn(() => source) }
  const factory = vi.fn(() => context as unknown as AudioContext)
  const video = document.createElement('video')
  video.src = '/movie.mp4'
  video.volume = 0.4
  video.muted = true
  return { video, context, gain, source, factory, boost: createVolumeBoost(video, factory) }
}

describe('volume boost', () => {
  it('suppresses main sound independently of native volume, mute and chosen boost', async () => {
    const f = audioFixture()
    await f.boost.output(0)
    expect(f.gain.gain.value).toBe(0)
    await f.boost.set(3)
    expect(f.gain.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 2, 0.015)
    await f.boost.output(1)
    expect(f.gain.gain.value).toBe(3)
    expect(f.video.volume).toBe(0.4); expect(f.video.muted).toBe(true)
    expect(f.context.createMediaElementSource).toHaveBeenCalledOnce(); f.boost.dispose()
  })
  it('leaves normal audio untouched until amplification is requested', async () => {
    const f = audioFixture()
    expect(await f.boost.set(1)).toBe(1)
    expect(f.factory).not.toHaveBeenCalled()
    expect(f.video.volume).toBe(0.4)
    expect(f.video.muted).toBe(true)
    f.boost.dispose()
  })

  it('resumes before routing audio, reuses one source across renewals, and restores unity gain', async () => {
    const f = audioFixture()
    expect(await f.boost.set(3)).toBe(3)
    expect(f.context.resume.mock.invocationCallOrder[0]).toBeLessThan(f.context.createMediaElementSource.mock.invocationCallOrder[0]!)
    expect(f.source.connect).toHaveBeenCalledWith(f.gain)
    expect(f.gain.connect).toHaveBeenCalledWith(f.context.destination)
    expect(f.gain.gain.setTargetAtTime).toHaveBeenLastCalledWith(3, 2, 0.015)
    f.video.src = '/renewed.mp4'
    await f.boost.set(20)
    expect(f.factory).toHaveBeenCalledTimes(1)
    expect(f.context.createMediaElementSource).toHaveBeenCalledTimes(1)
    await f.boost.set(1)
    expect(f.gain.gain.setTargetAtTime).toHaveBeenLastCalledWith(1, 2, 0.015)
    expect(f.video.volume).toBe(0.4)
    expect(f.video.muted).toBe(true)
    f.boost.dispose()
    expect(f.source.disconnect).toHaveBeenCalledOnce()
    expect(f.context.close).toHaveBeenCalledOnce()
  })

  it('keeps normal media audio when browser activation fails and permits retry', async () => {
    const f = audioFixture(vi.fn().mockRejectedValueOnce(new Error('Activation denied')).mockResolvedValue(undefined))
    await expect(f.boost.set(2)).rejects.toThrow('Activation denied')
    expect(f.context.createMediaElementSource).not.toHaveBeenCalled()
    expect(f.video.volume).toBe(0.4)
    expect(await f.boost.set(2)).toBe(2)
    f.boost.dispose()
  })

  it('shares pending initialization and applies the latest slider value', async () => {
    let activate!: () => void
    const f = audioFixture(vi.fn(() => new Promise<void>((resolve) => { activate = resolve })))
    const first = f.boost.set(3)
    const latest = f.boost.set(1.5)
    activate()
    expect(await first).toBe(1.5)
    expect(await latest).toBe(1.5)
    expect(f.context.createMediaElementSource).toHaveBeenCalledOnce()
    f.boost.dispose()
  })

  it('does not reroute media if it is disposed during activation', async () => {
    let activate!: () => void
    const f = audioFixture(vi.fn(() => new Promise<void>((resolve) => { activate = resolve })))
    const pending = f.boost.set(3)
    f.boost.dispose()
    activate()
    expect(await pending).toBe(1)
    expect(f.context.createMediaElementSource).not.toHaveBeenCalled()
    expect(f.context.close).toHaveBeenCalledOnce()
  })

  it('rejects cross-origin media without CORS before touching its audio', async () => {
    const f = audioFixture()
    f.video.src = 'https://media.example/movie.mp4'
    await expect(f.boost.set(3)).rejects.toThrow('CORS-enabled')
    expect(f.factory).not.toHaveBeenCalled()
    f.boost.dispose()
  })
})
