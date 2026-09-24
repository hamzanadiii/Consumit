import { describe, expect, it } from 'vitest'
import { createMemoryPlaybackStore } from './state.ts'

describe('playback recovery claims', () => {
  it('admits one claimant and only its token can release the lock', async () => {
    let now = 0
    const store = createMemoryPlaybackStore(() => now)
    expect(await store.claim('recovery:one', 'first', 30)).toBe(true)
    expect(await store.claim('recovery:one', 'second', 30)).toBe(false)
    await store.release('recovery:one', 'second')
    expect(await store.claim('recovery:one', 'second', 30)).toBe(false)
    await store.release('recovery:one', 'first')
    expect(await store.claim('recovery:one', 'second', 30)).toBe(true)
    now = 31_000
    expect(await store.claim('recovery:one', 'third', 30)).toBe(true)
    await store.release('recovery:one', 'second')
    expect(await store.claim('recovery:one', 'fourth', 30)).toBe(false)
  })
})
