import { describe, expect, it } from 'vitest'

import { internalNextPath } from './internal-next-path'

describe('sign-in destination', () => {
  it.each(['/library', '/search?q=film#results', '/profile/cinema_fan'])('preserves an internal path: %s', (path) => {
    expect(internalNextPath(path)).toBe(path)
  })

  it.each([undefined, 'https://example.com', '//example.com', '/\\example.com', '/\t/example.com', '/\n/example.com', 'javascript:alert(1)'])('rejects external or browser-normalized redirects: %s', (path) => {
    expect(internalNextPath(path)).toBe('/')
  })

  it('uses only the first query value', () => {
    expect(internalNextPath(['/library', '//example.com'])).toBe('/library')
  })
})
