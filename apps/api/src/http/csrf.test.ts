import { describe, expect, it } from 'vitest'

import { isAllowedOrigin } from './csrf.ts'

describe('CSRF origin gate', () => {
  const allowedOrigin = 'https://consumit.online'

  it('accepts the exact origin with same-origin fetch metadata', () => {
    expect(isAllowedOrigin({ origin: allowedOrigin }, allowedOrigin)).toBe(true)
    expect(isAllowedOrigin({ origin: allowedOrigin, 'sec-fetch-site': 'same-origin' }, allowedOrigin)).toBe(true)
    expect(isAllowedOrigin({ origin: allowedOrigin, 'sec-fetch-site': 'none' }, allowedOrigin)).toBe(true)
  })

  it('rejects missing, foreign, and cross-site requests', () => {
    expect(isAllowedOrigin({}, allowedOrigin)).toBe(false)
    expect(isAllowedOrigin({ origin: 'https://evil.example' }, allowedOrigin)).toBe(false)
    expect(isAllowedOrigin({ origin: 42 }, allowedOrigin)).toBe(false)
    expect(isAllowedOrigin({ origin: allowedOrigin, 'sec-fetch-site': 'cross-site' }, allowedOrigin)).toBe(false)
    expect(isAllowedOrigin({ origin: 'https://consumit.online.evil.example' }, allowedOrigin)).toBe(false)
  })

  it('permits localhost development origins when dev mode is active', () => {
    expect(isAllowedOrigin({ origin: 'http://localhost:3000', 'sec-fetch-site': 'same-origin' }, allowedOrigin, true)).toBe(true)
    expect(isAllowedOrigin({ origin: 'http://localhost:8080', 'sec-fetch-site': 'same-site' }, allowedOrigin, true)).toBe(true)
    expect(isAllowedOrigin({ origin: 'http://127.0.0.1:3000', 'sec-fetch-site': 'cross-site' }, allowedOrigin, true)).toBe(true)
    expect(isAllowedOrigin({ origin: 'http://localhost:3000', 'sec-fetch-site': 'same-origin' }, allowedOrigin, false)).toBe(false)
    expect(isAllowedOrigin({ origin: 'http://evil.com', 'sec-fetch-site': 'same-origin' }, allowedOrigin, true)).toBe(false)
  })
})
