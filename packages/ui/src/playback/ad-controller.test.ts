import { describe, expect, it, vi } from 'vitest'
import { createAdController } from './ad-controller'

describe('ad controller', () => {
  it('stays idle without a slot and never blocks content', async () => {
    const event = vi.fn()
    const controller = createAdController({ event })
    await expect(controller.load()).resolves.toBe('idle')
    expect(controller.phase).toBe('idle')
    expect(event).not.toHaveBeenCalled()
    controller.destroy()
  })
  it('fails open when the ad request throws', async () => {
    const event = vi.fn()
    const controller = createAdController({ event }, async () => { throw new Error('ad outage') })
    await expect(controller.load({ id: 'pre-roll' })).resolves.toBe('idle')
    expect(controller.phase).toBe('failed')
    expect(event).toHaveBeenCalledWith({ type: 'ad-error', slot: 'pre-roll' })
    controller.destroy()
  })
  it('reports successful slots without touching media state', async () => {
    const event = vi.fn()
    const controller = createAdController({ event }, async () => undefined)
    await expect(controller.load({ id: 'pre-roll' })).resolves.toBe('done')
    expect(event).toHaveBeenCalledWith({ type: 'ad-start', slot: 'pre-roll' })
    expect(event).toHaveBeenCalledWith({ type: 'ad-end', slot: 'pre-roll' })
    controller.destroy()
  })
  it('abandons late ad loads after destroy', async () => {
    let finish: () => void = () => undefined
    const controller = createAdController({}, () => new Promise<void>((resolve) => { finish = resolve }))
    const pending = controller.load({ id: 'pre-roll' })
    controller.destroy()
    finish()
    await expect(pending).resolves.toBe('idle')
  })
})
