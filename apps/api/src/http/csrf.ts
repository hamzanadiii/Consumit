/**
 * The launch browser interface is same-origin only. Every mutation requires
 * an exact Origin and rejects cross-site Fetch Metadata before route logic.
 */
export function isAllowedOrigin(headers: { origin?: unknown; 'sec-fetch-site'?: unknown }, allowedOrigin: string): boolean {
  const origin = headers.origin
  const fetchSite = headers['sec-fetch-site']
  if (typeof origin !== 'string' || origin !== allowedOrigin) return false
  return fetchSite === undefined || fetchSite === 'same-origin' || fetchSite === 'none'
}
