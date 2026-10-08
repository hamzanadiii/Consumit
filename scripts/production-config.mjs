export function assertProductionDatabaseUrl(value) {
  let url
  try { url = new URL(value) } catch { throw new Error('DATABASE_URL must be a valid PostgreSQL URL; credentials were withheld.') }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname) throw new Error('DATABASE_URL must be a valid PostgreSQL URL.')
  if (['postgres', 'localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Production must use the configured TLS database, not the local fallback.')
  for (const [key, entry] of url.searchParams) {
    if (key.toLowerCase() === 'sslmode' && entry !== 'verify-full') throw new Error('DATABASE_URL sslmode must be verify-full or omitted for production backups.')
    if (key.toLowerCase() === 'sslrootcert' && entry !== 'system') throw new Error('DATABASE_URL must use system trust roots for production backups.')
  }
}

export function productionEnvironmentIssues(env) {
  const issues = []
  for (const key of ['APP_ORIGIN', 'NEXT_PUBLIC_SITE_URL']) {
    if (env[key] !== 'https://consumit.online') issues.push(`${key} must equal https://consumit.online.`)
  }
  for (const key of ['AUTH_CODE_PEPPER', 'AUTH_EMAIL_FROM', 'DATABASE_URL', 'RESEND_API_KEY', 'TMDB_API_READ_TOKEN', 'CLOUDFLARE_TUNNEL_TOKEN', 'RESTIC_REPOSITORY']) {
    if (!env[key] || /replace[-_]|missing[-_]|database\.example/i.test(env[key])) issues.push(`${key} needs its real production value.`)
  }
  if (env.AUTH_CODE_PEPPER && (env.AUTH_CODE_PEPPER.length < 32 || /^consumit-local/i.test(env.AUTH_CODE_PEPPER))) issues.push('AUTH_CODE_PEPPER needs a new secret of at least 32 characters.')
  if (env.DATABASE_SSL_MODE !== 'require') issues.push('DATABASE_SSL_MODE must be require.')
  try { assertProductionDatabaseUrl(env.DATABASE_URL) } catch (error) { issues.push(error.message) }
  if (env.PLAYBACK_RELAY_ENABLED === 'true') {
    for (const key of ['PLAYBACK_RELAY_ORIGIN', 'PLAYBACK_RELAY_SECRET', 'PLAYBACK_RELAY_PROVIDERS']) {
      if (!env[key] || /replace[-_]/i.test(env[key])) issues.push(`${key} is required for the approved Worker relay.`)
    }
  }
  return issues
}

export function productionProcessEnvironment(inherited, configured, file) {
  // Bun may export the local .env before calling Node. The production file
  // owns all configuration keys, including absent optional relay credentials.
  const env = Object.fromEntries(Object.entries(inherited).filter(([key]) => !/^(?:COMPOSE_|APP_|NEXT_PUBLIC_|CONSUMIT_|CLOUDFLARE_|AUTH_|DATABASE_|RESEND_|TMDB_|VALKEY_|PLAYBACK_|RESTIC_|STORAGE_BOX_|BACKUP_|ALERTMANAGER_|SUBDL_|JIMAKU_|OPENSUBTITLES_|OTEL_|ADMIN_METRICS_|SUPPORT_EMAIL$|TRUSTED_PROXIES$)/.test(key)))
  return { ...env, ...configured, CONSUMIT_PRODUCTION_ENV_FILE: file }
}

export function assertProductionRuntimeConfig(config) {
  const services = config.services ?? {}
  if (services.api?.environment?.NODE_ENV !== 'production'
      || services.api.environment.APP_ORIGIN !== 'https://consumit.online'
      || services.web?.build?.args?.NEXT_PUBLIC_SITE_URL !== 'https://consumit.online') {
    throw new Error('Production must build and serve the first frontend at its HTTPS origin.')
  }
  if (services.api.environment.PLAYBACK_ENABLED !== 'true'
      || !services.api.environment.PLAYBACK_MEDIA_CONFIG
      || !services['playback-valkey'] || !services.prometheus || !services.alertmanager || !services.cloudflared) {
    throw new Error('Production must include its configured playback, monitoring and Tunnel services.')
  }
  if (Object.values(services).some(service => service.ports?.length && !(service.profiles?.length))) {
    throw new Error('Production services must remain private behind the Tunnel.')
  }
}

export function assertProductionBackupConfig(config) {
  const api = config.services?.api
  const backup = config.services?.backup
  if (!api?.environment?.DATABASE_URL || backup?.environment?.DATABASE_URL !== api.environment.DATABASE_URL) {
    throw new Error('Production backup must select the same database as the API.')
  }
  if (!backup.build || /^postgres(?::|@|$)/.test(backup.image ?? '') || !backup.image) {
    throw new Error('Production backup must build its dedicated Restic image without replacing the upstream Postgres tag.')
  }
  if (backup.command?.length || backup.restart !== 'no') {
    throw new Error('Production backup must run once under its timer, without the development cron or restart loop.')
  }
  if (backup.environment.PGSSLMODE !== 'verify-full' || backup.environment.PGSSLROOTCERT !== 'system') {
    throw new Error('Production backup must verify database TLS against the system certificate authorities.')
  }
  assertProductionDatabaseUrl(backup.environment.DATABASE_URL)
}
