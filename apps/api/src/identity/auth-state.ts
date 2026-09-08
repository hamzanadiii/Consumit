import { createHmac } from 'node:crypto'

export const CHALLENGE_TTL_MS = 10 * 60 * 1000
export const CHALLENGE_COOLDOWN_MS = 60 * 1000
export const CHALLENGE_MAX_ATTEMPTS = 5
export const MAX_MEMBER_SESSIONS = 20

export type RegistrationChallenge = {
  email: string
  kind: 'registration'
  passwordHash: string
  username: string
}

export type RecoveryChallenge = {
  kind: 'recovery'
  memberId: string
}

export type AuthChallenge = RegistrationChallenge | RecoveryChallenge

export type SessionRecord = {
  absoluteExpiresAt: Date
  authVersion: number
  createdAt: Date
  expiresAt: Date
  lastSeenAt: Date
  memberId: string
}

export interface AuthStateStore {
  beginChallenge(input: {
    code: string
    email: string
    payload: AuthChallenge
    purpose: AuthChallenge['kind']
  }): Promise<'cooldown' | 'stored' | 'username-unavailable'>
  close(): Promise<void>
  consumeChallenge(input: { code: string; email: string; purpose: AuthChallenge['kind'] }): Promise<AuthChallenge | null>
  health(): Promise<boolean>
  issueSession(input: { authVersion: number; memberId: string }): Promise<{ record: SessionRecord; token: string }>
  isUsernameReserved(username: string): Promise<boolean>
  pendingRegistration(email: string): Promise<RegistrationChallenge | null>
  readSession(token: string): Promise<SessionRecord | null>
  revokeMemberSessions(memberId: string): Promise<void>
  revokeSession(token: string): Promise<void>
}

export function challengeLookup(pepper: string, purpose: AuthChallenge['kind'], email: string): string {
  return createHmac('sha256', pepper).update(`${purpose}:${email}`).digest('hex')
}

export function challengeCodeHash(pepper: string, purpose: AuthChallenge['kind'], email: string, code: string): string {
  return createHmac('sha256', pepper).update(`${purpose}:${email}:${code}`).digest('hex')
}
