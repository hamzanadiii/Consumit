import { afterEach, describe, expect, it } from 'vitest'

import { buildApp } from '../app.ts'
import { loadEnv } from '../config/env.ts'
import { createFakeIdentity } from './fake-identity.ts'
import { sessionCookieName } from './session.ts'

const origin = 'http://localhost:3000'

describe('identity profile routes', () => {
  const apps: Array<Awaited<ReturnType<typeof buildApp>>> = []
  afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())))

  it('registers a chosen username and serves the authenticated real profile', async () => {
    const identity = createFakeIdentity()
    const env = loadEnv({ APP_ORIGIN: origin, NODE_ENV: 'test' })
    const app = await buildApp({ env, identity })
    apps.push(app)

    const registration = await app.inject({ headers: { origin }, method: 'POST', payload: { email: 'member@example.com', password: 'long-enough-password', username: 'cinema_fan' }, url: '/v1/auth/register' })
    expect(registration.statusCode).toBe(202)
    expect((await app.inject({ method: 'GET', url: '/v1/usernames/cinema_fan/availability' })).json()).toEqual({ available: false, username: 'cinema_fan' })

    const delivery = identity.notifier.deliveries.findLast((item) => item.kind === 'verification')
    if (!delivery || !('code' in delivery)) throw new Error('Expected verification delivery.')
    const verification = await app.inject({ headers: { origin }, method: 'POST', payload: { code: delivery.code, email: 'member@example.com' }, url: '/v1/auth/verify-email' })
    const cookie = verification.cookies.find((item) => item.name === sessionCookieName(env))
    expect(cookie).toBeDefined()

    const profile = await app.inject({ cookies: { [sessionCookieName(env)]: cookie!.value }, method: 'GET', url: '/v1/me/profile' })
    expect(profile.statusCode).toBe(200)
    expect(profile.json()).toMatchObject({ bio: null, username: 'cinema_fan', visibility: 'private' })
  })

  it('rejects profile mutations without the same-origin header', async () => {
    const app = await buildApp({ env: loadEnv({ APP_ORIGIN: origin, NODE_ENV: 'test' }), identity: createFakeIdentity() })
    apps.push(app)
    const response = await app.inject({ method: 'PATCH', payload: { displayName: 'Member' }, url: '/v1/me/profile' })
    expect(response.statusCode).toBe(403)
  })
})
