import { Valkey } from 'iovalkey'
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createValkeyAuthState } from './valkey-auth-state.ts'

const url = process.env.VALKEY_URL
const pepper = process.env.AUTH_CODE_PEPPER
if (!url || !pepper) throw new Error('VALKEY_URL and AUTH_CODE_PEPPER are required for Valkey integration tests.')

const control = new Valkey(url, { maxRetriesPerRequest: 1 })

beforeEach(async () => control.flushdb())
afterEach(async () => control.flushdb())

describe('Valkey authentication state', () => {
  it('consumes a challenge once under concurrent verification', async () => {
    const state = createValkeyAuthState(url, pepper)
    try {
      await state.beginChallenge({ code: '123456', email: 'member@example.com', payload: { email: 'member@example.com', kind: 'registration', passwordHash: 'hash', username: 'member' }, purpose: 'registration' })
      const results = await Promise.all([
        state.consumeChallenge({ code: '123456', email: 'member@example.com', purpose: 'registration' }),
        state.consumeChallenge({ code: '123456', email: 'member@example.com', purpose: 'registration' }),
      ])
      expect(results.filter(Boolean)).toHaveLength(1)
    } finally {
      await state.close()
    }
  })

  it('stores only hashed session keys and revokes all member sessions', async () => {
    const state = createValkeyAuthState(url, pepper)
    try {
      const first = await state.issueSession({ authVersion: 1, memberId: 'member-1' })
      const second = await state.issueSession({ authVersion: 1, memberId: 'member-1' })
      expect((await control.keys('*')).join(' ')).not.toContain(first.token)
      await state.revokeMemberSessions('member-1')
      expect(await state.readSession(first.token)).toBeNull()
      expect(await state.readSession(second.token)).toBeNull()
    } finally {
      await state.close()
    }
  })

  it('reserves a pending registration username for one email', async () => {
    const state = createValkeyAuthState(url, pepper)
    try {
      const payload = { email: 'first@example.com', kind: 'registration' as const, passwordHash: 'hash', username: 'cinema_fan' }
      expect(await state.beginChallenge({ code: '123456', email: payload.email, payload, purpose: 'registration' })).toBe('stored')
      expect(await state.beginChallenge({ code: '123456', email: 'second@example.com', payload: { ...payload, email: 'second@example.com' }, purpose: 'registration' })).toBe('username-unavailable')
      expect(await state.isUsernameReserved(payload.username)).toBe(true)
    } finally {
      await state.close()
    }
  })
})

afterAll(async () => control.quit())
