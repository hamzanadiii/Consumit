import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

const mode = process.argv[2]
if (mode !== '--dry-run' && mode !== '--deploy') throw new Error('Select --dry-run or --deploy explicitly.')
const env = existsSync('.env.production') ? parseEnv(readFileSync('.env.production', 'utf8')) : {}
const namespace = mode === '--dry-run' ? '00000000000000000000000000000000' : env.CF_UPTIME_KV_ID
if (!/^[a-f0-9]{32}$/.test(namespace ?? '')) throw new Error('Create the external monitor KV namespace and record CF_UPTIME_KV_ID first.')
mkdirSync('.cache/uptime', { recursive: true, mode: 0o700 })
const source = path.resolve('infra/uptime/worker.mjs').replaceAll('\\', '/')
const config = '.cache/uptime/wrangler.toml'
const configured = readFileSync('infra/uptime/wrangler.toml', 'utf8').replace('main = "worker.mjs"', `main = ${JSON.stringify(source)}`) + `\n[[kv_namespaces]]\nbinding = "STATE"\nid = "${namespace}"\n`
writeFileSync(config, configured, { mode: 0o600 })
function wrangler(args, input) {
  const result = spawnSync('bun', ['x', 'wrangler@4.72.0', ...args], {
    input, stdio: input === undefined ? 'inherit' : ['pipe', 'inherit', 'inherit'],
    env: { ...process.env, CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'false' },
  })
  if (result.status !== 0) process.exit(result.status ?? 1)
}
if (mode === '--dry-run') {
  wrangler(['deploy', '--config', config, '--dry-run'])
} else {
  const token = readFileSync('infra/secrets/telegram-token', 'utf8').trim()
  if (!/^\d+:[A-Za-z0-9_-]+$/.test(token) || !/^-?\d+$/.test(env.TELEGRAM_CHAT_ID ?? '') || Number(env.TELEGRAM_CHAT_ID) === 0) throw new Error('Configure a valid private Telegram token and nonzero chat ID first.')
  const secrets = { TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: env.TELEGRAM_CHAT_ID }
  if (env.CF_ACCESS_CLIENT_ID && env.CF_ACCESS_CLIENT_SECRET) {
    secrets.CF_ACCESS_CLIENT_ID = env.CF_ACCESS_CLIENT_ID
    secrets.CF_ACCESS_CLIENT_SECRET = env.CF_ACCESS_CLIENT_SECRET
  }
  // Create/update the Worker with scheduling paused before installing secrets.
  // A first secret upload cannot rely on an interactive create-Worker prompt.
  const bootstrap = '.cache/uptime/bootstrap.toml'
  writeFileSync(bootstrap, configured.replace('crons = ["*/5 * * * *"]', 'crons = []'), { mode: 0o600 })
  wrangler(['deploy', '--config', bootstrap])
  wrangler(['secret', 'bulk', '--config', bootstrap], JSON.stringify(secrets))
  wrangler(['deploy', '--config', config])
}
