import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createValkeyPlaybackStore } from './state.ts'

describe('shared playback recovery claims', () => {
  it('admits one API instance at a time and checks ownership on release', async () => {
    const first = createValkeyPlaybackStore(process.env.VALKEY_URL!)
    const second = createValkeyPlaybackStore(process.env.VALKEY_URL!)
    const key = `test-recovery:${randomUUID()}`
    try {
      const claims = await Promise.all([first.claim(key, 'first', 5), second.claim(key, 'second', 5)])
      expect(claims.filter(Boolean)).toHaveLength(1)
      const winner = claims[0] ? first : second
      const loser = claims[0] ? second : first
      const winnerToken = claims[0] ? 'first' : 'second'
      const loserToken = claims[0] ? 'second' : 'first'
      await loser.release(key, loserToken)
      expect(await loser.claim(key, loserToken, 5)).toBe(false)
      await winner.release(key, winnerToken)
      expect(await loser.claim(key, loserToken, 5)).toBe(true)
      await loser.release(key, loserToken)
    } finally { await first.close(); await second.close() }
  })
})
