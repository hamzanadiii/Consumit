export function assertProductionDatabaseUrl(value, options = {}) {
  let url
  try { url = new URL(value) } catch { throw new Error('DATABASE_URL must be a valid PostgreSQL URL; credentials were withheld.') }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname) throw new Error('DATABASE_URL must be a valid PostgreSQL URL.')
  const selfHosted = options.mode === 'self-hosted'
  if (selfHosted) {
    if (url.hostname !== 'postgres' || url.pathname !== '/consumit' || !['consumit_app', 'consumit_migrate', 'consumit_backup'].includes(url.username)
        || url.password.length < 32 || /consumit-local|replace[-_]|missing[-_]/i.test(url.password)
        || options.caFile !== '/run/secrets/db-ca.crt'
        || url.searchParams.get('sslmode') !== 'verify-full' || url.searchParams.get('sslrootcert') !== options.caFile) {
      throw new Error('Self-hosted production requires private PostgreSQL, dedicated credentials and certificate-verified TLS.')
    }
  } else if (['postgres', 'localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new Error('Production must use the configured TLS database, not the local fallback.')
  for (const [key, entry] of url.searchParams) {
    if (key.toLowerCase() === 'sslmode' && entry !== 'verify-full') throw new Error('DATABASE_URL sslmode must be verify-full or omitted for production backups.')
    if (key.toLowerCase() === 'sslrootcert' && entry !== (selfHosted ? options.caFile : 'system')) throw new Error('DATABASE_URL must use configured trust roots for production backups.')
  }
}

export function productionEnvironmentIssues(env) {
  const issues = []
  for (const key of ['APP_ORIGIN', 'NEXT_PUBLIC_SITE_URL']) {
    if (env[key] !== 'https://consumit.online') issues.push(`${key} must equal https://consumit.online.`)
  }
  const selfHosted = env.DATABASE_DEPLOYMENT === 'self-hosted'
  const emailKeys = env.AUTH_EMAIL_PROVIDER === 'ses' ? ['SES_REGION', 'SES_CONFIGURATION_SET', 'SES_FEEDBACK_QUEUE_URL'] : ['RESEND_API_KEY']
  for (const key of ['AUTH_CODE_PEPPER', 'AUTH_EMAIL_FROM', 'DATABASE_URL', ...emailKeys, 'TMDB_API_READ_TOKEN', 'RESTIC_REPOSITORY', ...(selfHosted ? ['AWS_BACKUP_BUCKET', 'MIGRATION_DATABASE_URL', 'BACKUP_DATABASE_URL'] : ['CLOUDFLARE_TUNNEL_TOKEN'])]) {
    if (!env[key] || /replace[-_]|missing[-_]|database\.example/i.test(env[key])) issues.push(`${key} needs its real production value.`)
  }
  if (env.AUTH_CODE_PEPPER && (env.AUTH_CODE_PEPPER.length < 32 || /^consumit-local/i.test(env.AUTH_CODE_PEPPER))) issues.push('AUTH_CODE_PEPPER needs a new secret of at least 32 characters.')
  if (env.DATABASE_SSL_MODE !== 'require') issues.push('DATABASE_SSL_MODE must be require.')
  const databaseOptions = { mode: env.DATABASE_DEPLOYMENT, caFile: env.DATABASE_SSL_CA_FILE }
  try { assertProductionDatabaseUrl(env.DATABASE_URL, databaseOptions) } catch (error) { issues.push(error.message) }
  if (selfHosted) {
    for (const [key, role] of [['DATABASE_URL', 'consumit_app'], ['MIGRATION_DATABASE_URL', 'consumit_migrate'], ['BACKUP_DATABASE_URL', 'consumit_backup']]) {
      try { assertProductionDatabaseUrl(env[key], databaseOptions); if (new URL(env[key]).username !== role) issues.push(`${key} requires the ${role} role.`) } catch { issues.push(`${key} needs dedicated credentials and verified TLS.`) }
    }
    if (env.AUTH_EMAIL_PROVIDER !== 'ses' || env.SES_REGION !== 'ca-central-1') issues.push('Self-hosted production requires SES in Canada Central.')
    if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(env.AWS_CREDIT_EXPIRES_AT ?? '') || !Number.isFinite(Date.parse(env.AWS_CREDIT_EXPIRES_AT ?? ''))) issues.push('AWS_CREDIT_EXPIRES_AT must record the actual verified credit expiry.')
    if (!/^-?\d+$/.test(env.TELEGRAM_CHAT_ID ?? '') || Number(env.TELEGRAM_CHAT_ID) === 0) issues.push('TELEGRAM_CHAT_ID must select the real operator destination.')
    if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(env.AWS_BACKUP_BUCKET ?? '')) issues.push('AWS_BACKUP_BUCKET must be a valid S3 bucket name.')
    if (!/^https:\/\/sqs\.ca-central-1\.amazonaws\.com\/\d{12}\/[A-Za-z0-9_-]+$/.test(env.SES_FEEDBACK_QUEUE_URL ?? '')) issues.push('SES_FEEDBACK_QUEUE_URL must select the private Canada Central queue.')
    if (env.RESTIC_REPOSITORY !== `s3:https://s3.ca-central-1.amazonaws.com/${env.AWS_BACKUP_BUCKET}/restic`) issues.push('Restic must use its separate prefix in the configured Canada Central bucket.')
  }
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
  const env = Object.fromEntries(Object.entries(inherited).filter(([key]) => !/^(?:COMPOSE_|APP_|NEXT_PUBLIC_|CONSUMIT_|CLOUDFLARE_|AUTH_|DATABASE_|MIGRATION_|SES_|AWS_|TELEGRAM_|RESEND_|TMDB_|VALKEY_|PLAYBACK_|RESTIC_|STORAGE_BOX_|BACKUP_|ALERTMANAGER_|SUBDL_|JIMAKU_|OPENSUBTITLES_|OTEL_|ADMIN_METRICS_|SUPPORT_EMAIL$|TRUSTED_PROXIES$)/.test(key)))
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
  const selfHosted = api?.environment?.DATABASE_SSL_CA_FILE === '/run/secrets/db-ca.crt'
  const sameDatabase = selfHosted && backup?.environment?.DATABASE_URL && api?.environment?.DATABASE_URL
    && new URL(backup.environment.DATABASE_URL).hostname === new URL(api.environment.DATABASE_URL).hostname
    && new URL(backup.environment.DATABASE_URL).pathname === new URL(api.environment.DATABASE_URL).pathname
    && new URL(backup.environment.DATABASE_URL).username === 'consumit_backup'
  if (!api?.environment?.DATABASE_URL || (!sameDatabase && backup?.environment?.DATABASE_URL !== api.environment.DATABASE_URL)) {
    throw new Error('Production backup must select the same database as the API.')
  }
  if (!backup.build || /^postgres(?::|@|$)/.test(backup.image ?? '') || !backup.image) {
    throw new Error('Production backup must build its dedicated Restic image without replacing the upstream Postgres tag.')
  }
  if (backup.command?.length || backup.restart !== 'no') {
    throw new Error('Production backup must run once under its timer, without the development cron or restart loop.')
  }
  if (backup.environment.PGSSLMODE !== 'verify-full' || backup.environment.PGSSLROOTCERT !== (selfHosted ? '/run/secrets/db-ca.crt' : 'system')) {
    throw new Error('Production backup must verify database TLS against the system certificate authorities.')
  }
  // Syntax validation uses placeholder credentials, but still verifies policy.
  if (selfHosted) {
    const url = new URL(backup.environment.DATABASE_URL)
    if (url.searchParams.get('sslmode') !== 'verify-full' || url.searchParams.get('sslrootcert') !== '/run/secrets/db-ca.crt') throw new Error('Backup must verify database TLS and its hostname.')
  } else assertProductionDatabaseUrl(backup.environment.DATABASE_URL)
}
