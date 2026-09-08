import { afterEach, describe, expect, it } from 'vitest'

import { buildApp } from '../app.ts'
import { createFakeIdentity } from './fake-identity.ts'

const openApps: Awaited<ReturnType<typeof buildApp>>[] = []

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()))
})

describe('member response caching', () => {
  it('marks member-specific reads private and unstoreable', async () => {
    const app = await buildApp({ identity: createFakeIdentity() })
    openApps.push(app)

    for (const url of ['/v1/me', '/v1/me/export']) {
      const response = await app.inject({ method: 'GET', url })
      expect(response.statusCode).toBe(401)
      expect(response.headers['cache-control']).toBe('private, no-store')
    }
  })
})
