import { describe, expect, it } from 'vitest'

import { loadEnv } from './env.ts'

describe('API environment', () => {
  it('applies safe defaults', () => {
    expect(loadEnv({ NODE_ENV: 'test' })).toMatchObject({
      port: 3001,
      tmdbLanguage: 'en-US',
      tmdbRegion: 'US',
      webOrigin: 'http://localhost:3000',
    })
  })

  it('rejects a structurally invalid configuration', () => {
    expect(() => loadEnv({ NODE_ENV: 'test', PORT: 'not-a-port' })).toThrow(/Invalid API configuration/)
  })

  it('allows a missing TMDB token outside production so catalog degrades instead of crashing boot', () => {
    expect(loadEnv({ NODE_ENV: 'development' }).tmdbToken).toBeUndefined()
    expect(loadEnv({ NODE_ENV: 'test' }).tmdbToken).toBeUndefined()
  })

  it('parses additional CORS origins as a trimmed list', () => {
    expect(loadEnv({ NODE_ENV: 'test' }).additionalOrigins).toEqual([])
    expect(
      loadEnv({ ADDITIONAL_ORIGINS: 'https://consumit.online, https://www.consumit.online ', NODE_ENV: 'production' }).additionalOrigins,
    ).toEqual(['https://consumit.online', 'https://www.consumit.online'])
  })
})
