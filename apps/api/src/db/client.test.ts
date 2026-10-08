import pg from 'pg'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createDbClient } from './client.ts'

afterEach(() => vi.restoreAllMocks())

function captureEffectiveSsl() {
  const OriginalPool = pg.Pool
  let effectiveSsl: unknown
  vi.spyOn(pg, 'Pool').mockImplementation(function (config?: pg.PoolConfig) {
    effectiveSsl = Reflect.get(new pg.Client(config), 'ssl')
    return new OriginalPool(config)
  })
  return () => effectiveSsl
}

describe('database client lifecycle', () => {
  it('refuses an empty connection string instead of failing later mid-request', () => {
    expect(() => createDbClient('  ')).toThrow(/DATABASE_URL/)
  })

  it('creates and closes a client without touching the network until first use', async () => {
    const db = createDbClient('postgresql://postgres:consumit-dev@127.0.0.1:5433/consumit')

    expect(typeof db.prisma.$disconnect).toBe('function')
    await expect(db.close()).resolves.toBeUndefined()
  })

  it.each(['sslmode=disable', 'sslmode=no-verify', 'sslmode=require&uselibpqcompat=true'])('connection URL %s cannot weaken required database TLS', async (query) => {
    const effectiveSsl = captureEffectiveSsl()
    const db = createDbClient(`postgresql://fixture:fixture@database.example/consumit?${query}`, { sslMode: 'require' })
    try {
      expect(effectiveSsl()).toEqual({ ca: undefined, rejectUnauthorized: true })
    } finally {
      await db.close()
    }
  })

  it('connection URL certificate paths cannot replace the configured certificate authority', async () => {
    const effectiveSsl = captureEffectiveSsl()
    const db = createDbClient('postgresql://fixture@database.example/consumit?sslrootcert=/missing-uri-ca.pem&sslkey=/missing-uri-key.pem', { sslMode: 'require', sslCa: 'fixture-configured-ca' })
    try {
      expect(effectiveSsl()).toEqual({ ca: 'fixture-configured-ca', rejectUnauthorized: true })
    } finally {
      await db.close()
    }
  })

  it('rejects malformed or non-Postgres URLs without exposing credentials', () => {
    for (const url of ['postgresql://fixture:secret@[bad/consumit', 'https://fixture:secret@database.example/consumit']) {
      expect(() => createDbClient(url)).toThrow('DATABASE_URL must be a valid PostgreSQL connection URL.')
    }
  })
})
