/**
 * Public catalog responses contain no member data. TMDB catalog routes
 * advertise a five-minute shared-cache lifetime; AniList metadata has a
 * minimum five-minute freshness window. Keep the web data cache at that same
 * upper bound; authenticated/member requests must not use this policy.
 */
export const PUBLIC_CATALOG_REVALIDATE_SECONDS = 300

export function publicCatalogFetchOptions() {
  return { next: { revalidate: PUBLIC_CATALOG_REVALIDATE_SECONDS } }
}
