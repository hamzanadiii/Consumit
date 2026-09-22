import { createHash, randomInt, randomUUID } from 'node:crypto'

import type { MemberProfile, SafeMember } from '@consumit/contracts'

import type { AuthStateStore, RegistrationChallenge } from './auth-state.ts'
import { IdentityError } from './errors.ts'
import { normalizeEmail, type AuthenticatedMember, type Identity } from './identity.ts'
import type { AuthNotifier } from './notifier.ts'
import { hashPassword, verifyPassword } from './password.ts'
import type { IdentityRecord, IdentityRepository } from './repository.ts'

const invalidCredentials = () => new IdentityError('INVALID_CREDENTIALS', 'Invalid email or password.')
const invalidCode = () => new IdentityError('INVALID_VERIFICATION_CODE', 'The code is invalid or has expired.')
const USERNAME_CHANGE_COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000
let dummyHash: Promise<string> | null = null

function unavailableIdentity(): IdentityError {
  return new IdentityError('UNAUTHENTICATED', 'Sign in to continue.')
}

function memberView(member: IdentityRecord): SafeMember {
  return {
    avatarStyle: member.profile.avatarStyle,
    avatarUrl: member.profile.avatarUrl,
    createdAt: member.createdAt.toISOString(),
    displayName: member.profile.displayName,
    email: member.email,
    emailVerified: member.emailVerifiedAt !== null,
    id: member.id,
    role: member.role === 'ADMIN' ? 'admin' : 'member',
    username: member.profile.username,
  }
}

function profileView(member: IdentityRecord, now: Date): MemberProfile {
  const nextChange = member.profile.usernameChangedAt
    ? new Date(member.profile.usernameChangedAt.getTime() + USERNAME_CHANGE_COOLDOWN_MS)
    : null
  return {
    avatarStyle: member.profile.avatarStyle,
    avatarUrl: member.profile.avatarUrl,
    bannerUrl: member.profile.bannerUrl,
    bio: member.profile.bio,
    createdAt: member.createdAt.toISOString(),
    displayName: member.profile.displayName,
    location: member.profile.location,
    nextUsernameChangeAt: nextChange && nextChange > now ? nextChange.toISOString() : null,
    username: member.profile.username,
    usernameChangedAt: member.profile.usernameChangedAt?.toISOString() ?? null,
    visibility: member.profile.visibility,
  }
}

function verificationCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0')
}

function challengeIdempotencyKey(purpose: 'recovery' | 'verification', email: string, code: string): string {
  return `${purpose}/${createHash('sha256').update(`${email}:${code}`).digest('hex')}`
}

