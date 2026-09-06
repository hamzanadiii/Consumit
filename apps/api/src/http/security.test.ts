import { afterEach, describe, expect, it } from 'vitest'

import { buildApp } from '../app.ts'
import { loadEnv } from '../config/env.ts'

const openApps: Awaited<ReturnType<typeof buildApp>>[] = []

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()))
})

describe('security boundary', () => {
  it('reflects only allowlisted origins', async () => {
    const app = await buildApp({
      env: { ...loadEnv({ NODE_ENV: 'test' }), additionalOrigins: ['https://consumit.online'] },
    })
    openApps.push(app)

    const allowed = await app.inject({ headers: { origin: 'https://consumit.online' }, method: 'GET', url: '/health' })
    expect(allowed.headers['access-control-allow-origin']).toBe('https://consumit.online')

    const denied = await app.inject({ headers: { origin: 'https://evil.example' }, method: 'GET', url: '/health' })
    expect(denied.headers['access-control-allow-origin']).toBeUndefined()
  })
})
