import pg from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '../../../apps/api/generated/prisma/client.js'

export type DbClient = {
  close: () => Promise<void>
  prisma: PrismaClient
  stats: () => { total: number; idle: number; waiting: number; maximum: number }
}

const connectionSslParameters = new Set(['ssl', 'sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'uselibpqcompat'])

function configuredConnectionUrl(databaseUrl: string): string {
  let url: URL
  try {
    url = new URL(databaseUrl)
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname) throw new Error('Invalid connection URL')
  } catch {
    // URL parser errors can include connection credentials.
    throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.')
  }
  // pg applies URL SSL fields after the explicit pool options. Remove them
  // before parsing so application TLS/CA policy cannot be overridden, and
  // URL certificate paths cannot cause unexpected filesystem reads.
  for (const key of new Set(url.searchParams.keys())) {
    if (connectionSslParameters.has(key.toLowerCase())) url.searchParams.delete(key)
  }
  return url.toString()
}

/**
 * One process-scoped database client. Modules receive this instead of
 * creating pools: connection count stays bounded no matter how the API
 * scales horizontally. Guardrails keep one stuck query from holding the
 * backend: statement, lock, and idle-transaction timeouts are measured
 * defaults, revisited with production telemetry (Touch 2.5).
 */
export function createDbClient(databaseUrl: string, options: { sslCa?: string; sslMode?: 'disable' | 'require'; maxConnections?: number } = {}): DbClient {
  if (!databaseUrl.trim()) {
    throw new Error('DATABASE_URL is required to create the database client.')
  }
  if (!Number.isInteger(options.maxConnections ?? 10) || (options.maxConnections ?? 10) < 1 || (options.maxConnections ?? 10) > 100) throw new Error('Use a database pool limit between one and one hundred.')
  const pool = new pg.Pool({
    connectionTimeoutMillis: 5_000,
    connectionString: configuredConnectionUrl(databaseUrl),
    idle_in_transaction_session_timeout: 30_000,
    lock_timeout: 5_000,
    max: options.maxConnections ?? 10,
    ssl: options.sslMode === 'require'
      ? { ca: options.sslCa, rejectUnauthorized: true }
      : false,
    statement_timeout: 10_000,
  })
  // Idle connections can fail outside a request (including during shutdown).
  // pg otherwise emits an unhandled error with connection details attached.
  pool.on('error', () => { process.stderr.write('{"event":"database_idle_connection_failed"}\n') })
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })
  return {
    stats: () => ({ total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount, maximum: options.maxConnections ?? 10 }),
    close: async () => {
      await prisma.$disconnect()
      await pool.end()
    },
    prisma,
  }
}

