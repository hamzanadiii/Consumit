import { normalizeIP } from '@fastify/rate-limit'
import type { FastifyRequest } from 'fastify'
import type { Identity } from '../identity/identity.ts'
import { requestMember } from './request-member.ts'

/** Public metadata fans out during page rendering and has no member state.
 * Give those reads their own bounded budget: every SSR render otherwise
 * shares the web server's IP and can exhaust the member-request bucket. */
export function isCatalogRead(request: FastifyRequest): boolean {
  return request.method === 'GET' && (
    request.url.startsWith('/v1/titles/') || request.url.startsWith('/v1/anime/')
  )
}

export async function apiRateLimitKey(request: FastifyRequest, identity?: Pick<Identity, 'getSession'>, cookieName = 'consumit_session'): Promise<string> {
  const key = await rateLimitKey(request, identity, cookieName)
  return isCatalogRead(request) ? `catalog:${key}` : key
}

/**
 * Only a verified member receives a member budget. Rotating arbitrary,
 * expired or revoked cookies cannot reset a public budget. Member ids keep
 * a member's sessions in one bucket; IPv6 addresses share their /64.
 */
export async function rateLimitKey(request: FastifyRequest, identity?: Pick<Identity, 'getSession'>, cookieName = 'consumit_session'): Promise<string> {
  if (identity) {
    try {
      const member = await requestMember(request, identity, cookieName)
      if (member) return `member:${member.id}`
    } catch { /* Identity outages retain the bounded public budget. */ }
  }
  return normalizeIP(request.ip, 64)
}
