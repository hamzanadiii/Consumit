import type { FastifyRequest } from 'fastify'

import { hashSessionToken } from '../identity/session.ts'

const SESSION_COOKIES = ['__Host-consumit_session', 'consumit_session']

/** Public metadata fans out during page rendering and has no member state.
 * Give those reads their own bounded budget: every SSR render otherwise
 * shares the web server's IP and can exhaust the member-request bucket. */
export function isCatalogRead(request: FastifyRequest): boolean {
  return request.method === 'GET' && (
    request.url.startsWith('/v1/titles/') || request.url.startsWith('/v1/anime/')
  )
}

export function apiRateLimitKey(request: FastifyRequest): string {
  const key = rateLimitKey(request)
  return isCatalogRead(request) ? `catalog:${key}` : key
}

/**
 * Rate-limit bucket for a request.
 *
 * Browser-direct traffic arrives with the real client IP (the gateway
 * forwards X-Forwarded-For and the API trusts the proxy range), but all
 * server-rendered traffic originates from the web container's single IP.
 * Keying purely on IP therefore puts every member's server-side catalog,
 * anime, and member calls into one shared 100/minute bucket, and normal
 * browsing trips it.
 *
 * A request carrying a session cookie gets its own per-member bucket keyed
 * by the token hash (the opaque token itself never enters logs or keys).
 * Everything else falls back to the client IP, as before.
 */
export function rateLimitKey(request: FastifyRequest): string {
  const header = request.headers.cookie
  if (header) {
    for (const part of header.split(';')) {
      const index = part.indexOf('=')
      if (index < 0) continue
      if (!SESSION_COOKIES.includes(part.slice(0, index).trim())) continue
      const value = part.slice(index + 1).trim()
      if (value) return `sess:${hashSessionToken(value)}`
    }
  }
  return request.ip
}
