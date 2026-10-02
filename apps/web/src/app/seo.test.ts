import { describe, expect, it, vi } from 'vitest'

import robots from '@/app/robots'
import sitemap from '@/app/sitemap'

describe('SEO surfaces', () => {
  it('lists the crawlable public routes with absolute URLs', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://consumit.online')

    const entries = sitemap()
    const urls = entries.map((entry) => entry.url)

    expect(urls).toEqual([
      'https://consumit.online/',
      'https://consumit.online/movies',
      'https://consumit.online/series',
      'https://consumit.online/search',
      'https://consumit.online/about',
    ])
    expect(entries.every((entry) => entry.lastModified instanceof Date)).toBe(true)

    vi.unstubAllEnvs()
  })

  it('keeps member, auth, and playback routes out of crawling', () => {
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://consumit.online')

    const rules = robots()
    const disallow = Array.isArray(rules.rules) ? [] : (rules.rules.disallow ?? [])

    expect(rules.sitemap).toBe('https://consumit.online/sitemap.xml')
    for (const path of ['/watch/', '/library', '/profile/', '/settings', '/sign-in', '/sign-up', '/onboarding/']) {
      expect(disallow).toContain(path)
    }

    vi.unstubAllEnvs()
  })
})
