import pg from 'pg'
import { readFileSync } from 'node:fs'

if (process.env.DATABASE_DEPLOYMENT === 'self-hosted') {
  const url = new URL(process.env.DATABASE_URL!)
  if (url.hostname !== 'postgres' || url.username !== 'consumit_migrate' || url.searchParams.get('sslmode') !== 'verify-full') throw new Error('Migration grants require the private verified migration connection.')
  for (const key of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'ssl']) url.searchParams.delete(key)
  const pool = new pg.Pool({ connectionString: url.toString(), ssl: { rejectUnauthorized: true, ca: readFileSync('/run/secrets/db-ca.crt', 'utf8') }, max: 1, connectionTimeoutMillis: 5000, statement_timeout: 5000 })
  try { await pool.query('REVOKE ALL ON TABLE "_prisma_migrations" FROM consumit_app;') }
  finally { await pool.end() }
}
