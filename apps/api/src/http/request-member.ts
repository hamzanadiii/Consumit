import type { SafeMember } from '@consumit/contracts'
import type { FastifyRequest } from 'fastify'
import type { Identity } from '../identity/identity.ts'

type Reader = Pick<Identity, 'getSession'>
type SessionRequest = Pick<FastifyRequest, 'cookies'>
const sessions = new WeakMap<SessionRequest, { identity: Reader; token: string; member: Promise<SafeMember | null> }>()

/** Share authentication only within this request. Never retain member
 * authorization across requests, logout, password changes or role changes. */
export function requestMember(request: SessionRequest, identity: Reader, cookieName: string): Promise<SafeMember | null> {
  const token = request.cookies?.[cookieName]
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) return Promise.resolve(null)
  const existing = sessions.get(request)
  if (existing?.identity === identity && existing.token === token) return existing.member
  const member = identity.getSession(token)
  sessions.set(request, { identity, token, member })
  return member
}
