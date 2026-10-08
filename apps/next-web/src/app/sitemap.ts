import type { MetadataRoute } from 'next'

import { siteUrl } from '@/lib/site'

/**
 * Crawlable public routes only. Member, auth, and playback routes stay out
 * (they also carry noindex metadata); numeric title routes are unbounded and
 * resolve through detail-page metadata instead.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl()
  const routes: Array<{ changeFrequency: 'weekly'; path: string; priority: number }> = [
    { changeFrequency: 'weekly', path: '/', priority: 1 },
    { changeFrequency: 'weekly', path: '/movies', priority: 0.8 },
    { changeFrequency: 'weekly', path: '/series', priority: 0.8 },
    { changeFrequency: 'weekly', path: '/search', priority: 0.6 },
    { changeFrequency: 'weekly', path: '/about', priority: 0.5 },
  ]
  return routes.map((route) => ({
    changeFrequency: route.changeFrequency,
    lastModified: new Date(),
    priority: route.priority,
    url: `${base}${route.path}`,
  }))
}
