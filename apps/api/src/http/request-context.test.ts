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
  it('removes signed playlist query capabilities from request logs', () => {
    const serialize = loggerOptions().serializers.req
    const result = serialize({ method: 'GET', url: '/v1/playback/relay-manifest?grant=private-capability', id: 'request-1' })
    expect(result).toMatchObject({ method: 'GET', url: '/v1/playback/relay-manifest', id: 'request-1' })
    expect(JSON.stringify(result)).not.toContain('private-capability')
  })
  it('projects exceptions without provider URLs, messages, causes or stacks', () => {
    const error = new Error('https://provider.example/?token=credential', { cause: new Error('password=secret') })
    expect(loggerOptions().serializers.err(error)).toEqual({ type: 'Error', message: 'Exception details withheld.', stack: '' })
  })
})
