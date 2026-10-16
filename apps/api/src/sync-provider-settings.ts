import pg from 'pg'
import { readFileSync } from 'node:fs'
import { replaceProviderSettings, parseProviderSettingsTransfer } from './admin/provider-settings-transfer.ts'

async function sync() {
  const input = readFileSync(0, 'utf8')
  if (input.length > 2_000_000) throw new Error('Provider transfer exceeds its limit.')
  const snapshot = parseProviderSettingsTransfer(JSON.parse(input))
  if (process.argv.includes('--validate-only')) {
    console.log(JSON.stringify({ status: 'provider-transfer-valid', rows: snapshot.base.length, orders: snapshot.orders }))
    return
  }
  const url = new URL(process.env.DATABASE_URL ?? '')
  if (url.hostname !== 'postgres' || url.username !== 'consumit_migrate' || url.searchParams.get('sslmode') !== 'verify-full') throw new Error('Provider synchronization requires the private migration connection.')
  for (const key of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey', 'ssl']) url.searchParams.delete(key)
  const db = new pg.Client({ connectionString: url.toString(), ssl: { ca: readFileSync('/run/secrets/db-ca.crt', 'utf8'), rejectUnauthorized: true }, connectionTimeoutMillis: 5000, statement_timeout: 10000 })
  await db.connect()
  try {
    // Strip derived orders before validating and committing the transfer again.
    const { version, base, overrides } = snapshot
    if (process.argv.includes('--verify')) {
      const current = await db.query('SELECT id, "configJson" FROM "ProviderOverride"')
      const stored = Object.fromEntries(current.rows.map(row => [row.id, JSON.parse(row.configJson)]))
      const canonical = (value: unknown): string => JSON.stringify(value, (_, entry: unknown) => entry && typeof entry === 'object' && !Array.isArray(entry) ? Object.fromEntries(Object.entries(entry).sort(([left], [right]) => left.localeCompare(right))) : entry)
      if (canonical(stored) !== canonical(overrides)) throw new Error('Saved provider settings differ from the transferred snapshot.')
      console.log('Saved production provider settings exactly match the transferred local snapshot.')
      return
    }
    const result = await replaceProviderSettings(db, { version, base, overrides })
    console.log(JSON.stringify({ status: 'provider-settings-synchronized', ...result }))
  } finally { await db.end() }
}
sync().catch(() => { console.error('Provider synchronization failed; private details withheld. Previous settings remain if the transaction failed.'); process.exitCode = 1 })
