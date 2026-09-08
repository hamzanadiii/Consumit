import { describe, expect, it } from 'vitest'

import { createFakeIdentity } from './fake-identity.ts'

describe('member usernames', () => {
  it('keeps member identity stable, preserves aliases, and enforces the change cooldown', async () => {
    let now = new Date('2026-09-07T00:00:00.000Z')
    const identity = createFakeIdentity({ clock: () => now })
    await identity.register({ email: 'member@example.com', password: 'long-enough-password', username: 'first_name' })
    const code = identity.notifier.deliveries.findLast((delivery) => delivery.kind === 'verification')
    if (!code || !('code' in code)) throw new Error('Expected verification code.')
    const authenticated = await identity.verifyEmail({ code: code.code, email: 'member@example.com' })

    await expect(identity.updateProfile(authenticated.sessionToken, { username: 'second_name' }))
      .rejects.toMatchObject({ code: 'USERNAME_CHANGE_COOLDOWN' })

    now = new Date(now.getTime() + 29 * 24 * 60 * 60 * 1000)
    const currentSession = await identity.login({ email: 'member@example.com', password: 'long-enough-password' })
    now = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000)
    const updated = await identity.updateProfile(currentSession.sessionToken, {
      bio: 'Real member profile.',
      displayName: 'Member',
      location: 'Rabat',
      username: 'second_name',
      visibility: 'public',
    })
    expect(updated.username).toBe('second_name')
    expect((await identity.getSession(currentSession.sessionToken))?.id).toBe(authenticated.member.id)
    expect(await identity.getProfile('first_name')).toMatchObject({ canonicalUsername: 'second_name', profile: { username: 'second_name' } })
    expect(await identity.usernameAvailability('first_name')).toEqual({ available: false, username: 'first_name' })
  })
})
