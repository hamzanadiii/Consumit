import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { recoveryTarget } from './recovery-target.mjs'

const mode = process.argv[2]
if (!['physical', 'logical'].includes(mode)) throw new Error('Choose physical <ISO target time> or logical <snapshot ID/latest>.')
const target = process.argv[3]
if (mode === 'physical' && (!target || !/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(target) || !Number.isFinite(Date.parse(target)))) throw new Error('PITR requires an explicit valid UTC ISO target time.')
if (mode === 'logical' && (!target || !/^(latest|[a-f0-9]{8,64})$/.test(target))) throw new Error('Logical restore requires latest or an explicit snapshot ID.')
const env = parseEnv(readFileSync('.env.production', 'utf8'))
if (!/^[A-Za-z0-9_.-]+$/.test(env.CONSUMIT_RELEASE ?? '')) throw new Error('Select the reviewed image release.')
const name = `consumit-recovery-${randomUUID().slice(0, 8)}`
const data = `${name}-data`
const files = `${name}-files`
const image = process.env.CONSUMIT_RECOVERY_POSTGRES_IMAGE || `consumit-postgres:${env.CONSUMIT_RELEASE}`
const backupImage = process.env.CONSUMIT_RECOVERY_BACKUP_IMAGE || `consumit-backup:${env.CONSUMIT_RELEASE}`
if (!/^consumit-postgres:[A-Za-z0-9_.-]+$/.test(image) || !/^consumit-backup:[A-Za-z0-9_.-]+$/.test(backupImage)) throw new Error('Recovery requires reviewed local PostgreSQL and backup image tags.')
let created = false
function docker(args, input) {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', timeout: 900000, maxBuffer: 4 * 1024 * 1024 })
  if (result.status !== 0) throw new Error('Isolated recovery operation failed; inspect the private recovery container and AWS repository.')
  return result.stdout.trim()
}
const secrets = ['backup-aws.json', 'pgbackrest-password', 'db-ca.crt', 'db-server.crt', 'db-server.key', 'db-admin-password', 'db-app-password', 'db-migration-password', 'db-backup-password'].flatMap(secret => ['--mount', `type=bind,source=${path.resolve('infra/secrets', secret)},target=/run/secrets/${secret},readonly`])
const common = ['--network', name, ...secrets, '-e', `AWS_BACKUP_BUCKET=${env.AWS_BACKUP_BUCKET}`, '-e', 'CONSUMIT_RECOVERY_MODE=true', '-v', `${data}:/var/lib/postgresql/data`]
try {
  docker(['network', 'create', name]); created = true
  docker(['volume', 'create', data])
  if (mode === 'physical') {
    docker(['run', '--rm', ...common, image, 'pgbackrest', '--stanza=consumit', '--type=time', `--target=${recoveryTarget(target)}`, '--target-action=promote', '--archive-mode=off', 'restore'])
  } else {
    docker(['volume', 'create', files])
    docker(['run', '--rm', '-i', '--entrypoint', 'sh', ...secrets, '--mount', `type=bind,source=${path.resolve('infra/secrets/restic-password')},target=/run/secrets/restic-password,readonly`, '-v', `${files}:/restore`, '-e', `RESTIC_REPOSITORY=${env.RESTIC_REPOSITORY}`, '-e', 'RESTIC_PASSWORD_FILE=/run/secrets/restic-password', '-e', `RESTORE_SNAPSHOT=${target}`, backupImage], `set -eu
export AWS_ACCESS_KEY_ID="$(jq -er .accessKeyId /run/secrets/backup-aws.json)"
export AWS_SECRET_ACCESS_KEY="$(jq -er .secretAccessKey /run/secrets/backup-aws.json)"
export AWS_SESSION_TOKEN="$(jq -r '.sessionToken // empty' /run/secrets/backup-aws.json)"
restic restore "$RESTORE_SNAPSHOT" --tag consumit-postgres --host consumit-production --target /restore
dump="$(find /restore/tmp -type f -name consumit.dump)"
[ -n "$dump" ] && [ "$(printf '%s\\n' "$dump" | wc -l)" -eq 1 ]
cp -- "$dump" /restore/consumit.dump
chmod 0644 /restore/consumit.dump
`)
  }
  docker(['run', '-d', '--name', name, ...common, '--network-alias', 'postgres', ...(mode === 'logical' ? ['-v', `${files}:/restore:ro`] : []), '-e', 'POSTGRES_USER=consumit_admin', '-e', 'POSTGRES_DB=consumit', '-e', 'POSTGRES_PASSWORD_FILE=/run/secrets/db-admin-password', image])
  let ready = false
  for (let attempt = 0; attempt < 90; attempt++) {
    const result = spawnSync('docker', ['exec', '--user', 'postgres', name, 'psql', '-U', 'consumit_admin', '-d', 'consumit', '-Atc', 'SELECT 1'], { stdio: 'ignore' })
    if (result.status === 0) { ready = true; break }
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  if (!ready) throw new Error('Recovery did not reach its target; do not promote it to production.')
  if (mode === 'logical') docker(['exec', '--user', 'postgres', name, 'pg_restore', '-U', 'consumit_admin', '-d', 'consumit', '--no-owner', '--no-privileges', '--exit-on-error', '/restore/consumit.dump'])
  const invariants = docker(['exec', '-i', '--user', 'postgres', name, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'consumit_admin', '-d', 'consumit', '-At'], `SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL;
SELECT count(*) FROM "Profile" p LEFT JOIN "Member" m ON m.id=p."memberId" WHERE m.id IS NULL;
SELECT count(*) FROM "Credential" c LEFT JOIN "Member" m ON m.id=c."memberId" WHERE m.id IS NULL;
SELECT count(*) FROM "PlaybackProgress" p LEFT JOIN "Member" m ON m.id=p."memberId" WHERE m.id IS NULL;
SHOW archive_mode;
SELECT count(*) FROM "_prisma_migrations";
`)
  const values = invariants.split(/\r?\n/)
  if (values.slice(0, 4).some(value => value !== '0') || values[4] !== 'off' || !(Number(values[5]) > 0)) throw new Error('Restoration invariants failed; keep this isolated database for investigation.')
  console.log(`Isolated ${mode} restore verified: relationships and completed migrations are intact; archiving is disabled.`)
  console.log(`Container: ${name}. Volume: ${data}. No production services were changed.`)
  console.log(`After inspection, remove only these objects: docker rm -f ${name}; docker volume rm ${data}${mode === 'logical' ? ` ${files}` : ''}; docker network rm ${name}`)
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Recovery failed.')
  if (created) console.error(`Preserved isolated recovery objects under ${name}; production is unchanged.`)
  process.exitCode = 1
}
