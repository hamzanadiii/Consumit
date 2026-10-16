/**
 * Public catalog responses contain no member data. TMDB catalog routes
 * advertise a five-minute shared-cache lifetime; AniList metadata has a
 * minimum five-minute freshness window. Keep the web data cache at that same
 * upper bound; authenticated/member requests must not use this policy.
 */
export const PUBLIC_CATALOG_REVALIDATE_SECONDS = 300
// AniList's bounded upstream request can take 10s. The web must allow the
// API to finish it instead of cancelling an otherwise valid cold read at 6s.
export const PUBLIC_CATALOG_REQUEST_TIMEOUT_MS = 12_000

export function publicCatalogFetchOptions() {
  return { next: { revalidate: PUBLIC_CATALOG_REVALIDATE_SECONDS } }
}
