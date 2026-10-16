import type { MetadataRoute } from 'next'

import { siteUrl } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      allow: '/',
      disallow: [
        '/watch/',
        '/library',
        '/watchlist',
        '/profile/',
        '/settings',
        '/notifications',
        '/_internal/',
        '/sign-in',
        '/sign-up',
        '/onboarding/',
      ],
      userAgent: '*',
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  }
}
