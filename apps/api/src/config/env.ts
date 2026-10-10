import { z } from 'zod'
import { parseRelayProviders, parseRelayDiscovery, type PlaybackRelayConfig } from '../playback/relay.ts'

const envSchema = z.object({
  APP_ORIGIN: z.url().default('http://localhost:3000'),
  RELEASE_TRACKING_ENABLED: z.enum(['true', 'false']).default('false'),
  RELEASE_WORKER_SECRET: z.string().min(32).max(256).optional(),
  AUTH_CODE_PEPPER: z.string().min(32).optional(),
  AUTH_EMAIL_FROM: z.string().trim().min(3).optional(),
  DATABASE_SSL_CA: z.string().optional(),
  DATABASE_SSL_CA_FILE: z.string().min(1).optional(),
  DATABASE_DEPLOYMENT: z.enum(['managed', 'self-hosted']).default('managed'),
  AUTH_EMAIL_PROVIDER: z.enum(['resend', 'ses']).default('resend'),
  SES_REGION: z.literal('ca-central-1').optional(),
  SES_CONFIGURATION_SET: z.string().min(1).optional(),
  SES_CREDENTIALS_FILE: z.string().min(1).optional(),
  DATABASE_SSL_MODE: z.enum(['disable', 'require']).default('disable'),
  DATABASE_URL: z.string().trim().min(1).optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  PLAYBACK_ENABLED: z.enum(['true', 'false']).default('false'),
  PLAYBACK_RELAY_ENABLED: z.enum(['true', 'false']).default('false'),
  PLAYBACK_RELAY_ORIGIN: z.url().optional(),
  PLAYBACK_RELAY_SECRET: z.string().min(32).optional(),
  PLAYBACK_RELAY_PROVIDERS: z.string().max(30000).optional(),
  PLAYBACK_RELAY_DISCOVERY_PROVIDERS: z.string().max(512).optional(),
  PLAYBACK_VALKEY_URL: z.string().min(1).optional(),
  PLAYBACK_MEDIA_CONFIG: z.string().min(1).optional(),
  PLAYBACK_INSTANCES: z.coerce.number().int().min(1).max(100).default(1),
  PLAYBACK_PROBE_INTERVAL_MINUTES: z.coerce.number().int().min(0).max(1440).default(30),
  ADMIN_METRICS_URL: z.url().optional(),
  RESEND_API_KEY: z.string().trim().min(1).optional(),
  SUBDL_API_KEY: z.string().trim().min(1).optional(),
  SUBTITLES_DIR: z.string().trim().min(1).optional(),
  JIMAKU_API_KEY: z.string().trim().min(1).optional(),
  OPENSUBTITLES_API_KEY: z.string().trim().min(1).optional(),
  OPENSUBTITLES_USER: z.string().trim().min(1).optional(),
  OPENSUBTITLES_PASS: z.string().trim().min(1).optional(),
  TMDB_API_READ_TOKEN: z.string().trim().min(1).optional(),
  TMDB_LANGUAGE: z.string().trim().min(1).default('en-US'),
  TMDB_REGION: z.string().trim().length(2).default('US'),
  TRUSTED_PROXIES: z.string().optional(),
  VALKEY_URL: z.string().trim().min(1).optional(),
})

export type ApiEnv = {
  releases?: { enabled: boolean; workerSecret: string | undefined }
  playback?: {
    relay?: PlaybackRelayConfig
    enabled: boolean; stateUrl: string | undefined; mediaConfig: string | undefined;
    /** Advertised API/resolver instance count. Past one, shared Valkey state
     *  is mandatory (resolver cache, sessions, rate limits, health). */
    instances: number
    /** Synthetic probe cadence in ms (0 disables). Probes never shape
     *  traffic; they only report to logs and the admin health endpoint. */
    probeIntervalMs: number
  }
  adminMetricsUrl: string | undefined
  appOrigin: string
  authCodePepper: string | undefined
  authEmailFrom: string | undefined
  databaseSslCa: string | undefined
  databaseSslCaFile?: string
  emailProvider?: 'resend' | 'ses'
  ses?: { region: string; configurationSet: string; credentialsFile: string }
  databaseSslMode: 'disable' | 'require'
  databaseUrl: string | undefined
  nodeEnv: 'development' | 'test' | 'production'
  port: number
  resendApiKey: string | undefined
  subtitleKeys: {
    subdl: string | undefined
    jimaku: string | undefined
    openSubtitles: { apiKey: string; user: string; pass: string } | undefined
  }
  /** VPS-disk directory for converted VTT + original subtitle files. Unset
   *  keeps the store backend (Valkey/memory, converted VTT only). */
  subtitlesDir: string | undefined
  tmdbLanguage: string
  tmdbRegion: string
  tmdbToken: string | undefined
  trustedProxies: string[]
  valkeyUrl: string | undefined
}

