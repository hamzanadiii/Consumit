const FALLBACK_SITE_URL = 'http://localhost:3000'

/**
 * Public canonical origin for SEO surfaces (metadata, sitemap, canonical
 * URLs). Trailing slashes are stripped so concatenation stays clean.
 */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || FALLBACK_SITE_URL).replace(/\/$/, '')
}

export function absoluteUrl(path: string): string {
  const normalized = path.startsWith('/') ? path : `/${path}`
  return `${siteUrl()}${normalized}`
}
