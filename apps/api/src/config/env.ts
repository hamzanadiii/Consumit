import { z } from 'zod'
import { parseResolverOrigins, type CloudflareResolverConfig } from '../playback/cloudflare-resolver.ts'
import { parseRelayProviders, parseRelayDiscovery, parseRelayControlProviders, validateRelayNode, type PlaybackRelayConfig } from '../playback/relay.ts'

const envSchema = z.object({
  APPLICATION_MODE: z.enum(['combined', 'product', 'playback']).default('combined'),
  INTERNAL_SERVICE_SECRET: z.string().min(32).max(256).optional(),
  INTERNAL_API_ORIGIN: z.url().optional(),
  INTERNAL_PLAYBACK_ORIGIN: z.url().optional(),
  BACKGROUND_JOBS_ENABLED: z.enum(['true', 'false']).default('false'),
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
  PLAYBACK_RELAY_PROVIDER_ORIGINS: z.string().max(20000).optional(),
  PLAYBACK_RELAY_CONTROL_PROVIDERS: z.string().max(128).optional(),
  PLAYBACK_RELAY_DISCOVERY_PROVIDERS: z.string().max(512).optional(),
  PLAYBACK_RESOLVER_ENABLED: z.enum(['true', 'false']).default('false'),
  PLAYBACK_RESOLVER_ORIGIN: z.url().optional(),
  PLAYBACK_RESOLVER_SECRET: z.string().min(32).optional(),
  PLAYBACK_RESOLVER_API_PROVIDERS: z.string().max(128).optional(),
  PLAYBACK_RESOLVER_PROVIDER_ORIGINS: z.string().max(20000).optional(),
  PLAYBACK_RESOLVER_COMPUTE_ENABLED: z.enum(['true', 'false']).default('false'),
  PLAYBACK_RESOLVER_COMPUTE_SECRET: z.string().min(32).max(256).optional(),
  PLAYBACK_NODE_ENABLED: z.enum(['true', 'false']).default('false'),
  PLAYBACK_NODE_ORIGIN: z.url().optional(),
  PLAYBACK_NODE_SECRET: z.string().min(32).optional(),
  PLAYBACK_NODE_PROVIDERS: z.string().max(30000).optional(),
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
  applicationMode?: 'combined' | 'product' | 'playback'
  internal?: { secret: string; apiOrigin?: string; playbackOrigin?: string }
  backgroundJobs?: boolean
  releases?: { enabled: boolean; workerSecret: string | undefined }
  playback?: {
    relay?: PlaybackRelayConfig
    resolver?: CloudflareResolverConfig
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
  if (value.APPLICATION_MODE !== 'combined' && (!value.INTERNAL_SERVICE_SECRET || (value.APPLICATION_MODE === 'product' ? !value.INTERNAL_PLAYBACK_ORIGIN : !value.INTERNAL_API_ORIGIN))) {
    throw new Error('Separated applications require an internal origin and a dedicated service secret.')
  }
  for (const origin of [value.INTERNAL_API_ORIGIN, value.INTERNAL_PLAYBACK_ORIGIN].filter((entry): entry is string => Boolean(entry))) {
    const url = new URL(origin)
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== origin || url.username || url.password) throw new Error('Internal applications require exact HTTP(S) origins.')
  }
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
  if (value.PLAYBACK_RELAY_ENABLED !== 'true' && (value.PLAYBACK_RELAY_PROVIDER_ORIGINS || value.PLAYBACK_RELAY_CONTROL_PROVIDERS)) {
    let configured = false
    try {
      configured = Object.keys(parseResolverOrigins(value.PLAYBACK_RELAY_PROVIDER_ORIGINS ?? '{}')).length > 0
        || parseRelayControlProviders(value.PLAYBACK_RELAY_CONTROL_PROVIDERS ?? '[]').length > 0
    } catch { throw new Error('Relay provider routes require valid origins and reviewed control providers.') }
    if (configured) throw new Error('Relay provider routes require an enabled Cloudflare relay.')
  }
  let resolver: CloudflareResolverConfig | undefined
  let providerOrigins: Record<string, string> = {}
  if (value.PLAYBACK_RESOLVER_PROVIDER_ORIGINS) {
    try { providerOrigins = parseResolverOrigins(value.PLAYBACK_RESOLVER_PROVIDER_ORIGINS) }
    catch { throw new Error('Provider resolver routes require a bounded map of exact HTTPS origins.') }
  }
  if (Object.keys(providerOrigins).length && value.PLAYBACK_RESOLVER_ENABLED !== 'true') throw new Error('Provider resolver routes require the Cloudflare resolver.')
  let apiProviders: 'wecollege-miami'[] = []
  if (value.PLAYBACK_RESOLVER_API_PROVIDERS) {
    try {
      apiProviders = z.array(z.literal('wecollege-miami')).max(1)
        .refine(items => new Set(items).size === items.length).parse(JSON.parse(value.PLAYBACK_RESOLVER_API_PROVIDERS))
    } catch { throw new Error('Provider resolver API lookup exceptions must contain only the reviewed Miami route.') }
  }
  if (apiProviders.length && value.PLAYBACK_RESOLVER_ENABLED !== 'true') throw new Error('Provider resolver API lookup exceptions require the Cloudflare resolver.')
  if (value.PLAYBACK_RESOLVER_ENABLED === 'true') {
    if (value.PLAYBACK_ENABLED !== 'true' || !value.PLAYBACK_RESOLVER_ORIGIN || !value.PLAYBACK_RESOLVER_SECRET) throw new Error('Provider resolver requires playback, an origin, and a secret.')
    const url = new URL(value.PLAYBACK_RESOLVER_ORIGIN)
    if (url.protocol !== 'https:' || url.origin !== value.PLAYBACK_RESOLVER_ORIGIN || url.username || url.password) throw new Error('Provider resolver requires an exact HTTPS origin.')
    resolver = { origin: url.origin, secret: value.PLAYBACK_RESOLVER_SECRET, ...(apiProviders.length ? { apiProviders } : {}), ...(Object.keys(providerOrigins).length ? { providerOrigins } : {}) }
  }
  if (value.PLAYBACK_RESOLVER_COMPUTE_ENABLED === 'true') {
    if (!resolver || !value.PLAYBACK_RESOLVER_COMPUTE_SECRET) throw new Error('Provider computation requires the enabled resolver and its separate secret.')
    if (value.PLAYBACK_RESOLVER_COMPUTE_SECRET === resolver.secret) throw new Error('Provider computation requires a separate secret.')
    resolver.computeSecret = value.PLAYBACK_RESOLVER_COMPUTE_SECRET
  }
  if (value.PLAYBACK_RELAY_ENABLED === 'true') {
    if (value.PLAYBACK_ENABLED !== 'true' || !value.PLAYBACK_RELAY_ORIGIN || !value.PLAYBACK_RELAY_SECRET || !value.PLAYBACK_RELAY_PROVIDERS) throw new Error('Relay requires playback, an origin, a secret, and approved providers.')
    const url = new URL(value.PLAYBACK_RELAY_ORIGIN)
    if (url.protocol !== 'https:' || url.origin !== value.PLAYBACK_RELAY_ORIGIN || url.username || url.password) throw new Error('Relay requires an exact HTTPS origin.')
      relay = { origin: url.origin, secret: value.PLAYBACK_RELAY_SECRET, providers: parseRelayProviders(value.PLAYBACK_RELAY_PROVIDERS), ...(value.PLAYBACK_RELAY_DISCOVERY_PROVIDERS ? { discovery: parseRelayDiscovery(value.PLAYBACK_RELAY_DISCOVERY_PROVIDERS) } : {}) }
      if (value.PLAYBACK_RELAY_PROVIDER_ORIGINS) {
        try { relay.providerOrigins = parseResolverOrigins(value.PLAYBACK_RELAY_PROVIDER_ORIGINS) }
        catch { throw new Error('Relay provider routes require a bounded map of exact HTTPS origins.') }
        if (Object.keys(relay.providerOrigins).some(id => !relay?.providers[id]?.length)) throw new Error('Relay provider routes require an approved media policy.')
      }
      if (value.PLAYBACK_RELAY_CONTROL_PROVIDERS) {
        try { relay.controlProviders = parseRelayControlProviders(value.PLAYBACK_RELAY_CONTROL_PROVIDERS) }
        catch { throw new Error('Relay control providers accept only the reviewed Rigel route.') }
        if (relay.controlProviders.some(id => !relay?.providers[id]?.length)) throw new Error('Relay control providers require an approved media policy.')
      }
  }
  if (value.PLAYBACK_ENABLED === 'true' && !value.PLAYBACK_MEDIA_CONFIG) throw new Error('Playback requires PLAYBACK_MEDIA_CONFIG.')
  if (value.PLAYBACK_NODE_ENABLED === 'true') {
    if (value.PLAYBACK_ENABLED !== 'true' || !value.PLAYBACK_NODE_ORIGIN || !value.PLAYBACK_NODE_SECRET || !value.PLAYBACK_NODE_PROVIDERS) throw new Error('Media node requires playback, an origin, a secret, and approved providers.')
    const node = validateRelayNode({ origin: value.PLAYBACK_NODE_ORIGIN, secret: value.PLAYBACK_NODE_SECRET, providers: parseRelayProviders(value.PLAYBACK_NODE_PROVIDERS) })
    relay = relay ? { ...relay, node } : { origin: node.origin, secret: `${node.secret}:unused-edge`, providers: {}, node }
  }
  // Single-instance launches run playback on bounded in-process state; shared
  // Valkey becomes mandatory past one instance, where split-brain resolvers
  // would otherwise diverge on cache, sessions, and health.
  if (value.PLAYBACK_ENABLED === 'true' && !value.PLAYBACK_VALKEY_URL && value.PLAYBACK_INSTANCES > 1) {
    throw new Error('Multi-instance playback requires PLAYBACK_VALKEY_URL.')
  }
  if (value.NODE_ENV === 'production' && value.APPLICATION_MODE === 'playback' && (value.PLAYBACK_ENABLED !== 'true' || !value.PLAYBACK_VALKEY_URL || !value.VALKEY_URL)) {
    throw new Error('Split playback requires enabled playback, shared playback state, and authentication rate-limit Valkey.')
  }
  if (value.PLAYBACK_VALKEY_URL && value.VALKEY_URL) {
    let playbackUrl: URL, authUrl: URL
    try { playbackUrl = new URL(value.PLAYBACK_VALKEY_URL); authUrl = new URL(value.VALKEY_URL) } catch { throw new Error('Use valid separate authentication and playback Valkey URLs.') }
    if (playbackUrl.hostname === authUrl.hostname && (playbackUrl.port || '6379') === (authUrl.port || '6379')) throw new Error('Playback and authentication must use separate Valkey instances.')
  }
  if (value.NODE_ENV === 'production' && value.APPLICATION_MODE !== 'playback') {
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
    applicationMode: value.APPLICATION_MODE,
    backgroundJobs: value.BACKGROUND_JOBS_ENABLED === 'true',
    ...(value.INTERNAL_SERVICE_SECRET ? { internal: { secret: value.INTERNAL_SERVICE_SECRET, ...(value.INTERNAL_API_ORIGIN ? { apiOrigin: value.INTERNAL_API_ORIGIN } : {}), ...(value.INTERNAL_PLAYBACK_ORIGIN ? { playbackOrigin: value.INTERNAL_PLAYBACK_ORIGIN } : {}) } } : {}),
    playback: { enabled: value.PLAYBACK_ENABLED === 'true', stateUrl: value.PLAYBACK_VALKEY_URL, mediaConfig: value.PLAYBACK_MEDIA_CONFIG,
      ...(relay ? { relay } : {}),
      ...(resolver ? { resolver } : {}),
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
