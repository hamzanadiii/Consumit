import pg from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'

import { PrismaClient } from '../../generated/prisma/client.js'

export type DbClient = {
  close: () => Promise<void>
  prisma: PrismaClient
}

/**
 * One process-scoped database client. Modules receive this instead of
 * creating pools: connection count stays bounded no matter how the API
 * scales horizontally. Guardrails keep one stuck query from holding the
 * backend: statement, lock, and idle-transaction timeouts are measured
 * defaults, revisited with production telemetry (Touch 2.5).
 */
export function createDbClient(databaseUrl: string, options: { sslCa?: string; sslMode?: 'disable' | 'require' } = {}): DbClient {
  if (!databaseUrl.trim()) {
    throw new Error('DATABASE_URL is required to create the database client.')
  }
  const pool = new pg.Pool({
    connectionTimeoutMillis: 5_000,
    connectionString: databaseUrl,
    idle_in_transaction_session_timeout: 30_000,
    lock_timeout: 5_000,
    max: 10,
    ssl: options.sslMode === 'require'
      ? { ca: options.sslCa, rejectUnauthorized: true }
      : false,
    statement_timeout: 10_000,
  })
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })
  return {
    close: async () => {
      await prisma.$disconnect()
      await pool.end()
    },
    prisma,
  }
}
