import { describe, expect, it } from 'vitest'

import {
  extendedExpiry,
  hashSessionToken,
  isSessionExpired,
  newSessionToken,
  sessionCookieName,
  sessionCookieOptions,
  sessionExpiry,
  SESSION_ABSOLUTE_TTL_MS,
  SESSION_TTL_MS,
} from './session.ts'

describe('session helpers', () => {
  it('mints opaque tokens and stores only their hash', () => {
    const token = newSessionToken()
    const hash = hashSessionToken(token)

    expect(token).not.toContain(hash)
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
    expect(hashSessionToken(token)).toBe(hash)
  })

  it('expires after 30 days, extends past the halfway mark, and caps at the absolute ceiling', () => {
    const now = new Date('2026-09-06T12:00:00.000Z')
    const farAbsolute = new Date(now.getTime() + SESSION_ABSOLUTE_TTL_MS)
    const fresh = sessionExpiry(now)

    expect(fresh.getTime() - now.getTime()).toBe(SESSION_TTL_MS)
    expect(isSessionExpired(fresh, now)).toBe(false)
    expect(isSessionExpired(new Date(now.getTime() - 1), now)).toBe(true)
    expect(extendedExpiry(fresh, farAbsolute, now)).toBeNull()

    const nearlyExpired = new Date(now.getTime() + 1)
    expect(extendedExpiry(nearlyExpired, farAbsolute, now)?.getTime()).toBe(now.getTime() + SESSION_TTL_MS)

    const lowCeiling = new Date(now.getTime() + 3_600_000)
    expect(extendedExpiry(nearlyExpired, lowCeiling, now)?.getTime()).toBe(lowCeiling.getTime())
  })

  it('uses a __Host- secure cookie in production and a plain one elsewhere', () => {
    expect(sessionCookieName({ nodeEnv: 'production' })).toBe('__Host-consumit_session')
    expect(sessionCookieName({ nodeEnv: 'development' })).toBe('consumit_session')
    expect(sessionCookieOptions({ nodeEnv: 'production' })).toMatchObject({ httpOnly: true, sameSite: 'lax', secure: true })
    expect(sessionCookieOptions({ nodeEnv: 'development' })).toMatchObject({ secure: false })
  })
})
