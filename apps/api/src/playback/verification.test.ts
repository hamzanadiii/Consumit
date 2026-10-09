import { describe, expect, it, vi } from 'vitest'
import { createMemoryPlaybackStore } from './state.ts'
import { createPlaybackVerification } from './verification.ts'

const config = { secret: 'verification-test-secret-only', hostname: 'consumit.online' }
describe('guest playback verification', () => {
  it('requires proof and expires verification without refreshing its lifetime on reads', async () => {
    let now = 1000
    const store = createMemoryPlaybackStore(() => now)
    const fetcher = vi.fn<(input: string, init: RequestInit) => Promise<Response>>(async () => Response.json({ success: true, hostname: config.hostname, action: 'playback' }))
    const gate = createPlaybackVerification(store, config, fetcher)
    await expect(gate.verify('viewer')).rejects.toMatchObject({ code: 'PLAYBACK_VERIFICATION_REQUIRED' })
    await gate.verify('viewer', 'token')
    await gate.verify('viewer')
    expect(fetcher).toHaveBeenCalledTimes(1)
    now += 4 * 3600000
    await expect(gate.verify('viewer')).rejects.toMatchObject({ code: 'PLAYBACK_VERIFICATION_REQUIRED' })
  })
  it.each([{ success: false }, { success: true, hostname: 'other.example', action: 'playback' }, { success: true, hostname: config.hostname, action: 'login' }])('rejects invalid or mis-scoped verification', async response => {
    const gate = createPlaybackVerification(createMemoryPlaybackStore(), config, async () => Response.json(response))
    await expect(gate.verify('viewer', 'token')).rejects.toMatchObject({ code: 'PLAYBACK_VERIFICATION_REQUIRED' })
  })
  it('fails closed on a five-second timeout without retrying ambiguous verification', async () => {
    const fetcher = vi.fn<(input: string, init: RequestInit) => Promise<Response>>(async (_url, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener('abort', () => reject(new Error('timeout')), { once: true })
    }))
    const started = Date.now()
    await expect(createPlaybackVerification(createMemoryPlaybackStore(), config, fetcher).verify('viewer', 'token')).rejects.toMatchObject({ code: 'PLAYBACK_UNAVAILABLE' })
    expect(Date.now() - started).toBeLessThan(6000)
    expect(fetcher).toHaveBeenCalledTimes(1)
  }, 10000)
  it('atomically consumes a handoff and rejects expired records', async () => {
    let now = 1000
    const store = createMemoryPlaybackStore(() => now)
    await store.set('handoff', 'proof', 60)
    expect(await Promise.all([store.take('handoff'), store.take('handoff')])).toEqual(['proof', null])
    await store.set('handoff', 'proof', 60)
    now += 60000
    expect(await store.take('handoff')).toBeNull()
  })
})
