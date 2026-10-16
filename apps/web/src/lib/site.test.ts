import { describe, expect, it, vi } from 'vitest'

import { absoluteUrl, siteUrl } from './site'

describe('site URL helpers', () => {
  it('falls back to local development origin', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', '')

    expect(siteUrl()).toBe('http://localhost:3000')

    vi.unstubAllEnvs()
  })

  it('trims trailing slashes and builds absolute paths', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://consumit.online/')

    expect(siteUrl()).toBe('https://consumit.online')
    expect(absoluteUrl('/title/550')).toBe('https://consumit.online/title/550')
    expect(absoluteUrl('title/550')).toBe('https://consumit.online/title/550')

    vi.unstubAllEnvs()
  })
})
