import { afterEach, describe, expect, it } from 'vitest'

import { buildApp } from '../app.ts'
import { createFakeIdentity } from '../identity/fake-identity.ts'
import { rateLimitKey } from './rate-limit.ts'

function requestLike(overrides: { token?: string; cookieName?: string; ip?: string } = {}) {
  return { cookies: overrides.token ? { [overrides.cookieName ?? 'consumit_session']: overrides.token } : {}, ip: overrides.ip ?? '10.0.0.5' } as Parameters<typeof rateLimitKey>[0]
}

const tokenA = 'a'.repeat(43)
const tokenB = 'b'.repeat(43)
const identity = { getSession: async (token: string) => token === tokenA || token === tokenB ? {
  id: token === tokenA ? 'member-a' : 'member-b', avatarStyle: 'dusk' as const, avatarUrl: null,
  createdAt: '2026-10-01T00:00:00.000Z', displayName: 'Member', email: 'member@example.com',
  emailVerified: true, role: 'member' as const, username: 'member',
} : null }

describe('rateLimitKey', () => {
  it('uses the client IP for absent, malformed and unverified sessions', async () => {
    expect(await rateLimitKey(requestLike(), identity)).toBe('10.0.0.5')
    expect(await rateLimitKey(requestLike({ token: 'short' }), identity)).toBe('10.0.0.5')
    expect(await rateLimitKey(requestLike({ token: 'x'.repeat(43) }), identity)).toBe('10.0.0.5')
    expect(await rateLimitKey(requestLike({ token: tokenA }))).toBe('10.0.0.5')
  })

  it('uses only the current environment cookie and verified member identity', async () => {
    expect(await rateLimitKey(requestLike({ token: tokenA }), identity)).toBe('member:member-a')
    expect(await rateLimitKey(requestLike({ token: tokenA, cookieName: '__Host-consumit_session' }), identity, '__Host-consumit_session')).toBe('member:member-a')
    expect(await rateLimitKey(requestLike({ token: tokenA }), identity, '__Host-consumit_session')).toBe('10.0.0.5')
  })

  it('separates members and never exposes the raw token', async () => {
    const first = await rateLimitKey(requestLike({ token: tokenA }), identity)
    const second = await rateLimitKey(requestLike({ token: tokenB }), identity)
    expect(first).not.toBe(second)
    expect(first).not.toContain(tokenA)
    expect(await rateLimitKey(requestLike({ token: tokenA, ip: '10.9.9.9' }), identity)).toBe(first)
  })
  it('groups IPv6 rotation and remains bounded when identity is unavailable', async () => {
    expect(await rateLimitKey(requestLike({ ip: '2001:db8::1' }))).toBe(await rateLimitKey(requestLike({ ip: '2001:db8::2' })))
    expect(await rateLimitKey(requestLike({ token: tokenA }), { getSession: async () => { throw new Error('Unavailable') } })).toBe('10.0.0.5')
  })
})

describe('per-member rate-limit buckets', () => {
  const apps: Array<Awaited<ReturnType<typeof buildApp>>> = []
  afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())))

  it('allows normal metadata fan-out beyond 100 reads without blocking member requests', async () => {
    const app = await buildApp({})
    apps.push(app)
    for (let attempt = 0; attempt < 150; attempt += 1) {
      const res = await app.inject({ method: 'GET', url: '/v1/titles/search?q=ab&kind=all' })
      expect(res.statusCode).not.toBe(429)
    }
    const member = await app.inject({ method: 'GET', url: '/v1/me' })
    expect(member.statusCode).not.toBe(429)
  })

  it('keeps a bounded shared metadata budget and a separate member budget', async () => {
    const app = await buildApp({})
    apps.push(app)
    for (let attempt = 0; attempt < 600; attempt += 1) {
      const url = attempt % 2 === 0 ? '/v1/titles/search?q=ab&kind=all' : '/v1/anime/batch?ids=invalid'
      const res = await app.inject({ method: 'GET', url })
      expect(res.statusCode).not.toBe(429)
    }
    const limited = await app.inject({ method: 'GET', url: '/v1/titles/discover' })
    expect(limited.statusCode).toBe(429)
    expect(limited.json()).toEqual({ error: expect.objectContaining({ code: 'RATE_LIMITED', retryable: true }) })
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0)
    expect((await app.inject({ method: 'GET', url: '/v1/me' })).statusCode).not.toBe(429)
  })

  it('cannot evade the public request budget with rotating forged session cookies', async () => {
    const app = await buildApp({})
    apps.push(app)
    for (let attempt = 0; attempt < 21; attempt += 1) {
      const response = await app.inject({ method: 'POST', url: '/v1/playback/providers',
        headers: { origin: 'http://localhost:3000' },
        cookies: { consumit_session: String(attempt).padStart(43, 'a') }, payload: {} })
      expect(response.statusCode).toBe(attempt < 20 ? 400 : 429)
    }
  })

  it('exhausting one session bucket leaves other sessions unaffected', async () => {
    // The limiter hooks matched routes only, so exercise a real member route.
    const app = await buildApp({ identity: { ...createFakeIdentity(), ...identity } })
    apps.push(app)
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const res = await app.inject({ method: 'GET', url: '/v1/me', cookies: { consumit_session: tokenA } })
      expect(res.statusCode).not.toBe(429)
    }
    const limited = await app.inject({ method: 'GET', url: '/v1/me', cookies: { consumit_session: tokenA } })
    expect(limited.statusCode).toBe(429)
    expect(limited.json()).toEqual({ error: expect.objectContaining({ code: 'RATE_LIMITED', retryable: true }) })

    const other = await app.inject({ method: 'GET', url: '/v1/me', cookies: { consumit_session: tokenB } })
    expect(other.statusCode).not.toBe(429)
  })
})
