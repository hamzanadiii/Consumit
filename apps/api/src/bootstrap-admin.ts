import pg from 'pg'
import { readFileSync } from 'node:fs'

// An existing, verified owner registers through the unchanged authentication
// flow. Promotion is an operator-only operation with no public endpoint.
const email = readFileSync(0, 'utf8').trim().toLowerCase()
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Provide the verified owner email on stdin.')
const url = new URL(process.env.DATABASE_URL ?? '')
if (url.hostname !== 'postgres' || url.username !== 'consumit_migrate' || url.searchParams.get('sslmode') !== 'verify-full') throw new Error('Administrator bootstrap requires the private migration connection.')
for (const key of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'ssl']) url.searchParams.delete(key)
const pool = new pg.Pool({ connectionString: url.toString(), max: 1, ssl: { ca: readFileSync('/run/secrets/db-ca.crt', 'utf8'), rejectUnauthorized: true }, connectionTimeoutMillis: 5000, statement_timeout: 5000 })
const client = await pool.connect()
try {
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE')
  await client.query('LOCK TABLE "Member" IN SHARE ROW EXCLUSIVE MODE')
  const existing = await client.query<{ email: string }>('SELECT email FROM "Member" WHERE role=\'ADMIN\' AND status=\'ACTIVE\'')
  if (existing.rows.length && (existing.rows.length !== 1 || existing.rows[0]?.email !== email)) throw new Error('The first administrator has already been bootstrapped.')
  const result = await client.query('UPDATE "Member" m SET role=\'ADMIN\', "updatedAt"=NOW() WHERE email=$1 AND status=\'ACTIVE\' AND "emailVerifiedAt" IS NOT NULL AND EXISTS (SELECT 1 FROM "Credential" c WHERE c."memberId"=m.id)', [email])
  if (result.rowCount !== 1) throw new Error('Bootstrap requires one existing active and verified member with a credential.')
  await client.query('COMMIT')
  console.log('First administrator bootstrap completed; email withheld.')
} catch {
  await client.query('ROLLBACK')
  console.error('Administrator bootstrap failed. Verify the member and existing administrator state privately.')
  process.exitCode = 1
} finally { client.release(); await pool.end() }
