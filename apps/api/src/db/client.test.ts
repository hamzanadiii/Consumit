import { describe, expect, it } from 'vitest'

import { createDbClient } from './client.ts'

describe('database client lifecycle', () => {
  it('refuses an empty connection string instead of failing later mid-request', () => {
    expect(() => createDbClient('  ')).toThrow(/DATABASE_URL/)
  })

  it('creates and closes a client without touching the network until first use', async () => {
    const db = createDbClient('postgresql://postgres:consumit-dev@127.0.0.1:5433/consumit')

    expect(typeof db.prisma.$disconnect).toBe('function')
    await expect(db.close()).resolves.toBeUndefined()
  })
})
