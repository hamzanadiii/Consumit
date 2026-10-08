import { mkdirSync, readFileSync, existsSync } from 'node:fs'
import { parseEnv } from 'node:util'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const destination = process.argv[2]
if (!destination || !path.isAbsolute(destination)) throw new Error('Choose an absolute directory on an independent offline drive, from your recovery computer.')
const root = path.resolve('.')
const target = path.resolve(destination, 'consumit-offline-restic')
if (target === root || target.startsWith(root + path.sep)) throw new Error('Offline recovery must be outside this deployment checkout.')
if (!existsSync(destination)) throw new Error('Mount the independent recovery drive first; the script does not create the drive directory.')
mkdirSync(target, { recursive: true, mode: 0o700 })
const env = parseEnv(readFileSync('.env.production', 'utf8'))
if (!env.RESTIC_REPOSITORY?.startsWith('s3:') || env.RESTIC_REPOSITORY.includes('replace-')) throw new Error('Select the real S3 repository from the reviewed deployment.')
// This computer does not share the VPS image store. Build the reviewed backup
// helper locally instead of trying to pull a private, VPS-only image tag.
const image = 'consumit-backup:offline-recovery'
const build = spawnSync('docker', ['build', '-f', 'infra/backup/Dockerfile', '-t', image, '.'], { stdio: 'inherit' })
if (build.status !== 0) process.exit(build.status ?? 1)
const args = ['run', '--rm', '-i', '--entrypoint', 'sh', '--mount', `type=bind,source=${target},target=/offline`,
  ...['backup-aws.json', 'restic-password', 'offline-restic-password'].map(name => ['--mount', `type=bind,source=${path.resolve('infra/secrets', name)},target=/run/secrets/${name},readonly`]).flat(),
  '-e', `SOURCE_REPOSITORY=${env.RESTIC_REPOSITORY}`, '-e', 'RESTIC_REPOSITORY=/offline', '-e', 'RESTIC_PASSWORD_FILE=/run/secrets/offline-restic-password', image]
// Executed on the independent recovery computer. The destination repository is
// encrypted with a different password kept in the operator password manager.
const script = `set -eu
export AWS_ACCESS_KEY_ID="$(jq -er .accessKeyId /run/secrets/backup-aws.json)"
export AWS_SECRET_ACCESS_KEY="$(jq -er .secretAccessKey /run/secrets/backup-aws.json)"
export AWS_SESSION_TOKEN="$(jq -r '.sessionToken // empty' /run/secrets/backup-aws.json)"
if [ ! -f /offline/config ]; then restic init; fi
restic copy --from-repo "$SOURCE_REPOSITORY" --from-password-file /run/secrets/restic-password --tag consumit-postgres --host consumit-production latest
restic check --read-data
date -u +%FT%TZ > /offline/last-verified-refresh.txt
`
const result = spawnSync('docker', args, { input: script, stdio: ['pipe', 'inherit', 'inherit'] })
process.exitCode = result.status ?? 1
