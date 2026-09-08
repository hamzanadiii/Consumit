import { timingSafeEqual } from 'node:crypto'

import {
  CHALLENGE_COOLDOWN_MS,
  CHALLENGE_MAX_ATTEMPTS,
  CHALLENGE_TTL_MS,
  MAX_MEMBER_SESSIONS,
  challengeCodeHash,
  challengeLookup,
  type AuthChallenge,
  type AuthStateStore,
  type RegistrationChallenge,
  type SessionRecord,
} from './auth-state.ts'
import {
  SESSION_ABSOLUTE_TTL_MS,
  extendedExpiry,
  hashSessionToken,
  newSessionToken,
  sessionExpiry,
} from './session.ts'

type StoredChallenge = {
  attempts: number
  codeHash: string
  createdAt: Date
  expiresAt: Date
  payload: AuthChallenge
}

function equalHash(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function createMemoryAuthState(options: {
  clock?: () => Date
  codePepper?: string
  token?: () => string
} = {}): AuthStateStore & { expireSession(token: string): void; sessionCount(): number } {
  const clock = options.clock ?? (() => new Date())
  const codePepper = options.codePepper ?? 'test-code-pepper'
  const token = options.token ?? newSessionToken
  const challenges = new Map<string, StoredChallenge>()
  const usernameReservations = new Map<string, { email: string; expiresAt: Date }>()
  const sessions = new Map<string, SessionRecord>()

  function challengeKey(purpose: AuthChallenge['kind'], email: string) {
    return challengeLookup(codePepper, purpose, email)
  }

  function removeSession(hash: string) {
    sessions.delete(hash)
  }

  function releaseRegistration(challenge: StoredChallenge | undefined) {
    if (challenge?.payload.kind !== 'registration') return
    const reservation = usernameReservations.get(challenge.payload.username)
    if (reservation?.email === challenge.payload.email) usernameReservations.delete(challenge.payload.username)
  }

  function activeReservation(username: string) {
    const reservation = usernameReservations.get(username)
    if (reservation && reservation.expiresAt.getTime() <= clock().getTime()) {
      usernameReservations.delete(username)
      return null
    }
    return reservation ?? null
  }

  return {
    async beginChallenge(input) {
      const key = challengeKey(input.purpose, input.email)
      const current = challenges.get(key)
      const now = clock()
      if (current && current.createdAt.getTime() + CHALLENGE_COOLDOWN_MS > now.getTime()) return 'cooldown'
      if (current && current.expiresAt.getTime() <= now.getTime()) {
        releaseRegistration(current)
        challenges.delete(key)
      }
      if (input.payload.kind === 'registration') {
        const reservation = activeReservation(input.payload.username)
        if (reservation && reservation.email !== input.email) return 'username-unavailable'
        releaseRegistration(current)
        usernameReservations.set(input.payload.username, {
          email: input.email,
          expiresAt: new Date(now.getTime() + CHALLENGE_TTL_MS),
        })
      }
      challenges.set(key, {
        attempts: 0,
        codeHash: challengeCodeHash(codePepper, input.purpose, input.email, input.code),
        createdAt: now,
        expiresAt: new Date(now.getTime() + CHALLENGE_TTL_MS),
        payload: input.payload,
      })
      return 'stored'
    },
    async close() {},
    async consumeChallenge(input) {
      const key = challengeKey(input.purpose, input.email)
      const challenge = challenges.get(key)
      if (!challenge || challenge.expiresAt.getTime() <= clock().getTime()) {
        releaseRegistration(challenge)
        challenges.delete(key)
        return null
      }
      const expected = challengeCodeHash(codePepper, input.purpose, input.email, input.code)
      if (!equalHash(challenge.codeHash, expected)) {
        challenge.attempts += 1
        if (challenge.attempts >= CHALLENGE_MAX_ATTEMPTS) {
          releaseRegistration(challenge)
          challenges.delete(key)
        }
        return null
      }
      releaseRegistration(challenge)
      challenges.delete(key)
      return { ...challenge.payload }
    },
    expireSession(rawToken) {
      const session = sessions.get(hashSessionToken(rawToken))
      if (session) session.expiresAt = new Date(0)
    },
    async health() {
      return true
    },
    async issueSession(input) {
      const now = clock()
      const rawToken = token()
      const record: SessionRecord = {
        absoluteExpiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_TTL_MS),
        authVersion: input.authVersion,
        createdAt: now,
        expiresAt: sessionExpiry(now),
        lastSeenAt: now,
        memberId: input.memberId,
      }
      sessions.set(hashSessionToken(rawToken), record)
      const memberSessions = [...sessions.entries()]
        .filter(([, session]) => session.memberId === input.memberId)
        .sort(([, left], [, right]) => left.createdAt.getTime() - right.createdAt.getTime())
      for (const [hash] of memberSessions.slice(0, Math.max(0, memberSessions.length - MAX_MEMBER_SESSIONS))) removeSession(hash)
      return { record: { ...record }, token: rawToken }
    },
    async isUsernameReserved(username) {
      return activeReservation(username) !== null
    },
    async pendingRegistration(email) {
      const challenge = challenges.get(challengeKey('registration', email))
      if (!challenge || challenge.expiresAt.getTime() <= clock().getTime() || challenge.payload.kind !== 'registration') {
        releaseRegistration(challenge)
        challenges.delete(challengeKey('registration', email))
        return null
      }
      return { ...challenge.payload } as RegistrationChallenge
    },
    async readSession(rawToken) {
      const hash = hashSessionToken(rawToken)
      const session = sessions.get(hash)
      const now = clock()
      if (!session || session.expiresAt.getTime() <= now.getTime() || session.absoluteExpiresAt.getTime() <= now.getTime()) {
        removeSession(hash)
        return null
      }
      const nextExpiry = extendedExpiry(session.expiresAt, session.absoluteExpiresAt, now)
      if (nextExpiry) {
        session.expiresAt = nextExpiry
        session.lastSeenAt = now
      }
      return { ...session }
    },
    async revokeMemberSessions(memberId) {
      for (const [hash, session] of sessions) if (session.memberId === memberId) removeSession(hash)
    },
    async revokeSession(rawToken) {
      removeSession(hashSessionToken(rawToken))
    },
    sessionCount: () => sessions.size,
  }
}
