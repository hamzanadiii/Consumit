import { describe, expect, it } from 'vitest'

import { loadEnv } from './env.ts'

describe('API environment', () => {
  it('applies safe local defaults without inventing identity providers', () => {
    expect(loadEnv({ NODE_ENV: 'test' })).toMatchObject({
      appOrigin: 'http://localhost:3000',
      databaseSslMode: 'disable',
      port: 3001,
      tmdbLanguage: 'en-US',
      tmdbRegion: 'US',
      trustedProxies: [],
    })
  })

  it('parses trusted proxies and validates structural values', () => {
    expect(loadEnv({ NODE_ENV: 'test', TRUSTED_PROXIES: '127.0.0.1, 10.0.0.0/8 ' }).trustedProxies).toEqual(['127.0.0.1', '10.0.0.0/8'])
    expect(() => loadEnv({ NODE_ENV: 'test', PORT: 'not-a-port' })).toThrow(/Invalid API configuration/)
    expect(() => loadEnv({ AUTH_CODE_PEPPER: 'short', NODE_ENV: 'test' })).toThrow(/AUTH_CODE_PEPPER/)
  })

  it('allows unavailable integrations in development and test', () => {
    expect(loadEnv({ NODE_ENV: 'development' })).toMatchObject({ databaseUrl: undefined, tmdbToken: undefined, valkeyUrl: undefined })
  })

  it('requires the complete secure production foundation', () => {
    expect(() => loadEnv({ NODE_ENV: 'production' })).toThrow(/required in production/)
    expect(() => loadEnv({
      APP_ORIGIN: 'https://consumit.online',
      AUTH_CODE_PEPPER: 'a-secure-pepper-with-more-than-32-characters',
      AUTH_EMAIL_FROM: 'Consumit <auth@consumit.online>',
      DATABASE_SSL_MODE: 'require',
      DATABASE_URL: 'postgresql://localhost:5432/consumit',
      NODE_ENV: 'production',
      RESEND_API_KEY: 're_example',
      TMDB_API_READ_TOKEN: 'tmdb-token',
      VALKEY_URL: 'valkeys://localhost:6379/0',
    })).not.toThrow()
  })
})
