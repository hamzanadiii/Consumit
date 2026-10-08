import { randomBytes } from 'node:crypto'
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { parseEnv } from 'node:util'
import { spawnSync } from 'node:child_process'
import { productionEnvironmentIssues, productionProcessEnvironment } from './production-config.mjs'

const root = process.cwd()
const file = path.resolve(root, '.env.production')
const command = process.argv[2] ?? 'check'
const commands = ['prepare', 'check', 'build', 'up', 'backup', 'backup-check', 'smoke']
if (!commands.includes(command)) throw new Error(`Choose a production command: ${commands.join(', ')}.`)

if (command === 'prepare') {
  if (!existsSync(file)) {
    const template = readFileSync(path.join(root, '.env.production.example'), 'utf8')
      .replace('replace-with-generated-production-secret', randomBytes(32).toString('hex'))
      .replace('replace-with-generated-local-container-password', randomBytes(32).toString('hex'))
    writeFileSync(file, template, { flag: 'wx', mode: 0o600 })
  }
  const secrets = path.join(root, 'infra/secrets')
  mkdirSync(secrets, { recursive: true, mode: 0o700 })
  const password = path.join(secrets, 'restic-password')
  if (!existsSync(password)) writeFileSync(password, `${randomBytes(32).toString('hex')}\n`, { flag: 'wx', mode: 0o600 })
  const alerts = path.join(secrets, 'alertmanager.yml')
  // The host directory remains private, while Alertmanager's unprivileged
  // container user must be able to read the individual read-only bind mount.
  if (!existsSync(alerts)) writeFileSync(alerts, readFileSync(path.join(root, 'infra/observability/alertmanager.yml')), { flag: 'wx', mode: 0o644 })
  if (process.platform !== 'win32') {
    chmodSync(secrets, 0o700)
    chmodSync(alerts, 0o644)
  }
  console.log('Private production files prepared. Existing files and secrets were preserved. Fill the remaining integrations privately, then run production:check.')
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
    for (const name of ['config', 'known_hosts']) {
      if (!env.STORAGE_BOX_SSH_DIR || !existsSync(path.resolve(root, env.STORAGE_BOX_SSH_DIR, name))) issues.push(`STORAGE_BOX_SSH_DIR needs its pinned SSH ${name}.`)
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
    const compose = ['compose', '--env-file', file, '-f', 'compose.yaml', '-f', 'compose.playback.yaml', '-f', 'compose.production.yaml']
    const args = {
      build: [...compose, 'build', 'api', 'web', 'gateway'],
      up: [...compose, 'up', '-d', '--build', '--wait'],
      backup: [...compose, '--profile', 'backup', 'run', '--rm', 'backup'],
      'backup-check': [...compose, '--profile', 'backup', 'run', '--rm', '--entrypoint', 'consumit-backup-check', 'backup'],
    }
    const result = command === 'smoke'
      ? spawnSync(process.execPath, ['scripts/smoke-production.mjs'], { env: { ...env, CONSUMIT_SMOKE_URL: env.APP_ORIGIN }, stdio: 'inherit' })
      : spawnSync('docker', args[command], { env, stdio: 'inherit' })
    process.exitCode = result.status ?? 1
  }
}
