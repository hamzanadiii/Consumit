import { describe, expect, it } from 'vitest'

import { loadEnv } from './env.ts'

describe('API environment', () => {
  it.each(['https://member:password@example.com', 'https://example.com/path', 'https://example.com?query=1', 'https://example.com#fragment', 'ftp://example.com'])('rejects an unsafe application origin: %s', (APP_ORIGIN) => {
    expect(() => loadEnv({ NODE_ENV: 'test', APP_ORIGIN })).toThrow(/origin/i)
  })
  it('requires HTTPS for the production application origin', () => {
    expect(() => loadEnv({ NODE_ENV: 'production', APP_ORIGIN: 'http://example.com' })).toThrow(/HTTPS/)
  })
  it('keeps relay disabled and requires explicit exact-host permission and complete configuration', () => {
    expect(loadEnv({ NODE_ENV: 'test' }).playback?.relay).toBeUndefined()
    expect(() => loadEnv({ PLAYBACK_RELAY_ENABLED: 'true' })).toThrow('Relay requires')
    const config = { NODE_ENV: 'test', PLAYBACK_ENABLED: 'true', PLAYBACK_MEDIA_CONFIG: 'providers.json', PLAYBACK_RELAY_ENABLED: 'true', PLAYBACK_RELAY_ORIGIN: 'https://edge.example', PLAYBACK_RELAY_SECRET: 'x'.repeat(48), PLAYBACK_RELAY_PROVIDERS: '{"owned":["media.example"]}' }
    expect(loadEnv(config).playback?.relay?.providers).toEqual({ owned: ['media.example'] })
    expect(loadEnv({ ...config, PLAYBACK_RELAY_PROVIDERS: '{}' }).playback?.relay?.providers).toEqual({})
    expect(() => loadEnv({ ...config, PLAYBACK_RELAY_PROVIDERS: '{"owned":["*.workers.dev"]}' })).toThrow('exact approved')
    expect(() => loadEnv({ ...config, PLAYBACK_RELAY_ORIGIN: 'http://edge.example' })).toThrow('HTTPS origin')
    expect(() => loadEnv({ ...config, PLAYBACK_RELAY_ORIGIN: 'https://edge.example/media' })).toThrow('HTTPS origin')
  })
  it('keeps playback state separate and requires a media config', () => {
    expect(loadEnv({ NODE_ENV: 'test' }).playback?.enabled).toBe(false)
    expect(() => loadEnv({ PLAYBACK_ENABLED: 'true' })).toThrow('Playback requires')
    expect(() => loadEnv({ PLAYBACK_VALKEY_URL: 'valkey://cache:6379/1', VALKEY_URL: 'valkey://cache:6379/0' })).toThrow('separate Valkey')
  })
  it('runs single-instance playback without Valkey and requires it past one instance', () => {
    const single = loadEnv({ NODE_ENV: 'test', PLAYBACK_ENABLED: 'true', PLAYBACK_MEDIA_CONFIG: '/run/consumit/providers.json' })
    expect(single.playback).toMatchObject({ enabled: true, instances: 1, stateUrl: undefined })
    expect(() => loadEnv({
      NODE_ENV: 'test', PLAYBACK_ENABLED: 'true', PLAYBACK_MEDIA_CONFIG: '/run/consumit/providers.json', PLAYBACK_INSTANCES: '2',
    })).toThrow('Multi-instance playback requires PLAYBACK_VALKEY_URL')
    expect(loadEnv({
      NODE_ENV: 'test', PLAYBACK_ENABLED: 'true', PLAYBACK_MEDIA_CONFIG: '/run/consumit/providers.json',
      PLAYBACK_INSTANCES: '2', PLAYBACK_VALKEY_URL: 'valkey://playback:6379/0',
    }).playback).toMatchObject({ instances: 2 })
  })
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
    expect(() => loadEnv({ NODE_ENV: 'production', APP_ORIGIN: 'https://consumit.online' })).toThrow(/required in production/)
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
  it('rejects example authentication peppers in production without disclosing them', () => {
    for (const AUTH_CODE_PEPPER of ['replace-with-at-least-32-random-characters', 'consumit-local-pepper-at-least-32-characters']) {
      expect(() => loadEnv({ NODE_ENV: 'production', APP_ORIGIN: 'https://consumit.online', AUTH_CODE_PEPPER })).toThrow(/new production secret/)
    }
  })
})
