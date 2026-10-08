import assert from 'node:assert/strict'
import { test } from 'node:test'
import { assertProductionBackupConfig, assertProductionRuntimeConfig, productionEnvironmentIssues, productionProcessEnvironment } from './production-config.mjs'
import { assertProductionDatabaseUrl } from './production-config.mjs'

const fixture = () => ({ services: {
  api: { environment: { DATABASE_URL: 'postgresql://fixture@database.example/production' } },
  backup: {
    build: { context: '.' }, image: 'consumit-backup:local', command: [], restart: 'no',
    environment: { DATABASE_URL: 'postgresql://fixture@database.example/production', PGSSLMODE: 'verify-full', PGSSLROOTCERT: 'system' },
  },
} })

test('production backup targets the API database and runs as a dedicated verified batch job', () => {
  assert.doesNotThrow(() => assertProductionBackupConfig(fixture()))
})

test('explicit self-hosted databases require verified TLS and separate non-development roles', () => {
  const password = 'f'.repeat(64)
  const options = { mode: 'self-hosted', caFile: '/run/secrets/db-ca.crt' }
  const url = `postgresql://consumit_app:${password}@postgres/consumit?sslmode=verify-full&sslrootcert=/run/secrets/db-ca.crt`
  assert.doesNotThrow(() => assertProductionDatabaseUrl(url, options))
  for (const weak of [url.replace('verify-full', 'require'), url.replace('consumit_app', 'consumit'), url.replace(password, 'consumit-local'), url.replace('postgres/consumit', 'localhost/consumit'), url.replace('/run/secrets/db-ca.crt', '/tmp/other-ca')]) {
    assert.throws(() => assertProductionDatabaseUrl(weak, options))
  }
})

test('production strips inherited SES and AWS credentials rather than leaking another service identity', () => {
  const env = productionProcessEnvironment({ PATH: 'runtime', AWS_ACCESS_KEY_ID: 'local', SES_REGION: 'us-east-1', MIGRATION_DATABASE_URL: 'local' }, { SES_REGION: 'ca-central-1' }, '/private/production')
  assert.equal(env.AWS_ACCESS_KEY_ID, undefined)
  assert.equal(env.MIGRATION_DATABASE_URL, undefined)
  assert.equal(env.SES_REGION, 'ca-central-1')
})

test('a local fallback cannot silently replace the selected production backup database', () => {
  const config = fixture()
  config.services.backup.environment.DATABASE_URL = 'postgresql://fixture@postgres/local'
  assert.throws(() => assertProductionBackupConfig(config), /same database/)
})

test('development cron, restart loops, and upstream-image tags cannot enter production backups', () => {
  for (const change of [{ command: ['sh', '-c', 'crond -f'] }, { restart: 'unless-stopped' }, { image: 'postgres:18-alpine' }]) {
    const config = fixture()
    Object.assign(config.services.backup, change)
    assert.throws(() => assertProductionBackupConfig(config))
  }
})

test('production backup cannot weaken database TLS verification', () => {
  const config = fixture()
  config.services.backup.environment.PGSSLMODE = 'require'
  assert.throws(() => assertProductionBackupConfig(config), /verify database TLS/)
})

test('an explicit weak database URI cannot override the verified backup environment', () => {
  for (const suffix of ['?sslmode=require', '?sslmode=disable', '?sslmode=verify-full&sslmode=require', '?sslrootcert=/tmp/untrusted-ca']) {
    const config = fixture()
    config.services.api.environment.DATABASE_URL += suffix
    config.services.backup.environment.DATABASE_URL = config.services.api.environment.DATABASE_URL
    assert.throws(() => assertProductionBackupConfig(config), /sslmode|trust roots/)
  }
})

