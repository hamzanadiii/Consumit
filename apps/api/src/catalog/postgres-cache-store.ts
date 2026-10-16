import { createHash } from 'node:crypto'
import type { Prisma, PrismaClient } from '../../generated/prisma/client.js'
import type { PersistentCatalogCacheStore } from './cache-store.ts'

function storageKey(key: string) {
  return createHash('sha256').update(`catalog-cache:v1:${key}`).digest('hex')
}

function cachedValue(payload: Prisma.JsonValue): unknown | undefined {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || !('value' in payload)) return undefined
  return payload.value
}

/** Shared, restart-safe cache for validated catalog results. Raw cache keys
 *  can include search terms, so only their SHA-256 digests are persisted. */
export function createPostgresCatalogCacheStore(prisma: PrismaClient): PersistentCatalogCacheStore {
  return {
    async get(key) {
      const row = await prisma.catalogCacheEntry.findUnique({ where: { key: storageKey(key) } })
      if (!row) return null
      const value = cachedValue(row.payload)
      if (value === undefined) return null
      return {
        key,
        value,
        fetchedAt: row.fetchedAt,
        freshUntil: row.freshUntil,
        staleUntil: row.staleUntil,
      }
    },

    async set(entry) {
      const key = storageKey(entry.key)
      const serialized = JSON.stringify(entry.value)
      if (serialized === undefined) throw new TypeError('Catalog cache values must be JSON serializable.')
      const payload: Prisma.InputJsonObject = { value: JSON.parse(serialized) as Prisma.InputJsonValue }
      await prisma.catalogCacheEntry.upsert({
        where: { key },
        create: {
          key,
          payload,
          fetchedAt: entry.fetchedAt,
          freshUntil: entry.freshUntil,
          staleUntil: entry.staleUntil,
        },
        update: {
          payload,
          fetchedAt: entry.fetchedAt,
          freshUntil: entry.freshUntil,
          staleUntil: entry.staleUntil,
        },
      })
    },

    async delete(key) {
      await prisma.catalogCacheEntry.deleteMany({ where: { key: storageKey(key) } })
    },

    async deleteExpired(now) {
      const result = await prisma.catalogCacheEntry.deleteMany({ where: { staleUntil: { lte: now } } })
      return result.count
    },
  }
}
