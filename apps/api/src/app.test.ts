import { afterEach, describe, expect, it } from 'vitest'

import { buildApp } from './app.ts'

const openApps: Awaited<ReturnType<typeof buildApp>>[] = []

afterEach(async () => {
  await Promise.all(openApps.splice(0).map((app) => app.close()))
})

describe('API health', () => {
  it('reports that the process is healthy', async () => {
    const app = await buildApp()
    openApps.push(app)

    const response = await app.inject({ method: 'GET', url: '/health' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'ok' })
  })
})

describe('API shutdown', () => {
  it('closes cleanly so the process can drain and exit', async () => {
    const app = await buildApp()

    await expect(app.close()).resolves.toBeUndefined()
  })
})