test('production processes use their private file and discard inherited development integrations', () => {
  const env = productionProcessEnvironment({ PATH: 'runtime-path', APP_ORIGIN: 'http://localhost:8080', DATABASE_URL: 'postgresql://development', PLAYBACK_RELAY_ENABLED: 'true', PLAYBACK_RELAY_SECRET: 'development-secret', CLOUDFLARE_TUNNEL_TOKEN: 'development-token', CONSUMIT_API_URL: 'http://localhost:3001' }, { APP_ORIGIN: 'https://consumit.online', DATABASE_URL: 'postgresql://production', PLAYBACK_RELAY_ENABLED: 'false' }, '/private/.env.production')
  assert.equal(env.APP_ORIGIN, 'https://consumit.online')
  assert.equal(env.DATABASE_URL, 'postgresql://production')
  assert.equal(env.PLAYBACK_RELAY_SECRET, undefined)
  assert.equal(env.CONSUMIT_API_URL, undefined)
  assert.equal(env.CLOUDFLARE_TUNNEL_TOKEN, undefined)
  assert.equal(env.PATH, 'runtime-path')
  assert.equal(env.CONSUMIT_PRODUCTION_ENV_FILE, '/private/.env.production')
})

test('production preflight rejects templates and reports field names without credentials', () => {
  const issues = productionEnvironmentIssues({ APP_ORIGIN: 'http://localhost:8080', DATABASE_URL: 'postgresql://member:sensitive-password@database.example/consumit?sslmode=require', AUTH_CODE_PEPPER: 'replace-with-at-least-32-random-characters' })
  assert.ok(issues.some(issue => issue.startsWith('APP_ORIGIN')))
  assert.ok(issues.some(issue => issue.startsWith('AUTH_CODE_PEPPER')))
  assert.ok(issues.some(issue => issue.includes('sslmode')))
  assert.ok(!issues.join('\n').includes('sensitive-password'))
})

test('a complete production environment can pass preflight with relay disabled', () => {
  assert.deepEqual(productionEnvironmentIssues({
    APP_ORIGIN: 'https://consumit.online', NEXT_PUBLIC_SITE_URL: 'https://consumit.online',
    AUTH_CODE_PEPPER: 'fixture-production-pepper-at-least-32-characters', AUTH_EMAIL_FROM: 'Consumit <auth@consumit.online>',
    DATABASE_URL: 'postgresql://fixture@managed.postgres.test/production?sslmode=verify-full', DATABASE_SSL_MODE: 'require',
    RESEND_API_KEY: 'fixture-email-key', TMDB_API_READ_TOKEN: 'fixture-catalog-token',
    CLOUDFLARE_TUNNEL_TOKEN: 'fixture-tunnel-token', RESTIC_REPOSITORY: 'sftp:storage-box:/backups/consumit', PLAYBACK_RELAY_ENABLED: 'false',
  }), [])
})

test('production rendering requires the HTTPS first frontend, playback, monitoring and a private edge', () => {
  const config = { services: {
    api: { environment: { NODE_ENV: 'production', APP_ORIGIN: 'https://consumit.online', PLAYBACK_ENABLED: 'true', PLAYBACK_MEDIA_CONFIG: '/run/consumit/providers.json' } },
    web: { build: { args: { NEXT_PUBLIC_SITE_URL: 'https://consumit.online' } } },
    'playback-valkey': {}, prometheus: {}, alertmanager: {}, cloudflared: {}, gateway: { ports: [] },
  } }
  assert.doesNotThrow(() => assertProductionRuntimeConfig(config))
  for (const change of [
    value => { value.services.api.environment.APP_ORIGIN = 'http://localhost:8080' },
    value => { value.services.web.build.args.NEXT_PUBLIC_SITE_URL = 'http://localhost:8080' },
    value => { value.services.api.environment.PLAYBACK_ENABLED = 'false' },
    value => { delete value.services.alertmanager },
    value => { value.services.gateway.ports = [{ published: '8080' }] },
  ]) {
    const broken = structuredClone(config)
    change(broken)
    assert.throws(() => assertProductionRuntimeConfig(broken))
  }
})