export function createIdentity(options: {
  clock?: () => Date
  notifier: AuthNotifier
  onNotificationError?: (error: unknown) => void
  repository: IdentityRepository
  state: AuthStateStore
}): Identity {
  const clock = options.clock ?? (() => new Date())
  const reportNotificationError = options.onNotificationError ?? (() => {})
  const { notifier, repository, state } = options

  async function dummyPasswordHash() {
    dummyHash ??= hashPassword(`consumit-missing-${randomUUID()}`)
    return dummyHash
  }

  async function sendQuietly(work: () => Promise<void>) {
    try {
      await work()
    } catch (error) {
      reportNotificationError(error)
    }
  }

  async function resolveSession(token: string): Promise<{ member: IdentityRecord; token: string } | null> {
    if (!token) return null
    const session = await state.readSession(token)
    if (!session) return null
    const member = await repository.findById(session.memberId)
    if (!member || member.status !== 'ACTIVE' || member.authVersion !== session.authVersion) {
      await state.revokeSession(token).catch(() => {})
      return null
    }
    return { member, token }
  }

  async function requireSession(token: string) {
    const session = await resolveSession(token)
    if (!session) throw unavailableIdentity()
    return session
  }

  async function issue(member: IdentityRecord): Promise<AuthenticatedMember> {
    const session = await state.issueSession({ authVersion: member.authVersion, memberId: member.id })
    return { member: memberView(member), sessionToken: session.token }
  }

  async function startRegistrationChallenge(challenge: RegistrationChallenge) {
    const code = verificationCode()
    const idempotencyKey = challengeIdempotencyKey('verification', challenge.email, code)
    const stored = await state.beginChallenge({ code, email: challenge.email, payload: challenge, purpose: 'registration' })
    if (stored === 'username-unavailable') {
      throw new IdentityError('USERNAME_UNAVAILABLE', 'That username is unavailable.')
    }
    if (stored === 'stored') {
      await sendQuietly(() => notifier.sendVerification({ code, email: challenge.email, idempotencyKey }))
    }
  }

  return {
    async changePassword(sessionToken, input) {
      const { member } = await requireSession(sessionToken)
      const valid = member.passwordHash ? await verifyPassword(input.currentPassword, member.passwordHash) : false
      if (!valid) throw new IdentityError('PASSWORD_INVALID', 'The current password is incorrect.')
      const updated = await repository.changePassword(member.id, await hashPassword(input.newPassword))
      if (!updated) throw unavailableIdentity()
      await state.revokeMemberSessions(member.id)
      return issue(updated)
    },
    async deleteAccount(sessionToken, password) {
      const { member } = await requireSession(sessionToken)
      const valid = member.passwordHash ? await verifyPassword(password, member.passwordHash) : false
      if (!valid) throw new IdentityError('PASSWORD_INVALID', 'The current password is incorrect.')
      await repository.tombstone(member.id)
      await state.revokeMemberSessions(member.id)
    },
    async exportMember(sessionToken) {
      const { member } = await requireSession(sessionToken)
      const exported = await repository.exportMember(member.id, clock())
      if (!exported) throw unavailableIdentity()
      return exported
    },
    async getSession(sessionToken) {
      const session = await resolveSession(sessionToken)
      return session ? memberView(session.member) : null
    },
    async getOwnProfile(sessionToken) {
      const { member } = await requireSession(sessionToken)
      return profileView(member, clock())
    },
    async getProfile(username, sessionToken) {
      const resolved = await repository.findByUsername(username)
      if (!resolved) throw new IdentityError('NOT_FOUND', 'Profile not found.')
      const viewer = sessionToken ? await resolveSession(sessionToken) : null
      if (resolved.record.profile.visibility === 'private' && viewer?.member.id !== resolved.record.id) {
        throw new IdentityError('NOT_FOUND', 'Profile not found.')
      }
      return {
        canonicalUsername: resolved.record.profile.username,
        profile: profileView(resolved.record, clock()),
      }
    },
    async login({ email, password }) {
      const normalized = normalizeEmail(email)
      const member = await repository.findByEmail(normalized)
      const passwordHash = member?.passwordHash ?? await dummyPasswordHash()
      const valid = await verifyPassword(password, passwordHash)
      if (!member || member.status !== 'ACTIVE' || !valid) {
        const pending = await state.pendingRegistration(normalized)
        if (pending && await verifyPassword(password, pending.passwordHash)) {
          throw new IdentityError('EMAIL_NOT_VERIFIED', 'Verify your email before signing in.')
        }
        throw invalidCredentials()
      }
      if (!member.emailVerifiedAt) throw new IdentityError('EMAIL_NOT_VERIFIED', 'Verify your email before signing in.')
      return issue(member)
    },
    async logout(sessionToken) {
      await state.revokeSession(sessionToken)
    },
    async logoutAll(sessionToken) {
      const { member } = await requireSession(sessionToken)
      await repository.bumpAuthVersion(member.id)
      await state.revokeMemberSessions(member.id)
    },
    async recoverPassword({ code, email, newPassword }) {
      const normalized = normalizeEmail(email)
      const challenge = await state.consumeChallenge({ code, email: normalized, purpose: 'recovery' })
      if (!challenge || challenge.kind !== 'recovery') throw invalidCode()
      const updated = await repository.changePassword(challenge.memberId, await hashPassword(newPassword))
      if (!updated) throw invalidCode()
      await state.revokeMemberSessions(updated.id)
    },
    async register({ email, password, username }) {
      const normalized = normalizeEmail(email)
      const existing = await repository.findByEmail(normalized)
      if (existing?.status === 'ACTIVE') {
        await sendQuietly(() => notifier.sendRegistrationNotice({ email: normalized, idempotencyKey: `registration-notice/${randomUUID()}` }))
        return
      }
      if (!await repository.isUsernameAvailable(username) || await state.isUsernameReserved(username)) {
        throw new IdentityError('USERNAME_UNAVAILABLE', 'That username is unavailable.')
      }
      const passwordHash = await hashPassword(password)
      await startRegistrationChallenge({ email: normalized, kind: 'registration', passwordHash, username })
    },
    async requestRecovery(email) {
      const normalized = normalizeEmail(email)
      const member = await repository.findByEmail(normalized)
      if (!member || member.status !== 'ACTIVE' || !member.emailVerifiedAt) {
        await verifyPassword(`missing-${randomUUID()}`, await dummyPasswordHash())
        return
      }
      const code = verificationCode()
      const stored = await state.beginChallenge({
        code,
        email: normalized,
        payload: { kind: 'recovery', memberId: member.id },
        purpose: 'recovery',
      })
      if (stored === 'stored') {
        await sendQuietly(() => notifier.sendRecovery({ code, email: normalized, idempotencyKey: challengeIdempotencyKey('recovery', normalized, code) }))
      }
    },
    async requestVerification(email) {
      const normalized = normalizeEmail(email)
      const pending = await state.pendingRegistration(normalized)
      if (pending) {
        await startRegistrationChallenge(pending)
        return
      }
      await sendQuietly(() => notifier.sendRegistrationNotice({ email: normalized, idempotencyKey: `verification-notice/${randomUUID()}` }))
    },
    async updateProfile(sessionToken, input) {
      const { member } = await requireSession(sessionToken)
      const now = clock()
      if (input.username && input.username !== member.profile.username) {
        const nextChangeAt = member.profile.usernameChangedAt
          ? new Date(member.profile.usernameChangedAt.getTime() + USERNAME_CHANGE_COOLDOWN_MS)
          : null
        if (nextChangeAt && nextChangeAt > now) {
          throw new IdentityError('USERNAME_CHANGE_COOLDOWN', `You can change your username after ${nextChangeAt.toISOString()}.`)
        }
        if (!await repository.isUsernameAvailable(input.username) || await state.isUsernameReserved(input.username)) {
          throw new IdentityError('USERNAME_UNAVAILABLE', 'That username is unavailable.')
        }
      }
      try {
        const updated = await repository.updateProfile(member.id, input, now)
        if (!updated) throw unavailableIdentity()
        return profileView(updated, now)
      } catch (error) {
        if (error instanceof Error && error.message === 'IDENTITY_USERNAME_CONFLICT') {
          throw new IdentityError('USERNAME_UNAVAILABLE', 'That username is unavailable.')
        }
        throw error
      }
    },
    async usernameAvailability(username) {
      const available = await repository.isUsernameAvailable(username) && !await state.isUsernameReserved(username)
      return { available, username }
    },
    async verifyEmail({ code, email }) {
      const normalized = normalizeEmail(email)
      const challenge = await state.consumeChallenge({ code, email: normalized, purpose: 'registration' })
      if (!challenge || challenge.kind !== 'registration') throw invalidCode()
      let member: IdentityRecord
      try {
        member = await repository.createVerifiedAccount({ createdAt: clock(), email: normalized, passwordHash: challenge.passwordHash, username: challenge.username })
      } catch (error) {
        if (error instanceof Error && error.message === 'IDENTITY_EMAIL_CONFLICT') {
          throw new IdentityError('CONFLICT', 'This email is already verified. Sign in instead.')
        }
        if (error instanceof Error && error.message === 'IDENTITY_USERNAME_CONFLICT') {
          throw new IdentityError('USERNAME_UNAVAILABLE', 'That username is unavailable.')
        }
        throw error
      }
      return issue(member)
    },
  }
}
