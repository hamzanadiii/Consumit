import { afterEach, expect, it, vi } from 'vitest'
import type { PoolConfig } from 'pg'
import { createDbClient } from './client'

const { pools } = vi.hoisted(() => ({ pools: [] as import('pg').Pool[] }))
vi.mock('pg', async importOriginal => {
  const actual = await importOriginal<typeof import('pg')>()
  return { ...actual, default: { ...actual.default, Pool: class extends actual.default.Pool {
    constructor(config: PoolConfig) { super(config); pools.push(this) }
  } } }
})
afterEach(() => vi.restoreAllMocks())

it('handles idle pool errors without throwing or exposing connection details', async () => {
  const output = vi.spyOn(process.stderr, 'write').mockReturnValue(true)
  const db = createDbClient('postgresql://fixture:private-test-password@127.0.0.1:1/fixture_test')
  try {
    expect(() => pools.at(-1)!.emit('error', new Error('private-test-password'))).not.toThrow()
    expect(output).toHaveBeenCalledExactlyOnceWith('{"event":"database_idle_connection_failed"}\n')
  } finally { await db.close() }
})
