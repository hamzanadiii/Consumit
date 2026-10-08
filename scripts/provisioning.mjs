import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { parseEnv } from 'node:util'

// Read secret input from stdin, never from process arguments or console logs.
const command = process.argv[2]
if (command === 'credentials') {
  const role = process.argv[3]
  if (!['ses', 'backup', 'feedback', 'credit', 'recovery'].includes(role)) throw new Error('Unknown credential role.')
  const input = parseEnv(readFileSync(0, 'utf8'))
  if (!/^[A-Z0-9]{16,128}$/.test(input.AWS_ACCESS_KEY_ID ?? '') || !/^[A-Za-z0-9/+=]{32,256}$/.test(input.AWS_SECRET_ACCESS_KEY ?? '')) throw new Error('Invalid AWS credential input; contents withheld.')
  mkdirSync('infra/secrets', { recursive: true, mode: 0o700 })
  const file = `infra/secrets/${role}-aws.json`
  writeFileSync(file, JSON.stringify({ accessKeyId: input.AWS_ACCESS_KEY_ID, secretAccessKey: input.AWS_SECRET_ACCESS_KEY, ...(input.AWS_SESSION_TOKEN ? { sessionToken: input.AWS_SESSION_TOKEN } : {}) }) + '\n', { mode: 0o644 })
  // The directory is private; individual read-only container mounts are readable
  // by their unprivileged runtime users, which do not share host UID ownership.
  if (process.platform !== 'win32') { chmodSync('infra/secrets', 0o700); chmodSync(file, 0o644) }
  console.log(`Saved private ${role} credential file.`)
} else if (command === 'telegram') {
  const token = readFileSync('infra/secrets/telegram-token', 'utf8').trim()
  const configured = parseEnv(readFileSync('.env.production', 'utf8'))
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(token) || !/^-?\d+$/.test(configured.TELEGRAM_CHAT_ID ?? '') || Number(configured.TELEGRAM_CHAT_ID) === 0) throw new Error('Telegram requires a valid private token and nonzero numeric chat ID.')
  const template = readFileSync('infra/observability/alertmanager.production.example.yml', 'utf8')
  writeFileSync('infra/secrets/alertmanager.yml', template.replace('replace-with-private-telegram-bot-token', JSON.stringify(token)).replace('chat_id: 0', `chat_id: ${configured.TELEGRAM_CHAT_ID}`), { mode: 0o644 })
  if (process.platform !== 'win32') chmodSync('infra/secrets/alertmanager.yml', 0o644)
  console.log('Saved private Alertmanager Telegram routing.')
} else if (command === 's3') {
  const file = '.env.production'
  const configured = parseEnv(readFileSync(file, 'utf8'))
  const bucket = configured.AWS_BACKUP_BUCKET ?? ''
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) || bucket.includes('replace-')) throw new Error('Choose a valid real S3 bucket name.')
  configured.RESTIC_REPOSITORY = `s3:https://s3.ca-central-1.amazonaws.com/${bucket}/restic`
  writeFileSync(file, Object.entries(configured).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n') + '\n', { mode: 0o600 })
} else throw new Error('Choose credentials, telegram or s3.')
