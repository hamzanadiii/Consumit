import { Valkey } from 'iovalkey'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { buildApp } from '../app.ts'
import { loadEnv } from '../config/env.ts'
import { createFakeCatalog } from '../catalog/fake-catalog.ts'
import { createFakeIdentity } from '../identity/fake-identity.ts'

const url = process.env.VALKEY_URL
if (!url) throw new Error('VALKEY_URL is required for rate-limit integration tests.')
const control = new Valkey(url, { maxRetriesPerRequest: 1 })
beforeEach(async () => control.flushdb())
afterAll(async () => control.quit())

describe('production request budgets', () => {
  it('shares the credential budget across instances and process restarts', async () => {
    const env = { ...loadEnv({ NODE_ENV: 'test', APP_ORIGIN: 'https://consumit.example' }), nodeEnv: 'production' as const, valkeyUrl: url }
    const create = () => buildApp({ env, catalog: createFakeCatalog(), identity: createFakeIdentity() })
    const first = await create()
    const second = await create()
    let restarted: Awaited<ReturnType<typeof create>> | undefined
    try {
      for (let attempt = 0; attempt < 10; attempt++) {
        const app = attempt % 2 ? first : second
        const response = await app.inject({ method: 'POST', url: '/v1/auth/login', headers: { origin: env.appOrigin }, payload: {} })
        expect(response.statusCode).toBe(400)
      }
      await first.close()
      restarted = await create()
      const limited = await restarted.inject({ method: 'POST', url: '/v1/auth/login', headers: { origin: env.appOrigin }, payload: {} })
      expect(limited.statusCode).toBe(429)
      expect(limited.json().error.code).toBe('RATE_LIMITED')
    } finally { await Promise.all([first.close(), second.close(), restarted?.close()]) }
  })
})
