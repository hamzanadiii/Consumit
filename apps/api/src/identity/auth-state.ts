import { createHmac } from 'node:crypto'

export const CHALLENGE_TTL_MS = 10 * 60 * 1000
export const CHALLENGE_COOLDOWN_MS = 60 * 1000
export const CHALLENGE_MAX_ATTEMPTS = 5
/** Set when a challenge is destroyed by failed attempts. Unlike the
 *  cooldown, this survives challenge deletion, so re-issuing a code cannot
 *  reset the attempt budget. */
export const CHALLENGE_DESTROYED_BACKOFF_MS = 5 * 60 * 1000
/** Wrong-code confirmations are also counted per account+purpose in a
 *  rolling window that survives challenge deletion and re-issue. */
export const ACCOUNT_CONFIRM_MAX_ATTEMPTS = 10
export const ACCOUNT_CONFIRM_WINDOW_MS = 60 * 60 * 1000
/** Outbound challenge emails per account+purpose per window, independent of
 *  challenge state, so expired or deleted challenges cannot uncap sends. */
export const ACCOUNT_SEND_MAX = 5
export const ACCOUNT_SEND_WINDOW_MS = 60 * 60 * 1000
export const RECOVERY_GRANT_TTL_MS = 10 * 60 * 1000
/** Wrong passwords are counted per account so a distributed spray cannot
 *  outpace the per-address credential limit. Counting starts only once the
 *  account is known to exist, which keeps unknown addresses from minting
 *  unlimited counters. */
export const LOGIN_MAX_ATTEMPTS = 10
export const LOGIN_WINDOW_MS = 15 * 60 * 1000
export const MAX_MEMBER_SESSIONS = 20
export const GOOGLE_AUTH_TTL_MS = 10 * 60 * 1000

export type GoogleOAuthAttempt = {
  codeVerifier: string
  nextPath: string
  nonce: string
}

export type GoogleSignupClaim = {
  email: string
  emailAuthoritative: boolean
  googleSubject: string
  name: string | null
  nextPath: string
}

export type RegistrationChallenge = {
  email: string
  kind: 'registration'
  passwordHash: string | null
  googleSubject?: string
  displayName?: string | null
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
  clearFailedLogins(email: string): Promise<void>
  close(): Promise<void>
  consumeChallenge(input: { code: string; email: string; purpose: AuthChallenge['kind'] }): Promise<AuthChallenge | 'locked' | null>
  consumeRecoveryGrant(token: string): Promise<string | null>
  consumeGoogleAttempt(state: string): Promise<GoogleOAuthAttempt | null>
  deleteGoogleSignup(ticket: string): Promise<void>
  getGoogleSignup(ticket: string): Promise<GoogleSignupClaim | null>
  health(): Promise<boolean>
  issueSession(input: { authVersion: number; memberId: string }): Promise<{ record: SessionRecord; token: string }>
  isUsernameReserved(username: string): Promise<boolean>
  tryLoginAttempt(email: string): Promise<boolean>
  pendingRegistration(email: string): Promise<RegistrationChallenge | null>
  storeGoogleAttempt(state: string, attempt: GoogleOAuthAttempt): Promise<void>
  storeGoogleSignup(ticket: string, claim: GoogleSignupClaim): Promise<void>
  storeRecoveryGrant(input: { memberId: string; token: string }): Promise<void>
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

export function loginLookup(pepper: string, email: string): string {
  return createHmac('sha256', pepper).update(`login:${email}`).digest('hex')
}
