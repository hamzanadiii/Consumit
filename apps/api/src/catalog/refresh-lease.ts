import { createHash } from 'node:crypto'
import type { Valkey } from 'iovalkey'
import type { CatalogRefreshLease } from './stale-cache.ts'

/** Existing application Valkey; search terms never appear in lease keys. */
export function createCatalogRefreshLease(client: Valkey): CatalogRefreshLease {
  const keyFor = (key: string) => `consumit:catalog:refresh:v1:${createHash('sha256').update(key).digest('hex')}`
  return {
    async claim(key, token, ttl) { return await client.set(keyFor(key), token, 'PX', ttl, 'NX') === 'OK' },
    async release(key, token) { await client.eval("if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end", 1, keyFor(key), token) },
  }
}
