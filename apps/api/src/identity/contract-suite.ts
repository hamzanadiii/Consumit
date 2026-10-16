import { describe, expect, it } from 'vitest'

import type { AuthStateStore } from './auth-state.ts'
import { IdentityError } from './errors.ts'
import type { Identity } from './identity.ts'
import type { DeliveredAuthNotification } from './memory-notifier.ts'
import type { IdentityRepository } from './repository.ts'

export type IdentityHarness = {
  cleanup(): Promise<void>
  identity: Identity
  notifier: { deliveries: DeliveredAuthNotification[] }
  repository: IdentityRepository
  state: AuthStateStore & { expireSession?(token: string): void; sessionCount?(): number }
}

function latestCode(harness: IdentityHarness, kind: 'recovery' | 'verification') {
  const delivery = harness.notifier.deliveries.findLast((item) => item.kind === kind)
  if (!delivery || !('code' in delivery)) throw new Error(`Expected a ${kind} delivery.`)
  return delivery.code
}

async function verifyNewMember(harness: IdentityHarness, email = 'hamza@example.com', password = 'long-enough-password', username = 'hamza') {
  await harness.identity.register({ email, password, username })
  return harness.identity.verifyEmail({ code: latestCode(harness, 'verification'), email })
}

async function caughtIdentityError(promise: Promise<unknown>) {
  try {
    await promise
  } catch (error) {
    expect(error).toBeInstanceOf(IdentityError)
    return error as IdentityError
  }
  throw new Error('Expected an IdentityError.')
}

export function describeIdentityContract(name: string, setup: () => Promise<IdentityHarness>) {
  describe(`identity contract: ${name}`, () => {
    it('keeps registration ephemeral until the email code is consumed', async () => {
      const harness = await setup()
      try {
        await harness.identity.register({ email: '  Hamza@Example.com ', password: 'long-enough-password', username: 'hamza' })
        expect(await harness.repository.findByEmail('hamza@example.com')).toBeNull()
        expect((await caughtIdentityError(harness.identity.login({ email: 'hamza@example.com', password: 'long-enough-password' }))).code).toBe('EMAIL_NOT_VERIFIED')

        const authenticated = await harness.identity.verifyEmail({ code: latestCode(harness, 'verification'), email: ' HAMZA@example.com ' })
        expect(authenticated.member).toMatchObject({ email: 'hamza@example.com', emailVerified: true, username: 'hamza' })
        expect(await harness.identity.getSession(authenticated.sessionToken)).toEqual(authenticated.member)
      } finally {
        await harness.cleanup()
      }
    })

    it('does not reveal whether invalid credentials belong to a member', async () => {
      const harness = await setup()
      try {
        await verifyNewMember(harness)
        const wrong = await caughtIdentityError(harness.identity.login({ email: 'hamza@example.com', password: 'wrong-password-long' }))
        const unknown = await caughtIdentityError(harness.identity.login({ email: 'nobody@example.com', password: 'wrong-password-long' }))
        expect(wrong.code).toBe('INVALID_CREDENTIALS')
        expect(unknown.code).toBe(wrong.code)
        expect(unknown.message).toBe(wrong.message)
      } finally {
        await harness.cleanup()
      }
    })

    it('reserves usernames while registration is pending and permanently after verification', async () => {
      const harness = await setup()
      try {
        await harness.identity.register({ email: 'first@example.com', password: 'long-enough-password', username: 'cinema_fan' })
        expect(await harness.identity.usernameAvailability('cinema_fan')).toEqual({ available: false, username: 'cinema_fan' })
        expect((await caughtIdentityError(harness.identity.register({ email: 'second@example.com', password: 'long-enough-password', username: 'cinema_fan' }))).code).toBe('USERNAME_UNAVAILABLE')
        await harness.identity.verifyEmail({ code: latestCode(harness, 'verification'), email: 'first@example.com' })
        expect(await harness.identity.usernameAvailability('cinema_fan')).toEqual({ available: false, username: 'cinema_fan' })
      } finally {
        await harness.cleanup()
      }
    })

    it('rotates credentials, invalidates old sessions, and returns a safe export', async () => {
      const harness = await setup()
      try {
        const first = await verifyNewMember(harness)
        const second = await harness.identity.login({ email: first.member.email, password: 'long-enough-password' })
        const replacement = await harness.identity.changePassword(first.sessionToken, {
          currentPassword: 'long-enough-password',
          newPassword: 'different-long-password',
        })
        expect(await harness.identity.getSession(first.sessionToken)).toBeNull()
        expect(await harness.identity.getSession(second.sessionToken)).toBeNull()
        const exported = await harness.identity.exportMember(replacement.sessionToken)
        expect(exported.member.email).toBe('hamza@example.com')
        expect(JSON.stringify(exported)).not.toMatch(/password|credential|session|code/i)
      } finally {
        await harness.cleanup()
      }
    })

    it('recovers a password without issuing a session and revokes every old session', async () => {
      const harness = await setup()
      try {
        const first = await verifyNewMember(harness)
        await harness.identity.requestRecovery(first.member.email)
        await harness.identity.recoverPassword({
          code: latestCode(harness, 'recovery'),
          email: first.member.email,
          newPassword: 'recovered-long-password',
        })
        expect(await harness.identity.getSession(first.sessionToken)).toBeNull()
        await expect(harness.identity.login({ email: first.member.email, password: 'recovered-long-password' })).resolves.toMatchObject({ member: { id: first.member.id } })
      } finally {
        await harness.cleanup()
      }
    })

    it('persists a member-chosen avatar tile without touching the username cooldown', async () => {
      const harness = await setup()
      try {
        const authenticated = await verifyNewMember(harness)
        expect(authenticated.member.avatarStyle).toBe('dusk')
        expect(authenticated.member.avatarUrl).toBeNull()
        const updated = await harness.identity.updateProfile(authenticated.sessionToken, { avatarStyle: 'noir', avatarUrl: 'https://api.dicebear.com/7.x/notionists/svg?seed=abc', bannerUrl: 'https://image.tmdb.org/t/p/w1280/abc.jpg', displayName: 'Hamza' })
        expect(updated.avatarStyle).toBe('noir')
        expect(updated.avatarUrl).toBe('https://api.dicebear.com/7.x/notionists/svg?seed=abc')
        expect(updated.bannerUrl).toBe('https://image.tmdb.org/t/p/w1280/abc.jpg')
        expect(updated.displayName).toBe('Hamza')
        expect(updated.username).toBe('hamza')
        const cleared = await harness.identity.updateProfile(authenticated.sessionToken, { avatarUrl: null })
        expect(cleared.avatarUrl).toBeNull()
      } finally {
        await harness.cleanup()
      }
    })

    it('tombstones the account and invalidates its sessions', async () => {      const harness = await setup()
      try {
        const authenticated = await verifyNewMember(harness)
        await harness.identity.deleteAccount(authenticated.sessionToken, 'long-enough-password')
        expect(await harness.identity.getSession(authenticated.sessionToken)).toBeNull()
        expect(await harness.repository.findByEmail(authenticated.member.email)).toBeNull()
      } finally {
        await harness.cleanup()
      }
    })
  })
}
