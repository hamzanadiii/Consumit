import { afterEach, describe, expect, it } from 'vitest'

import { buildApp } from '../../app.ts'
import { createFakeCatalog } from '../../catalog/fake-catalog.ts'
import { loadEnv } from '../../config/env.ts'
import { createFakeIdentity } from '../../identity/fake-identity.ts'
import { sessionCookieName } from '../../identity/session.ts'
import { createLetterboxdImporter } from './importer.ts'
import { createMemoryLetterboxdImportRepository } from './memory-repository.ts'

const origin = 'http://localhost:3000'

function multipart(filename: string, content: string) {
  const boundary = 'consumit-letterboxd-boundary'
  const payload = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="archive"; filename="${filename}"\r\nContent-Type: text/csv\r\n\r\n${content}\r\n--${boundary}--\r\n`)
  return { headers: { 'content-type': `multipart/form-data; boundary=${boundary}`, origin }, payload }
}

describe('Letterboxd import routes', () => {
  const apps: Array<Awaited<ReturnType<typeof buildApp>>> = []
  afterEach(async () => Promise.all(apps.splice(0).map((app) => app.close())))

  it('accepts an authenticated upload and exposes durable progress', async () => {
    const identity = createFakeIdentity()
    await identity.register({ email: 'member@example.com', password: 'long-enough-password', username: 'cinema_fan' })
    const delivery = identity.notifier.deliveries.findLast((item) => item.kind === 'verification')
    if (!delivery || !('code' in delivery)) throw new Error('Expected verification delivery.')
    const session = await identity.verifyEmail({ code: delivery.code, email: 'member@example.com' })
    const repository = createMemoryLetterboxdImportRepository()
    const importer = createLetterboxdImporter({ catalog: createFakeCatalog(), repository })
    const env = loadEnv({ APP_ORIGIN: origin, NODE_ENV: 'test' })
    const app = await buildApp({ env, identity, letterboxdImporter: importer })
    apps.push(app)
    const cookie = { [sessionCookieName(env)]: session.sessionToken }

    const upload = await app.inject({ ...multipart('watched.csv', 'Title,Year,tmdbID\nPast Lives,2023,666277\n'), cookies: cookie, method: 'POST', url: '/v1/me/imports/letterboxd' })
    expect(upload.statusCode).toBe(202)
    expect(upload.json()).toMatchObject({ status: 'uploaded' })
    const history = await app.inject({ cookies: cookie, method: 'GET', url: '/v1/me/imports/letterboxd' })
    expect(history.json().imports).toHaveLength(1)
  })

  it('rejects unauthenticated and cross-site uploads', async () => {
    const app = await buildApp({ env: loadEnv({ APP_ORIGIN: origin, NODE_ENV: 'test' }), identity: createFakeIdentity(), letterboxdImporter: createLetterboxdImporter({ catalog: createFakeCatalog(), repository: createMemoryLetterboxdImportRepository() }) })
    apps.push(app)
    const body = multipart('watched.csv', 'Title,Year\nPast Lives,2023\n')
    expect((await app.inject({ ...body, method: 'POST', url: '/v1/me/imports/letterboxd' })).statusCode).toBe(401)
    expect((await app.inject({ ...body, headers: { ...body.headers, origin: 'https://evil.example' }, method: 'POST', url: '/v1/me/imports/letterboxd' })).statusCode).toBe(403)
  })
})
