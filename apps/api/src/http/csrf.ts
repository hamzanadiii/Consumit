/**
 * The launch browser interface is same-origin only. Every mutation requires
 * an exact Origin and rejects cross-site Fetch Metadata before route logic.
 */
const DEV_ORIGIN_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/

export function isAllowedOrigin(
  headers: { origin?: unknown; 'sec-fetch-site'?: unknown },
  allowedOrigin: string | readonly string[],
  dev = false,
): boolean {
  const origin = headers.origin
  const fetchSite = headers['sec-fetch-site']
  if (typeof origin !== 'string') return false
  const allowed = Array.isArray(allowedOrigin) ? allowedOrigin : [allowedOrigin]
  const isMatch = allowed.includes(origin) || (dev && DEV_ORIGIN_PATTERN.test(origin))
  if (!isMatch) return false
  if (fetchSite === undefined || fetchSite === 'same-origin' || fetchSite === 'none') return true
  return dev && (fetchSite === 'same-site' || fetchSite === 'cross-site')
}
