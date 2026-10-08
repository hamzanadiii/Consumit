import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'

// Disposable, private Docker objects only. No production environment, network,
// database or repository is mounted by this drill.
const prefix = `consumit-drill-${randomUUID().slice(0, 8)}`
const image = process.env.CONSUMIT_DRILL_POSTGRES_IMAGE || 'consumit-postgres:hybrid-check'
const migrationImage = process.env.CONSUMIT_DRILL_MIGRATE_IMAGE || 'consumit-migrate:hybrid-check'
const apiImage = process.env.CONSUMIT_DRILL_API_IMAGE || 'consumit-api:hybrid-check'
const password = 'consumit-isolated-fixture-password-'.repeat(2)
const containers = []
const volumes = []
let networkCreated = false
let phase = 'initialization'

function docker(args, input, allowFailure = false) {
  const result = spawnSync('docker', args, { input, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024, timeout: 180000 })
  if (!allowFailure && result.status !== 0) throw new Error(`Docker operation failed during ${phase}: ${result.stderr || result.error?.message || 'nonzero exit'}`)
  return result
}
function volume(name) {
  const id = `${prefix}-${name}`
  docker(['volume', 'create', id])
  volumes.push(id)
  return id
}
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
async function waitReady(container) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const result = docker(['exec', '--user', 'postgres', container, 'psql', '-U', 'consumit_admin', '-d', 'consumit', '-Atc', 'SELECT 1'], undefined, true)
    if (result.status === 0 && result.stdout.trim() === '1') return
    await pause(1000)
  }
  throw new Error(`Disposable database failed readiness during ${phase}.`)
}
function sql(container, query) {
  return docker(['exec', '-i', '--user', 'postgres', container, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'consumit_admin', '-d', 'consumit', '-At'], query).stdout.trim()
}
function seed(id) {
  return `INSERT INTO "Member" (id,email,"updatedAt") VALUES ('${id}','${id}@example.test',NOW());
INSERT INTO "Credential" ("memberId","passwordHash","updatedAt") VALUES ('${id}','fixture-not-a-password-hash',NOW());
INSERT INTO "Profile" ("memberId",username) VALUES ('${id}','${id}');`
}
function verify(container, expected) {
  assert.equal(Number(sql(container, 'SELECT count(*) FROM "Member";')), expected)
  assert.equal(Number(sql(container, 'SELECT count(*) FROM "Credential";')), expected)
  assert.equal(Number(sql(container, 'SELECT count(*) FROM "Profile";')), expected)
  assert.equal(sql(container, 'SELECT count(*) FROM "Credential" c LEFT JOIN "Member" m ON m.id=c."memberId" WHERE m.id IS NULL;'), '0')
  assert.equal(sql(container, 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL;'), '0')
  assert.ok(Number(sql(container, 'SELECT count(*) FROM "_prisma_migrations";')) > 0)
}
try {
  const secrets = volume('secrets')
  const repository = volume('repository')
  const data = volume('data')
  const logicalData = volume('logical')
  const physicalData = volume('physical')
  docker(['network', 'create', prefix]); networkCreated = true
  phase = 'fixture certificates and encrypted repository'
  docker(['run', '--rm', '-i', '--entrypoint', 'bash', '-v', `${secrets}:/secrets`, '-v', `${repository}:/repository`, image], `set -euo pipefail
umask 077
cd /secrets
for role in admin app migration backup; do printf '%s' '${password}' > "db-$role-password"; done
printf '%s' '${password}' > pgbackrest-password
openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj /CN=Fixture-CA -keyout db-ca.key -out db-ca.crt 2>/dev/null
openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj /CN=Wrong-Fixture-CA -keyout wrong-ca.key -out wrong-ca.crt 2>/dev/null
openssl req -new -newkey rsa:2048 -nodes -subj /CN=postgres -keyout db-server.key -out server.csr 2>/dev/null
printf 'subjectAltName=DNS:postgres\nextendedKeyUsage=serverAuth\n' > server.ext
openssl x509 -req -in server.csr -CA db-ca.crt -CAkey db-ca.key -CAcreateserial -days 2 -out db-server.crt -extfile server.ext 2>/dev/null
cat > /repository/pgbackrest.conf <<'CONFIG'
[global]
repo1-path=/repository/backups
repo1-cipher-type=aes-256-cbc
repo1-cipher-pass=${password}
repo1-retention-full-type=time
repo1-retention-full=14
archive-async=n
log-level-console=warn
[consumit]
pg1-path=/var/lib/postgresql/data
pg1-user=consumit_admin
CONFIG
mkdir /repository/backups
chown -R postgres:postgres /secrets /repository
chmod 0600 /secrets/db-server.key
chmod 0644 /secrets/db-ca.crt /secrets/wrong-ca.crt
printf '{"accessKeyId":"AAAAAAAAAAAAAAAAAAAA","secretAccessKey":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}' > /secrets/ses-aws.json
chmod 0644 /secrets/ses-aws.json
`)
  const common = ['--network', prefix, '-v', `${secrets}:/run/secrets:ro`, '-v', `${repository}:/repository`]
  const pgArguments = ['postgres', '-c', 'ssl=on', '-c', 'ssl_cert_file=/run/secrets/db-server.crt', '-c', 'ssl_key_file=/run/secrets/db-server.key', '-c', 'hba_file=/etc/consumit/pg_hba.conf', '-c', 'ident_file=/etc/consumit/pg_ident.conf']
  const primary = `${prefix}-primary`
  containers.push(primary)
  docker(['run', '-d', '--name', primary, ...common, '--network-alias', 'postgres', '--network-alias', 'wrong-host', '-v', `${data}:/var/lib/postgresql/data`, '-e', 'POSTGRES_USER=consumit_admin', '-e', 'POSTGRES_DB=consumit', '-e', 'POSTGRES_PASSWORD_FILE=/run/secrets/db-admin-password', '--entrypoint', 'docker-entrypoint.sh', image, ...pgArguments, '-c', 'archive_mode=on', '-c', 'archive_timeout=60', '-c', 'archive_command=pgbackrest --config=/repository/pgbackrest.conf --stanza=consumit archive-push %p'])
  await waitReady(primary)
  phase = 'database TLS and role separation'
  const connect = (host, mode, ca) => docker(['run', '--rm', ...common, '--entrypoint', 'psql', image, `--dbname=postgresql://consumit_app:${password}@${host}/consumit?sslmode=${mode}&sslrootcert=/run/secrets/${ca}`, '-Atc', 'SELECT 1'], undefined, true)
  assert.equal(connect('postgres', 'verify-full', 'db-ca.crt').status, 0)
  assert.notEqual(connect('postgres', 'disable', 'db-ca.crt').status, 0)
  assert.notEqual(connect('postgres', 'verify-full', 'wrong-ca.crt').status, 0)
  assert.notEqual(connect('wrong-host', 'verify-full', 'db-ca.crt').status, 0)
  const ddl = docker(['run', '--rm', ...common, '--entrypoint', 'psql', image, `--dbname=postgresql://consumit_app:${password}@postgres/consumit?sslmode=verify-full&sslrootcert=/run/secrets/db-ca.crt`, '-c', 'CREATE TABLE forbidden(id int);'], undefined, true)
  assert.notEqual(ddl.status, 0)
  console.log('TLS drill passed: plaintext, wrong CA, wrong hostname and application DDL rejected.')
  phase = 'actual release migrations'
  docker(['run', '--rm', ...common, '-e', 'DATABASE_DEPLOYMENT=self-hosted', '-e', `DATABASE_URL=postgresql://consumit_migrate:${password}@postgres/consumit?sslmode=verify-full&sslrootcert=/run/secrets/db-ca.crt`, migrationImage])
  phase = 'actual API TLS connections'
  const state = `${prefix}-state`
  containers.push(state)
  docker(['run', '-d', '--name', state, '--network', prefix, '--network-alias', 'auth-state', 'valkey/valkey:9.1.1-alpine', 'valkey-server', '--save', '', '--appendonly', 'no'])
  for (const [label, host, ca, expected] of [['valid', 'postgres', 'db-ca.crt', 200], ['wrong-ca', 'postgres', 'wrong-ca.crt', 503], ['wrong-host', 'wrong-host', 'db-ca.crt', 503]]) {
    const api = `${prefix}-api-${label}`
    containers.push(api)
    docker(['run', '-d', '--name', api, '--network', prefix, '-v', `${secrets}:/run/secrets:ro`,
      '-e', 'NODE_ENV=production', '-e', 'APP_ORIGIN=https://consumit.online', '-e', `AUTH_CODE_PEPPER=${'f'.repeat(64)}`,
      '-e', 'AUTH_EMAIL_FROM=Consumit <auth@consumit.online>', '-e', 'AUTH_EMAIL_PROVIDER=ses', '-e', 'SES_REGION=ca-central-1', '-e', 'SES_CONFIGURATION_SET=consumit-auth', '-e', 'SES_CREDENTIALS_FILE=/run/secrets/ses-aws.json',
      '-e', `DATABASE_URL=postgresql://consumit_app:${password}@${host}/consumit`, '-e', 'DATABASE_SSL_MODE=require', '-e', `DATABASE_SSL_CA_FILE=/run/secrets/${ca}`,
      '-e', 'VALKEY_URL=valkey://auth-state:6379', '-e', 'TMDB_API_READ_TOKEN=isolated-fixture-not-used-for-network', apiImage])
    let status
    for (let attempt = 0; attempt < 45; attempt++) {
      const response = docker(['exec', api, 'bun', '-e', "const r=await fetch('http://127.0.0.1:3001/health/ready');console.log(r.status)"], undefined, true)
      if (response.status === 0) { status = Number(response.stdout.trim()); break }
      await pause(1000)
    }
    assert.equal(status, expected, `Actual API ${label} readiness must reflect verified TLS.`)
    docker(['rm', '-f', api])
  }
  console.log('API TLS drill passed: the built application accepts its CA and rejects wrong CA/hostname connections.')
  sql(primary, seed('before_backup'))
  phase = 'encrypted full backup'
  const backrest = args => docker(['exec', '--user', 'postgres', primary, 'pgbackrest', '--config=/repository/pgbackrest.conf', '--stanza=consumit', ...args])
  backrest(['stanza-create'])
  backrest(['check'])
  backrest(['--type=full', 'backup'])
  phase = 'archive interruption and backlog recovery'
  docker(['exec', primary, 'chmod', '-R', 'a-w', '/repository/backups/archive'])
  sql(primary, seed('during_backlog') + '\nSELECT pg_switch_wal();')
  await pause(2000)
  const pending = () => Number(docker(['exec', primary, 'bash', '-c', "find /var/lib/postgresql/data/pg_wal/archive_status -name '*.ready' | wc -l"]).stdout.trim())
  assert.ok(pending() > 0, 'Unarchived WAL must be retained during interruption.')
  const target = sql(primary, 'SELECT clock_timestamp();')
  await pause(1000)
  sql(primary, seed('after_target') + '\nSELECT pg_switch_wal();')
  docker(['exec', primary, 'chmod', '-R', 'u+rwX', '/repository/backups/archive'])
  for (let attempt = 0; pending() > 0 && attempt < 30; attempt++) await pause(3000)
  assert.equal(pending(), 0, 'Archive backlog must catch up after the repository recovers.')
  backrest(['check'])
  console.log('Archive drill passed: interruption retained WAL and the backlog recovered.')
  phase = 'logical restore into a separate database'
  docker(['exec', '--user', 'postgres', primary, 'pg_dump', '-U', 'consumit_admin', '-d', 'consumit', '-Fc', '--no-owner', '--no-privileges', '-f', '/repository/fixture.dump'])
  const logical = `${prefix}-logical`
  containers.push(logical)
  docker(['run', '-d', '--name', logical, ...common, '-v', `${logicalData}:/var/lib/postgresql/data`, '-e', 'POSTGRES_USER=consumit_admin', '-e', 'POSTGRES_DB=consumit', '-e', 'POSTGRES_PASSWORD_FILE=/run/secrets/db-admin-password', '--entrypoint', 'docker-entrypoint.sh', image, ...pgArguments])
  await waitReady(logical)
  docker(['exec', '--user', 'postgres', logical, 'pg_restore', '-U', 'consumit_admin', '-d', 'consumit', '--no-owner', '--no-privileges', '--exit-on-error', '/repository/fixture.dump'])
  verify(logical, 3)
  phase = 'isolated point-in-time restore'
  docker(['run', '--rm', ...common, '-v', `${physicalData}:/var/lib/postgresql/data`, '--entrypoint', 'bash', image, '-c', 'chown postgres:postgres /var/lib/postgresql/data'])
  docker(['run', '--rm', '--user', 'postgres', ...common, '-v', `${physicalData}:/var/lib/postgresql/data`, '--entrypoint', 'pgbackrest', image, '--config=/repository/pgbackrest.conf', '--stanza=consumit', '--type=time', `--target=${target}`, '--target-action=promote', '--archive-mode=off', 'restore'])
  const physical = `${prefix}-physical`
  containers.push(physical)
  docker(['run', '-d', '--name', physical, ...common, '-v', `${physicalData}:/var/lib/postgresql/data`, '--user', 'postgres', '--entrypoint', 'postgres', image, ...pgArguments.slice(1), '-c', 'archive_mode=off'])
  await waitReady(physical)
  verify(physical, 2)
  assert.equal(sql(physical, 'SELECT count(*) FROM "Member" WHERE id=\'after_target\';'), '0')
  console.log('Recovery drill passed: logical dump and encrypted PITR preserved member relationships and migration state; PITR excluded the later transaction.')
  console.log('These isolated local repository checks do not replace real S3 interruption, protected-version and offsite restoration launch gates.')
} catch (error) {
  console.error(error instanceof Error ? error.message : `Recovery drill failed during ${phase}.`)
  process.exitCode = 1
} finally {
  for (const name of containers.reverse()) docker(['rm', '-f', name], undefined, true)
  for (const name of volumes) {
    assert.ok(name.startsWith(`${prefix}-`))
    docker(['volume', 'rm', name], undefined, true)
  }
  if (networkCreated) docker(['network', 'rm', prefix], undefined, true)
}