export function loadEnv(source: Record<string, string | undefined> = process.env): ApiEnv {
  const parsed = envSchema.safeParse(Object.fromEntries(Object.entries(source).filter(([, value]) => value !== '')))
  if (!parsed.success) {
    throw new Error(`Invalid API configuration: ${parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`)
  }
  const value = parsed.data
  if (value.RELEASE_TRACKING_ENABLED === 'true' && (!value.DATABASE_URL || !value.RELEASE_WORKER_SECRET || value.PLAYBACK_ENABLED !== 'true')) {
    throw new Error('Release tracking requires a database, playback, and RELEASE_WORKER_SECRET.')
  }
  const appUrl = new URL(value.APP_ORIGIN)
  if (!['http:', 'https:'].includes(appUrl.protocol) || appUrl.username || appUrl.password
      || appUrl.pathname !== '/' || appUrl.search || appUrl.hash) {
    throw new Error('Invalid API configuration: APP_ORIGIN must be an exact HTTP(S) origin without credentials, a path, query or fragment.')
  }
  if (value.NODE_ENV === 'production' && appUrl.protocol !== 'https:') {
    throw new Error('Invalid API configuration: APP_ORIGIN requires HTTPS in production.')
  }
  let relay: PlaybackRelayConfig | undefined
  if (value.PLAYBACK_RELAY_ENABLED === 'true') {
    if (value.PLAYBACK_ENABLED !== 'true' || !value.PLAYBACK_RELAY_ORIGIN || !value.PLAYBACK_RELAY_SECRET || !value.PLAYBACK_RELAY_PROVIDERS) throw new Error('Relay requires playback, an origin, a secret, and approved providers.')
    const url = new URL(value.PLAYBACK_RELAY_ORIGIN)
    if (url.protocol !== 'https:' || url.origin !== value.PLAYBACK_RELAY_ORIGIN || url.username || url.password) throw new Error('Relay requires an exact HTTPS origin.')
    relay = { origin: url.origin, secret: value.PLAYBACK_RELAY_SECRET, providers: parseRelayProviders(value.PLAYBACK_RELAY_PROVIDERS), ...(value.PLAYBACK_RELAY_DISCOVERY_PROVIDERS ? { discovery: parseRelayDiscovery(value.PLAYBACK_RELAY_DISCOVERY_PROVIDERS) } : {}) }
  }
  if (value.PLAYBACK_ENABLED === 'true' && !value.PLAYBACK_MEDIA_CONFIG) throw new Error('Playback requires PLAYBACK_MEDIA_CONFIG.')
  // Single-instance launches run playback on bounded in-process state; shared
  // Valkey becomes mandatory past one instance, where split-brain resolvers
  // would otherwise diverge on cache, sessions, and health.
  if (value.PLAYBACK_ENABLED === 'true' && !value.PLAYBACK_VALKEY_URL && value.PLAYBACK_INSTANCES > 1) {
    throw new Error('Multi-instance playback requires PLAYBACK_VALKEY_URL.')
  }
  if (value.PLAYBACK_VALKEY_URL && value.VALKEY_URL) {
    const playbackUrl = new URL(value.PLAYBACK_VALKEY_URL)
    const authUrl = new URL(value.VALKEY_URL)
    if (playbackUrl.hostname === authUrl.hostname && playbackUrl.port === authUrl.port) throw new Error('Playback and authentication must use separate Valkey instances.')
  }
  if (value.NODE_ENV === 'production') {
    if (/^(?:replace[-_]|consumit-local|missing[-_])/i.test(value.AUTH_CODE_PEPPER ?? '')) {
      throw new Error('Invalid API configuration: AUTH_CODE_PEPPER must be a new production secret, not an example value.')
    }
    const required = {
      AUTH_CODE_PEPPER: value.AUTH_CODE_PEPPER,
      AUTH_EMAIL_FROM: value.AUTH_EMAIL_FROM,
      DATABASE_URL: value.DATABASE_URL,
      ...(value.AUTH_EMAIL_PROVIDER === 'ses'
        ? { SES_REGION: value.SES_REGION, SES_CONFIGURATION_SET: value.SES_CONFIGURATION_SET, SES_CREDENTIALS_FILE: value.SES_CREDENTIALS_FILE }
        : { RESEND_API_KEY: value.RESEND_API_KEY }),
      TMDB_API_READ_TOKEN: value.TMDB_API_READ_TOKEN,
      VALKEY_URL: value.VALKEY_URL,
    }
    const missing = Object.entries(required).filter(([, entry]) => !entry).map(([name]) => name)
    if (missing.length) throw new Error(`Invalid API configuration: ${missing.join(', ')} required in production.`)
    if (value.DATABASE_SSL_MODE !== 'require') {
      throw new Error('Invalid API configuration: DATABASE_SSL_MODE=require is required in production.')
    }
    if (value.DATABASE_DEPLOYMENT === 'self-hosted') {
      let valid = false
      try {
        const database = new URL(value.DATABASE_URL!)
        valid = database.hostname === 'postgres' && database.pathname === '/consumit'
          && database.username === 'consumit_app' && database.password.length >= 32
          && !/consumit-local|replace[-_]|missing[-_]/i.test(database.password)
          && value.DATABASE_SSL_CA_FILE === '/run/secrets/db-ca.crt'
          && database.searchParams.get('sslmode') === 'verify-full'
          && database.searchParams.get('sslrootcert') === value.DATABASE_SSL_CA_FILE
      } catch { /* Never include a database URL in configuration errors. */ }
      if (!valid) throw new Error('Invalid API configuration: self-hosted database requires dedicated credentials and certificate-verified TLS.')
    }
  }
  return {
    playback: { enabled: value.PLAYBACK_ENABLED === 'true', stateUrl: value.PLAYBACK_VALKEY_URL, mediaConfig: value.PLAYBACK_MEDIA_CONFIG,
      ...(relay ? { relay } : {}),
      instances: value.PLAYBACK_INSTANCES, probeIntervalMs: value.PLAYBACK_PROBE_INTERVAL_MINUTES * 60_000 },
    adminMetricsUrl: value.ADMIN_METRICS_URL,
    appOrigin: appUrl.origin,
    authCodePepper: value.AUTH_CODE_PEPPER,
    authEmailFrom: value.AUTH_EMAIL_FROM,
    databaseSslCa: value.DATABASE_SSL_CA?.replaceAll('\\n', '\n'),
    ...(value.DATABASE_SSL_CA_FILE ? { databaseSslCaFile: value.DATABASE_SSL_CA_FILE } : {}),
    emailProvider: value.AUTH_EMAIL_PROVIDER,
    ...(value.SES_REGION && value.SES_CONFIGURATION_SET && value.SES_CREDENTIALS_FILE
      ? { ses: { region: value.SES_REGION, configurationSet: value.SES_CONFIGURATION_SET, credentialsFile: value.SES_CREDENTIALS_FILE } } : {}),
    databaseSslMode: value.DATABASE_SSL_MODE,
    releases: { enabled: value.RELEASE_TRACKING_ENABLED === 'true', workerSecret: value.RELEASE_WORKER_SECRET },
    databaseUrl: value.DATABASE_URL,
    nodeEnv: value.NODE_ENV,
    port: value.PORT,
    resendApiKey: value.RESEND_API_KEY,
    subtitleKeys: {
      subdl: value.SUBDL_API_KEY,
      jimaku: value.JIMAKU_API_KEY,
      openSubtitles: value.OPENSUBTITLES_API_KEY && value.OPENSUBTITLES_USER && value.OPENSUBTITLES_PASS
        ? { apiKey: value.OPENSUBTITLES_API_KEY, user: value.OPENSUBTITLES_USER, pass: value.OPENSUBTITLES_PASS }
        : undefined,
    },
    subtitlesDir: value.SUBTITLES_DIR,
    tmdbLanguage: value.TMDB_LANGUAGE,
    tmdbRegion: value.TMDB_REGION.toUpperCase(),
    tmdbToken: value.TMDB_API_READ_TOKEN,
    trustedProxies: (value.TRUSTED_PROXIES ?? '').split(',').map((entry) => entry.trim()).filter(Boolean),
    valkeyUrl: value.VALKEY_URL,
  }
}
