import { describe, expect, it } from 'vitest'

import {
  ACCOUNT_CONFIRM_MAX_ATTEMPTS,
  ACCOUNT_CONFIRM_WINDOW_MS,
  ACCOUNT_SEND_MAX,
  ACCOUNT_SEND_WINDOW_MS,
  CHALLENGE_COOLDOWN_MS,
  CHALLENGE_DESTROYED_BACKOFF_MS,
  CHALLENGE_MAX_ATTEMPTS,
  CHALLENGE_TTL_MS,
  MAX_MEMBER_SESSIONS,
} from './auth-state.ts'
import { createMemoryAuthState } from './memory-auth-state.ts'
import { SESSION_TTL_MS } from './session.ts'

describe('memory authentication state', () => {
  it('atomically consumes a code once and locks after exhausting invalid attempts', async () => {
    const state = createMemoryAuthState()
    const input = { code: '123456', email: 'member@example.com', payload: { email: 'member@example.com', kind: 'registration' as const, passwordHash: 'hash', username: 'member' }, purpose: 'registration' as const }
    await state.beginChallenge(input)
    const [first, second] = await Promise.all([
      state.consumeChallenge({ code: '123456', email: input.email, purpose: input.purpose }),
      state.consumeChallenge({ code: '123456', email: input.email, purpose: input.purpose }),
    ])
    expect([first, second].filter(Boolean)).toHaveLength(1)

    await state.beginChallenge({ ...input, email: 'attempts@example.com' })
    for (let attempt = 0; attempt < CHALLENGE_MAX_ATTEMPTS; attempt += 1) {
      await state.consumeChallenge({ code: '000000', email: 'attempts@example.com', purpose: 'registration' })
    }
    // The exhausted challenge is tombstoned: further guesses are refused even
    // after the challenge record itself is gone.
    expect(await state.consumeChallenge({ code: input.code, email: 'attempts@example.com', purpose: 'registration' })).toBe('locked')
  })

  it('keeps the per-account attempt budget across challenge deletion and re-issue', async () => {
    let now = new Date('2026-09-07T00:00:00.000Z')
    const state = createMemoryAuthState({ clock: () => now })
    const challenge = { code: '123456', email: 'member@example.com', payload: { email: 'member@example.com', kind: 'registration' as const, passwordHash: 'hash', username: 'member' }, purpose: 'registration' as const }
    await state.beginChallenge(challenge)
    for (let attempt = 0; attempt < CHALLENGE_MAX_ATTEMPTS; attempt += 1) {
      await state.consumeChallenge({ code: '000000', email: challenge.email, purpose: 'registration' })
    }
    // A fresh challenge after the tombstone backoff still cannot outlive the
    // account-level window: five more misses exhaust the account budget.
    now = new Date(now.getTime() + CHALLENGE_DESTROYED_BACKOFF_MS + 1)
    expect(await state.beginChallenge({ ...challenge, code: '654321' })).toBe('stored')
    // The miss that exhausts the account budget still answers null but locks
    // the account; every later confirmation is refused until the window rolls.
    for (let attempt = 0; attempt < ACCOUNT_CONFIRM_MAX_ATTEMPTS - CHALLENGE_MAX_ATTEMPTS; attempt += 1) {
      expect(await state.consumeChallenge({ code: '000000', email: challenge.email, purpose: 'registration' })).toBeNull()
    }
    expect(await state.consumeChallenge({ code: '999999', email: challenge.email, purpose: 'registration' })).toBe('locked')
    // Once the account window rolls over, confirming works again.
    now = new Date(now.getTime() + ACCOUNT_CONFIRM_WINDOW_MS + 1)
    expect(await state.beginChallenge({ ...challenge, code: '999999' })).toBe('stored')
    expect(await state.consumeChallenge({ code: '999999', email: challenge.email, purpose: 'registration' })).toMatchObject({ kind: 'registration' })
  })

  it('caps outbound challenge sends per account regardless of challenge state', async () => {
    let now = new Date('2026-09-07T00:00:00.000Z')
    const state = createMemoryAuthState({ clock: () => now })
    const challenge = { code: '123456', email: 'member@example.com', payload: { email: 'member@example.com', kind: 'registration' as const, passwordHash: 'hash', username: 'member' }, purpose: 'registration' as const }
    for (let send = 0; send < ACCOUNT_SEND_MAX; send += 1) {
      expect(await state.beginChallenge({ ...challenge, code: `111111${send}` })).toBe('stored')
      now = new Date(now.getTime() + CHALLENGE_TTL_MS + 1)
    }
    // The send budget is independent of the (now expired) challenge, so the
    // next request cannot uncap email delivery.
    expect(await state.beginChallenge({ ...challenge, code: '222222' })).toBe('cooldown')
    now = new Date(now.getTime() + ACCOUNT_SEND_WINDOW_MS + 1)
    expect(await state.beginChallenge({ ...challenge, code: '222222' })).toBe('stored')
  })

  it('enforces challenge expiry, resend cooldown, and invalidation', async () => {
    let now = new Date('2026-09-07T00:00:00.000Z')
    const state = createMemoryAuthState({ clock: () => now })
    const challenge = { code: '123456', email: 'member@example.com', payload: { email: 'member@example.com', kind: 'registration' as const, passwordHash: 'first', username: 'member' }, purpose: 'registration' as const }
    expect(await state.beginChallenge(challenge)).toBe('stored')
    expect(await state.beginChallenge({ ...challenge, code: '654321' })).toBe('cooldown')
    now = new Date(now.getTime() + CHALLENGE_COOLDOWN_MS + 1)
    expect(await state.beginChallenge({ ...challenge, code: '654321', payload: { ...challenge.payload, passwordHash: 'second' } })).toBe('stored')
    expect(await state.consumeChallenge({ code: '123456', email: challenge.email, purpose: challenge.purpose })).toBeNull()
    now = new Date(now.getTime() + CHALLENGE_TTL_MS + 1)
    expect(await state.consumeChallenge({ code: '654321', email: challenge.email, purpose: challenge.purpose })).toBeNull()
  })

  it('reserves one registration username atomically and releases it after expiry', async () => {
    let now = new Date('2026-09-07T00:00:00.000Z')
    const state = createMemoryAuthState({ clock: () => now })
    const first = { code: '123456', email: 'first@example.com', payload: { email: 'first@example.com', kind: 'registration' as const, passwordHash: 'hash', username: 'cinema_fan' }, purpose: 'registration' as const }
    const second = { ...first, email: 'second@example.com', payload: { ...first.payload, email: 'second@example.com' } }
    expect(await state.beginChallenge(first)).toBe('stored')
    expect(await state.beginChallenge(second)).toBe('username-unavailable')
    expect(await state.isUsernameReserved('cinema_fan')).toBe(true)
    now = new Date(now.getTime() + CHALLENGE_TTL_MS + 1)
    expect(await state.isUsernameReserved('cinema_fan')).toBe(false)
    expect(await state.beginChallenge(second)).toBe('stored')
  })

  it('slides idle expiry, caps absolute expiry, and keeps at most twenty sessions', async () => {
    let now = new Date('2026-09-07T00:00:00.000Z')
    let sequence = 0
    const state = createMemoryAuthState({ clock: () => now, token: () => `token-${sequence += 1}` })
    const first = await state.issueSession({ authVersion: 1, memberId: 'member-1' })
    now = new Date(now.getTime() + SESSION_TTL_MS / 2 + 1)
    const refreshed = await state.readSession(first.token)
    expect(refreshed?.expiresAt.getTime()).toBe(now.getTime() + SESSION_TTL_MS)
    // Idle touches keep sliding while live; the absolute ceiling binds them.
    // (Each touch lands inside the live window: expiresAt is 45d+1ms here.)
    now = new Date(first.record.createdAt.getTime() + 31 * (SESSION_TTL_MS / 30))
    expect((await state.readSession(first.token))?.expiresAt.getTime()).toBe(now.getTime() + SESSION_TTL_MS)
    now = new Date(first.record.createdAt.getTime() + 50 * (SESSION_TTL_MS / 30))
    expect((await state.readSession(first.token))?.expiresAt.getTime()).toBe(now.getTime() + SESSION_TTL_MS)
    now = new Date(first.record.createdAt.getTime() + 70 * (SESSION_TTL_MS / 30))
    expect((await state.readSession(first.token))?.expiresAt.getTime()).toBe(first.record.absoluteExpiresAt.getTime())
    now = new Date(first.record.absoluteExpiresAt.getTime() + 1)
    expect(await state.readSession(first.token)).toBeNull()

    now = new Date('2026-09-08T00:00:00.000Z')
    const sessions = await Promise.all(Array.from({ length: MAX_MEMBER_SESSIONS + 2 }, () => state.issueSession({ authVersion: 1, memberId: 'member-2' })))
    expect(state.sessionCount()).toBe(MAX_MEMBER_SESSIONS)
    expect(await state.readSession(sessions[0]!.token)).toBeNull()
    await state.revokeMemberSessions('member-2')
    expect(state.sessionCount()).toBe(0)
  })
})
