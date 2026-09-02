import { afterEach, describe, expect, it } from 'vitest'

import { buildApp } from './app.ts'

const openApps: ReturnType<typeof buildApp>[] = []

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()))
})

describe('API health', () => {
  it('reports that the process is healthy', async () => {
    const app = buildApp()
    openApps.push(app)

    const response = await app.inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'ok' })
  })
})
