import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseEnv } from 'node:util'
import { spawnSync } from 'node:child_process'
import { assertRebuildAcceptance } from './rebuild-acceptance.mjs'

const command = process.argv[2] || 'check'
if (!['check', 'build', 'canary', 'up', 'rollback-playback'].includes(command)) throw new Error('Choose check, build, canary, up or rollback-playback.')
const file = resolve(process.env.CONSUMIT_REBUILD_ENV_FILE || '.env.production')
const configured = parseEnv(readFileSync(file, 'utf8'))
const env = { ...process.env, ...configured }
const release = process.env.CONSUMIT_REBUILD_RELEASE
if (command !== 'check' && (!release || !/^rebuild-[a-z0-9-]{1,80}$/.test(release))) throw new Error('Select a unique reviewed CONSUMIT_REBUILD_RELEASE tag starting with rebuild-.')
if (release) env.CONSUMIT_REBUILD_RELEASE = release
if (!env.INTERNAL_SERVICE_SECRET || env.INTERNAL_SERVICE_SECRET.length < 32 || env.INTERNAL_SERVICE_SECRET.length > 256) throw new Error('Configure a dedicated internal service secret privately.')
const percentage = Number(env.CONSUMIT_PLAYBACK_CANARY_PERCENT || 100)
if (!Number.isInteger(percentage) || percentage < 1 || percentage > 100) throw new Error('Canary percentage must be 1–100.')
if (command === 'rollback-playback') { env.CONSUMIT_PLAYBACK_CANARY_PERCENT = '100'; env.CONSUMIT_PLAYBACK_PRIMARY_UPSTREAM = 'api-legacy:3001' }
if (!['playback:3002', 'api-legacy:3001'].includes(env.CONSUMIT_PLAYBACK_PRIMARY_UPSTREAM || 'playback:3002')) throw new Error('Use a reviewed playback upstream.')
const compose = ['compose', '-p', 'consumit-production', '--env-file', file, '-f', 'compose.yaml', '-f', 'compose.playback.yaml', '-f', 'compose.production.yaml', '-f', 'compose.releases.yaml', '-f', 'compose.rebuild.yaml']
if (process.env.CONSUMIT_REBUILD_PIN_FILE) compose.push('-f', resolve(process.env.CONSUMIT_REBUILD_PIN_FILE))
if (percentage < 100 || ['canary', 'up', 'rollback-playback'].includes(command)) compose.push('--profile', 'rebuild-canary')
if (env.RELEASE_TRACKING_ENABLED === 'true') compose.push('--profile', 'releases')
function docker(args, capture = false) {
  const result = spawnSync('docker', args, { env, ...(capture ? { encoding: 'utf8' } : { stdio: 'inherit' }), maxBuffer: 4 * 1024 * 1024 })
  if (result.status !== 0) throw new Error('Release operation failed; inspect its bounded diagnostics.')
  return result.stdout
}
// Never print resolved Compose configuration: it contains production secrets.
docker([...compose, 'config', '--quiet'])
if (command === 'check') process.stdout.write('Split-service Compose preflight passed. Acceptance and budget evidence still determine activation.\n')
else if (command === 'build') {
  for (const name of ['consumit-api', 'consumit-playback', 'consumit-worker', 'consumit-worker-browser', 'consumit-gateway-rebuild']) {
    if (spawnSync('docker', ['image', 'inspect', `${name}:${release}`], { stdio: 'ignore' }).status === 0) throw new Error('That release tag already exists. Choose a fresh immutable release tag.')
  }
  docker([...compose, 'build', 'api', 'playback', 'worker', 'release-worker', 'gateway'])
  const images = ['consumit-api', 'consumit-playback', 'consumit-worker', 'consumit-worker-browser', 'consumit-gateway-rebuild'].map(name => ({ tag: `${name}:${release}`, id: String(docker(['image', 'inspect', `${name}:${release}`, '--format', '{{.Id}}'], true)).trim() }))
  mkdirSync('local', { recursive: true }); writeFileSync(`local/${release}-images.json`, JSON.stringify({ at: new Date().toISOString(), images }, null, 2) + '\n')
} else if (command === 'up' || command === 'canary') {
  const evidence = JSON.parse(readFileSync(resolve(process.env.CONSUMIT_REBUILD_ACCEPTANCE_FILE || 'local/rebuild-acceptance.json'), 'utf8'))
  assertRebuildAcceptance(evidence, release, percentage, command)
  docker([...compose, 'run', '--rm', '--no-deps', 'trace-volume-init'])
  docker([...compose, 'up', '-d', '--no-build', '--no-deps', '--wait', '--wait-timeout', '120', 'api-legacy', 'queue-valkey', 'otel-collector'])
  // Keep playback reachable while the product API switches to split mode.
  const selectedUpstream = env.CONSUMIT_PLAYBACK_PRIMARY_UPSTREAM || 'playback:3002'
  env.CONSUMIT_PLAYBACK_CANARY_PERCENT = '100'; env.CONSUMIT_PLAYBACK_PRIMARY_UPSTREAM = 'api-legacy:3001'
  docker([...compose, 'up', '-d', '--no-build', '--no-deps', 'gateway'])
  env.CONSUMIT_PLAYBACK_CANARY_PERCENT = String(percentage); env.CONSUMIT_PLAYBACK_PRIMARY_UPSTREAM = selectedUpstream
  docker([...compose, 'up', '-d', '--no-build', '--no-deps', '--wait', '--wait-timeout', '120', 'api', 'playback', 'worker'])
  docker([...compose, 'up', '-d', '--no-build', '--no-deps', 'gateway', ...(env.RELEASE_TRACKING_ENABLED === 'true' ? ['release-worker'] : [])])
} else {
  docker([...compose, 'up', '-d', '--no-build', '--no-deps', '--wait', '--wait-timeout', '90', 'api-legacy'])
  docker([...compose, 'up', '-d', '--no-build', '--no-deps', 'gateway'])
  process.stdout.write('Playback routing returned to the compatible combined process. Durable outbox and existing scheduler ownership are retained.\n')
}
