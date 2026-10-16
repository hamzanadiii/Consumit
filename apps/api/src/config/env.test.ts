import { describe, expect, it } from 'vitest'

import { loadEnv } from './env.ts'

describe('API environment', () => {
  it('allows only the reviewed Miami lookup route with an enabled Cloudflare resolver', () => {
    const config = { NODE_ENV: 'test', PLAYBACK_ENABLED: 'true', PLAYBACK_MEDIA_CONFIG: 'providers.json', PLAYBACK_RESOLVER_ENABLED: 'true', PLAYBACK_RESOLVER_ORIGIN: 'https://resolver.example', PLAYBACK_RESOLVER_SECRET: 'r'.repeat(48) }
    expect(loadEnv({ ...config, PLAYBACK_RESOLVER_API_PROVIDERS: '["wecollege-miami"]' }).playback?.resolver?.apiProviders).toEqual(['wecollege-miami'])
    expect(loadEnv({ ...config, PLAYBACK_RESOLVER_API_PROVIDERS: '[]' }).playback?.resolver?.apiProviders).toBeUndefined()
    for (const routes of ['invalid', '{}', '["lookmovie"]', '["wecollege-miami","wecollege-miami"]', '["aphrodite"]']) {
      expect(() => loadEnv({ ...config, PLAYBACK_RESOLVER_API_PROVIDERS: routes })).toThrow('reviewed Miami route')
    }
    expect(() => loadEnv({ ...config, PLAYBACK_RESOLVER_ENABLED: 'false', PLAYBACK_RESOLVER_API_PROVIDERS: '["wecollege-miami"]' })).toThrow('require the Cloudflare resolver')
  })
  it('allows an independently enabled LookMovie media node and rejects arbitrary node providers', () => {
    const config = { NODE_ENV: 'test', PLAYBACK_ENABLED: 'true', PLAYBACK_MEDIA_CONFIG: 'providers.json', PLAYBACK_NODE_ENABLED: 'true', PLAYBACK_NODE_ORIGIN: 'https://media.example', PLAYBACK_NODE_SECRET: 'n'.repeat(48), PLAYBACK_NODE_PROVIDERS: '{"lookmovie-relay":["srv310.seclar.cyou"]}' }
    expect(loadEnv(config).playback?.relay?.node?.origin).toBe('https://media.example')
    expect(() => loadEnv({ ...config, PLAYBACK_NODE_PROVIDERS: '{"arbitrary":["media.example"]}' })).toThrow('approved media node')
    expect(() => loadEnv({ ...config, PLAYBACK_NODE_ORIGIN: 'http://media.example' })).toThrow('approved media node')
  })
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
  it('keeps the Cloudflare provider resolver disabled until its origin and API secret are configured', () => {
    expect(loadEnv({ NODE_ENV: 'test' }).playback?.resolver).toBeUndefined()
    expect(() => loadEnv({ PLAYBACK_RESOLVER_ENABLED: 'true' })).toThrow('Provider resolver requires')
    const config = { NODE_ENV: 'test', PLAYBACK_ENABLED: 'true', PLAYBACK_MEDIA_CONFIG: 'providers.json', PLAYBACK_RESOLVER_ENABLED: 'true', PLAYBACK_RESOLVER_ORIGIN: 'https://resolver.example', PLAYBACK_RESOLVER_SECRET: 'r'.repeat(48) }
    expect(loadEnv(config).playback?.resolver).toEqual({ origin: 'https://resolver.example', secret: 'r'.repeat(48) })
    expect(() => loadEnv({ ...config, PLAYBACK_RESOLVER_ORIGIN: 'http://resolver.example' })).toThrow('exact HTTPS origin')
    expect(() => loadEnv({ ...config, PLAYBACK_RESOLVER_ORIGIN: 'https://resolver.example/path' })).toThrow('exact HTTPS origin')
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
  it('selects SES without requiring a Resend key and rejects weak self-hosted TLS credentials', () => {
    const source = {
      NODE_ENV: 'production', APP_ORIGIN: 'https://consumit.online',
      AUTH_CODE_PEPPER: 'f'.repeat(64), AUTH_EMAIL_FROM: 'Consumit <auth@consumit.online>',
      AUTH_EMAIL_PROVIDER: 'ses', SES_REGION: 'ca-central-1', SES_CONFIGURATION_SET: 'consumit-auth', SES_CREDENTIALS_FILE: '/run/secrets/ses-aws.json',
      DATABASE_DEPLOYMENT: 'self-hosted', DATABASE_SSL_MODE: 'require', DATABASE_SSL_CA_FILE: '/run/secrets/db-ca.crt',
      DATABASE_URL: `postgresql://consumit_app:${'a'.repeat(64)}@postgres/consumit?sslmode=verify-full&sslrootcert=/run/secrets/db-ca.crt`,
      TMDB_API_READ_TOKEN: 'fixture-token', VALKEY_URL: 'valkey://valkey:6379',
    }
    expect(loadEnv(source)).toMatchObject({ emailProvider: 'ses', ses: { region: 'ca-central-1' } })
    expect(() => loadEnv({ ...source, DATABASE_SSL_CA_FILE: '/tmp/other-ca' })).toThrow(/certificate-verified/)
    expect(() => loadEnv({ ...source, DATABASE_URL: source.DATABASE_URL.replace('verify-full', 'disable') })).toThrow(/certificate-verified/)
    expect(() => loadEnv({ ...source, DATABASE_URL: source.DATABASE_URL.replace('a'.repeat(64), 'consumit-local') })).toThrow(/certificate-verified/)
    expect(() => loadEnv({ ...source, SES_REGION: 'us-east-1' })).toThrow(/SES_REGION/)
  })
})
describe('provider-specific Cloudflare resolver origins', () => {
  const config = { NODE_ENV: 'test', PLAYBACK_ENABLED: 'true', PLAYBACK_MEDIA_CONFIG: 'providers.json', PLAYBACK_RESOLVER_ENABLED: 'true', PLAYBACK_RESOLVER_ORIGIN: 'https://resolver.example', PLAYBACK_RESOLVER_SECRET: 'r'.repeat(48) }
  it('accepts a bounded map of exact HTTPS Worker origins', () => {
    expect(loadEnv({ ...config, PLAYBACK_RESOLVER_PROVIDER_ORIGINS: '{"animekitsu":"https://regional.example"}' }).playback?.resolver?.providerOrigins).toEqual({ animekitsu: 'https://regional.example' })
  })
  it.each(['[]', '{"animekitsu":"http://regional.example"}', '{"animekitsu":"https://regional.example/path"}', '{"animekitsu":"https://user:password@regional.example"}', '{"Bad ID":"https://regional.example"}'])('rejects invalid routing: %s', raw => {
    expect(() => loadEnv({ ...config, PLAYBACK_RESOLVER_PROVIDER_ORIGINS: raw })).toThrow('Provider resolver routes')
  })
  it('rejects routes when the resolver is disabled', () => {
    expect(() => loadEnv({ ...config, PLAYBACK_RESOLVER_ENABLED: 'false', PLAYBACK_RESOLVER_PROVIDER_ORIGINS: '{"animekitsu":"https://regional.example"}' })).toThrow('require the Cloudflare resolver')
  })
  it('enables isolated computation only with the resolver and a separate secret', () => {
    expect(() => loadEnv({ ...config, PLAYBACK_RESOLVER_COMPUTE_ENABLED: 'true' })).toThrow('separate secret')
    expect(() => loadEnv({ ...config, PLAYBACK_RESOLVER_COMPUTE_ENABLED: 'true', PLAYBACK_RESOLVER_COMPUTE_SECRET: 'r'.repeat(48) })).toThrow('separate secret')
    expect(loadEnv({ ...config, PLAYBACK_RESOLVER_COMPUTE_ENABLED: 'true', PLAYBACK_RESOLVER_COMPUTE_SECRET: 'c'.repeat(48) }).playback?.resolver?.computeSecret).toBe('c'.repeat(48))
    expect(() => loadEnv({ ...config, PLAYBACK_RESOLVER_ENABLED: 'false', PLAYBACK_RESOLVER_COMPUTE_ENABLED: 'true', PLAYBACK_RESOLVER_COMPUTE_SECRET: 'c'.repeat(48) })).toThrow('enabled resolver')
  })
})

describe('regional relay control policy', () => {
  const config = { NODE_ENV: 'test', PLAYBACK_ENABLED: 'true', PLAYBACK_MEDIA_CONFIG: 'providers.json', PLAYBACK_RELAY_ENABLED: 'true', PLAYBACK_RELAY_ORIGIN: 'https://edge.example', PLAYBACK_RELAY_SECRET: 's'.repeat(48), PLAYBACK_RELAY_PROVIDERS: '{"rigel":["api.dlproxy.com"]}' }
  it('requires exact origins, approved provider scopes, and the reviewed Rigel control route', () => {
    expect(loadEnv({ ...config, PLAYBACK_RELAY_PROVIDER_ORIGINS: '{"rigel":"https://regional.example"}', PLAYBACK_RELAY_CONTROL_PROVIDERS: '["rigel"]' }).playback?.relay).toMatchObject({ providerOrigins: { rigel: 'https://regional.example' }, controlProviders: ['rigel'] })
    expect(() => loadEnv({ ...config, PLAYBACK_RELAY_PROVIDER_ORIGINS: '{"unknown":"https://regional.example"}' })).toThrow('approved media policy')
    expect(() => loadEnv({ ...config, PLAYBACK_RELAY_PROVIDER_ORIGINS: '{"rigel":"http://regional.example"}' })).toThrow('exact HTTPS')
    expect(() => loadEnv({ ...config, PLAYBACK_RELAY_CONTROL_PROVIDERS: '["lookmovie"]' })).toThrow('reviewed Rigel')
    expect(() => loadEnv({ ...config, PLAYBACK_RELAY_CONTROL_PROVIDERS: '["rigel","rigel"]' })).toThrow('reviewed Rigel')
    expect(() => loadEnv({ ...config, PLAYBACK_RELAY_PROVIDERS: '{}', PLAYBACK_RELAY_CONTROL_PROVIDERS: '["rigel"]' })).toThrow('approved media policy')
    expect(() => loadEnv({ ...config, PLAYBACK_RELAY_ENABLED: 'false', PLAYBACK_RELAY_CONTROL_PROVIDERS: '["rigel"]' })).toThrow('enabled Cloudflare relay')
  })
})

describe('split production playback state', () => {
  it('requires shared session state and independent authentication limits', () => {
    const source = { NODE_ENV: 'production', APP_ORIGIN: 'https://consumit.online', APPLICATION_MODE: 'playback', INTERNAL_API_ORIGIN: 'http://api:3001', INTERNAL_SERVICE_SECRET: 's'.repeat(64), PLAYBACK_ENABLED: 'true', PLAYBACK_MEDIA_CONFIG: '/run/consumit/providers.json' }
    expect(() => loadEnv(source)).toThrow('Split playback requires')
    expect(() => loadEnv({ ...source, PLAYBACK_VALKEY_URL: 'valkey://playback-valkey:6379/0', VALKEY_URL: 'valkey://valkey:6379/0' })).not.toThrow()
  })
})
