import { randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseEnv } from 'node:util'
import { spawnSync } from 'node:child_process'
import { productionEnvironmentIssues, productionProcessEnvironment, serializeProductionEnvironment } from './production-config.mjs'

const root = process.cwd()
const file = path.resolve(root, '.env.production')
const command = process.argv[2] ?? 'check'
const commands = ['prepare', 'certificates', 'renew-certificate', 'check', 'build', 'up', 'backup-init', 'physical-init', 'physical-backup', 'backup', 'backup-check', 'credit-check', 'aws-identity-check', 'retention-drill', 'smoke']
if (!commands.includes(command)) throw new Error(`Choose a production command: ${commands.join(', ')}.`)

if (command === 'prepare') {
  const secrets = path.join(root, 'infra/secrets')
  mkdirSync(secrets, { recursive: true, mode: 0o700 })
  for (const name of ['restic-password', 'offline-restic-password', 'pgbackrest-password', 'db-admin-password', 'db-app-password', 'db-migration-password', 'db-backup-password']) {
    const password = path.join(secrets, name)
    if (!existsSync(password)) writeFileSync(password, `${randomBytes(32).toString('hex')}\n`, { flag: 'wx', mode: 0o600 })
  }
  const template = parseEnv(readFileSync(path.join(root, '.env.production.example'), 'utf8'))
  const existing = existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : {}
  const prepared = { ...template, ...existing }
  if (!existing.AUTH_CODE_PEPPER || /^(replace[-_]|consumit-local)/i.test(existing.AUTH_CODE_PEPPER)) prepared.AUTH_CODE_PEPPER = randomBytes(32).toString('hex')
  // Explicitly switch the release to the approved fresh database, preserving
  // the developer's .env and all existing Docker volumes.
  prepared.DATABASE_DEPLOYMENT = 'self-hosted'
  prepared.DATABASE_SSL_CA_FILE = '/run/secrets/db-ca.crt'
  prepared.AUTH_EMAIL_PROVIDER = 'ses'
  for (const [key, role, name] of [['DATABASE_URL', 'consumit_app', 'db-app-password'], ['MIGRATION_DATABASE_URL', 'consumit_migrate', 'db-migration-password'], ['BACKUP_DATABASE_URL', 'consumit_backup', 'db-backup-password']]) {
    const password = readFileSync(path.join(secrets, name), 'utf8').trim()
    prepared[key] = `postgresql://${role}:${password}@postgres:5432/consumit?sslmode=verify-full&sslrootcert=/run/secrets/db-ca.crt`
  }
  if (!existing.RESTIC_REPOSITORY?.startsWith('s3:')) prepared.RESTIC_REPOSITORY = template.RESTIC_REPOSITORY
  for (const key of ['RESEND_API_KEY', 'STORAGE_BOX_SSH_DIR', 'CONSUMIT_POSTGRES_PASSWORD', 'CLOUDFLARE_TUNNEL_TOKEN']) delete prepared[key]
  writeFileSync(file, serializeProductionEnvironment(prepared), { mode: 0o600 })
  const alerts = path.join(secrets, 'alertmanager.yml')
  // The host directory remains private, while Alertmanager's unprivileged
  // container user must be able to read the individual read-only bind mount.
  if (!existsSync(alerts)) writeFileSync(alerts, readFileSync(path.join(root, 'infra/observability/alertmanager.production.example.yml')), { flag: 'wx', mode: 0o644 })
  if (process.platform !== 'win32') {
    chmodSync(secrets, 0o700)
    chmodSync(alerts, 0o644)
  }
  console.log('Private hybrid release configuration prepared for a fresh database. Existing secrets and development data were preserved. Fill the remaining integrations privately, then run production:check.')
} else if (command === 'certificates' || command === 'renew-certificate') {
  // Keys are generated in the reviewed PostgreSQL image, never via shell argv.
  const image = 'consumit-postgres:certificates'
  const build = spawnSync('docker', ['build', '-f', 'infra/postgres/Dockerfile', '-t', image, '.'], { stdio: 'inherit' })
  if (build.status !== 0) process.exit(build.status ?? 1)
  const certificateScript = command === 'certificates' ? 'certificates.sh' : 'renew-certificate.sh'
  const result = spawnSync('docker', ['run', '--rm', '--entrypoint', 'bash', '--mount', `type=bind,source=${path.resolve(root, 'infra/secrets')},target=/secrets`, '--mount', `type=bind,source=${path.resolve(root, 'infra/postgres', certificateScript)},target=/certificates.sh,readonly`, image, '/certificates.sh'], { stdio: 'inherit' })
  process.exitCode = result.status ?? 1
} else {
  if (!existsSync(file)) throw new Error('Run production:prepare first; .env.production is missing.')
  const configured = parseEnv(readFileSync(file, 'utf8'))
  const env = productionProcessEnvironment(process.env, configured, file)
  const issues = command === 'build'
    ? ['APP_ORIGIN', 'NEXT_PUBLIC_SITE_URL'].filter(key => env[key] !== 'https://consumit.online').map(key => `${key} must equal https://consumit.online.`)
    : productionEnvironmentIssues(env)
  if (command !== 'build') {
    for (const key of ['CONSUMIT_PROVIDER_CONFIG', 'RESTIC_PASSWORD_FILE', 'ALERTMANAGER_CONFIG']) {
      if (!env[key] || !existsSync(path.resolve(root, env[key]))) issues.push(`${key} must select an existing private file.`)
    }
    for (const name of ['db-ca.crt', 'db-server.crt', 'db-server.key', 'db-admin-password', 'db-app-password', 'db-migration-password', 'db-backup-password', 'pgbackrest-password', 'ses-aws.json', 'backup-aws.json', 'feedback-aws.json', 'credit-aws.json', 'tunnel-token']) {
      if (!existsSync(path.join(root, 'infra/secrets', name))) issues.push(`Private ${name} is required.`)
    }
    if (env.ALERTMANAGER_CONFIG && existsSync(path.resolve(root, env.ALERTMANAGER_CONFIG))) {
      const alerts = readFileSync(path.resolve(root, env.ALERTMANAGER_CONFIG), 'utf8')
      if (/host\.docker\.internal|replace[-_]|localhost|127\.0\.0\.1/.test(alerts)) issues.push('ALERTMANAGER_CONFIG still contains a local/example receiver.')
    }
  }
  if (issues.length) {
    console.error(`Production configuration is incomplete:\n${[...new Set(issues)].map(issue => `- ${issue}`).join('\n')}`)
    process.exitCode = 1
  } else if (command === 'check') {
    console.log('Production configuration preflight passed. Real HTTPS, restore, email, alert and playback verification remain required.')
  } else {
    if (command === 'build') {
      const revision = spawnSync('git', ['rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8' })
      if (revision.status !== 0) throw new Error('Build requires the reviewed Git release checkout.')
      env.CONSUMIT_RELEASE = `${revision.stdout.trim()}-${new Date().toISOString().replace(/[-:.]/g, '')}`
      configured.CONSUMIT_RELEASE = env.CONSUMIT_RELEASE
      writeFileSync(file, serializeProductionEnvironment(configured), { mode: 0o600 })
      console.log(`Building release ${env.CONSUMIT_RELEASE}; previous image tags are retained.`)
    }
    const compose = ['compose', '-p', 'consumit-production', '--env-file', file, '-f', 'compose.yaml', '-f', 'compose.playback.yaml', '-f', 'compose.production.yaml']
    if (command === 'up') {
      const current = spawnSync('docker', [...compose, 'ps', '-a', '-q', 'postgres'], { env, encoding: 'utf8' })
      if (current.status !== 0) throw new Error('Could not inspect the existing production database safely.')
      if (current.stdout.trim()) {
        console.log('Taking the required named backup before applying release migrations.')
        const backup = spawnSync('docker', [...compose, 'exec', '-T', '--user', 'postgres', 'postgres', 'pgbackrest', '--stanza=consumit', '--type=full', `--annotation=release=${env.CONSUMIT_RELEASE}`, 'backup'], { env, stdio: 'inherit' })
        if (backup.status !== 0) throw new Error('Release stopped: a verified pre-migration physical backup is required. Start or repair the existing database and archive first.')
      }
    }
    const args = {
      build: [...compose, '--profile', 'backup', 'build', 'postgres', 'api', 'ses-feedback', 'migrate', 'web', 'gateway', 'backup'],
      up: [...compose, 'up', '-d', '--no-build', '--wait'],
      backup: [...compose, '--profile', 'backup', 'run', '--rm', 'backup'],
      'backup-check': [...compose, '--profile', 'backup', 'run', '--rm', '--entrypoint', 'consumit-backup-check', 'backup'],
      'backup-init': [...compose, '--profile', 'backup', 'run', '--rm', '--entrypoint', 'consumit-backup-init', 'backup'],
      'physical-init': [...compose, 'exec', '-T', '--user', 'postgres', 'postgres', 'pgbackrest', '--stanza=consumit', 'stanza-create'],
      'physical-backup': [...compose, 'exec', '-T', '--user', 'postgres', 'postgres', 'pgbackrest', '--stanza=consumit', '--type=full', 'backup'],
      'credit-check': [...compose, '--profile', 'backup', 'run', '--rm', 'credit-monitor'],
      'aws-identity-check': [...compose, '--profile', 'backup', 'run', '--rm', 'aws-identity-check'],
      'retention-drill': [...compose, '--profile', 'recovery', 'run', '--rm', 'retention-drill'],
      smoke: [...compose, '--profile', 'backup', 'run', '--rm', '--no-deps', 'smoke'],
    }
    const result = spawnSync('docker', args[command], { env, stdio: 'inherit' })
    process.exitCode = result.status ?? 1
  }
}
