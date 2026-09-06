import { afterEach, describe, expect, it } from 'vitest'

import { buildApp } from '../app.ts'
import { loggerOptions } from './request-context.ts'

const openApps: Awaited<ReturnType<typeof buildApp>>[] = []

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()))
})

describe('request context', () => {
  it('echoes a well-formed caller request id back for correlation', async () => {
    const app = await buildApp()
    openApps.push(app)

    const response = await app.inject({ headers: { 'x-request-id': 'web-req-123' }, method: 'GET', url: '/health' })

    expect(response.headers['x-request-id']).toBe('web-req-123')
  })

  it('replaces a malformed caller request id with a generated one', async () => {
    const app = await buildApp()
    openApps.push(app)

    const response = await app.inject({ headers: { 'x-request-id': 'evil\r\nid with spaces' }, method: 'GET', url: '/health' })
    const echoed = String(response.headers['x-request-id'] ?? '')

    expect(echoed).not.toBe('evil\r\nid with spaces')
    expect(echoed).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('redacts credentials from structured logs', () => {
    const options = loggerOptions()

    expect(options).toMatchObject({ redact: expect.anything() })
    const paths = (options.redact as { paths: string[] }).paths
    expect(paths).toEqual(
      expect.arrayContaining([
        'req.headers.authorization',
        'req.headers.cookie',
        'req.body.password',
      ]),
    )
  })
})
