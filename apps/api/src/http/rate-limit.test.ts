import { afterEach, describe, expect, it } from 'vitest'

import { buildApp } from '../app.ts'
import { hashSessionToken } from '../identity/session.ts'
import { rateLimitKey } from './rate-limit.ts'

function requestLike(overrides: { cookie?: string | undefined; ip?: string } = {}) {
  return { headers: overrides.cookie ? { cookie: overrides.cookie } : {}, ip: overrides.ip ?? '10.0.0.5' } as Parameters<typeof rateLimitKey>[0]
}

describe('rateLimitKey', () => {
  it('falls back to the client IP without a session cookie', () => {
    expect(rateLimitKey(requestLike())).toBe('10.0.0.5')
    expect(rateLimitKey(requestLike({ cookie: 'theme=dark; other=1' }))).toBe('10.0.0.5')
    expect(rateLimitKey(requestLike({ cookie: 'consumit_session=' }))).toBe('10.0.0.5')
  })

  it('keys signed-in members by session hash in dev and production cookie names', () => {
    expect(rateLimitKey(requestLike({ cookie: 'consumit_session=token-a' }))).toBe(`sess:${hashSessionToken('token-a')}`)
    expect(rateLimitKey(requestLike({ cookie: '__Host-consumit_session=token-a' }))).toBe(`sess:${hashSessionToken('token-a')}`)
    expect(rateLimitKey(requestLike({ cookie: 'theme=dark; consumit_session=token-a; other=1' }))).toBe(`sess:${hashSessionToken('token-a')}`)
  })

  it('separates members and never exposes the raw token', () => {
    const first = rateLimitKey(requestLike({ cookie: 'consumit_session=token-a' }))
    const second = rateLimitKey(requestLike({ cookie: 'consumit_session=token-b' }))
    expect(first).not.toBe(second)
    expect(first).not.toContain('token-a')
    expect(rateLimitKey(requestLike({ cookie: 'consumit_session=token-a', ip: '10.9.9.9' }))).toBe(first)
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

  it('exhausting one session bucket leaves other sessions unaffected', async () => {
    // The limiter hooks matched routes only, so exercise a real member route.
    const app = await buildApp({})
    apps.push(app)
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const res = await app.inject({ method: 'GET', url: '/v1/me', cookies: { consumit_session: 'token-a' } })
      expect(res.statusCode).not.toBe(429)
    }
    const limited = await app.inject({ method: 'GET', url: '/v1/me', cookies: { consumit_session: 'token-a' } })
    expect(limited.statusCode).toBe(429)
    expect(limited.json()).toEqual({ error: expect.objectContaining({ code: 'RATE_LIMITED', retryable: true }) })

    const other = await app.inject({ method: 'GET', url: '/v1/me', cookies: { consumit_session: 'token-b' } })
    expect(other.statusCode).not.toBe(429)
  })
})
