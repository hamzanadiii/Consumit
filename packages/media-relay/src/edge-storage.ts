import type { PlaybackStore } from '../../../apps/api/src/playback/state.ts'
import type { SubtitleFileStore } from '../../../apps/api/src/subtitles/storage.ts'

export type SqlStorage = {
  exec<T extends Record<string, unknown> = Record<string, unknown>>(query: string, ...params: (string | number | null)[]): { toArray(): T[] }
}
export type EdgeBucket = {
  get(key: string): Promise<{ text(): Promise<string>; customMetadata?: Record<string, string> } | null>
  put(key: string, value: string, options: { httpMetadata: { contentType: string }; customMetadata: Record<string, string> }): Promise<unknown>
  delete(key: string): Promise<unknown>
}

/** SQLite statements are synchronous/atomic within a Durable Object. TTL is
 * checked on every read, even when an alarm or lifecycle sweep is delayed. */
export function createSqlitePlaybackStore(sql: SqlStorage, now = Date.now, onSet?: (expires: number) => Promise<void>): PlaybackStore {
  sql.exec('CREATE TABLE IF NOT EXISTS state (key TEXT PRIMARY KEY, value TEXT NOT NULL, expires INTEGER NOT NULL)')
  return {
    async get(key) { const row = sql.exec<{ value: string; expires: number }>('SELECT value, expires FROM state WHERE key = ?', key).toArray()[0]; return row && row.expires > now() ? row.value : null },
    async set(key, value, ttl) {
      sql.exec('DELETE FROM state WHERE expires <= ?', now())
      sql.exec('INSERT INTO state(key, value, expires) VALUES(?, ?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, expires=excluded.expires', key, value, now() + ttl * 1000)
      await onSet?.(now() + ttl * 1000)
    },
    async claim(key, value, ttl) {
      sql.exec('DELETE FROM state WHERE key = ? AND expires <= ?', key, now())
      return sql.exec<{ key: string }>('INSERT OR IGNORE INTO state(key, value, expires) VALUES(?, ?, ?) RETURNING key', key, value, now() + ttl * 1000).toArray().length === 1
    },
    async release(key, value) { sql.exec('DELETE FROM state WHERE key = ? AND value = ?', key, value) },
    async close() {},
  }
}

export type ExpiringSqlStorage = { sql: SqlStorage; setAlarm?: (when: number) => Promise<void> }
/** Durable alarms remove idle objects' expired rows; cleanup does not depend
 * on another viewer returning to the title. At most one alarm is pending. */
export function createExpiringSqliteStore(storage: ExpiringSqlStorage, now = Date.now) {
  let scheduledAt = Infinity
  const schedule = async (expires: number) => {
    if (!storage.setAlarm || expires >= scheduledAt) return
    scheduledAt = expires
    try { await storage.setAlarm(expires) } catch (error) { scheduledAt = Infinity; throw error }
  }
  const store = createSqlitePlaybackStore(storage.sql, now, schedule)
  return {
    store,
    async alarm() {
      scheduledAt = Infinity
      storage.sql.exec('DELETE FROM state WHERE expires <= ?', now())
      const next = storage.sql.exec<{ expires: number | null }>('SELECT MIN(expires) AS expires FROM state').toArray()[0]?.expires
      if (next !== null && next !== undefined) await schedule(next)
    },
  }
}

export function createR2SubtitleFiles(bucket: EdgeBucket, now = Date.now, index?: PlaybackStore): SubtitleFileStore {
  const valid = (key: string) => /^[a-f0-9]{16}$/.test(key)
  return {
    ...(index ? {
      resolveKey: (identity: string) => index.get(`file-identity:${identity}`),
      bindKey: (identity: string, key: string, ttl: number) => index.set(`file-identity:${identity}`, key, ttl),
    } : {}),
    async getVtt(key) {
      if (!valid(key)) return null
      const object = await bucket.get(`prepared/${key}.vtt`)
      if (!object) return null
      if (Number(object.customMetadata?.expires ?? 0) <= now()) { await bucket.delete(`prepared/${key}.vtt`); return null }
      return object.text()
    },
    async putVtt(key, vtt, options) {
      if (!valid(key) || Buffer.byteLength(vtt) > 524_288) throw new Error('Invalid prepared subtitle.')
      const existing = await bucket.get(`prepared/${key}.vtt`)
      if (existing && await existing.text() !== vtt) throw new Error('Immutable subtitle identity collision.')
      await bucket.put(`prepared/${key}.vtt`, vtt, { httpMetadata: { contentType: 'text/vtt; charset=utf-8' }, customMetadata: { expires: String(now() + 7 * 86400_000), visibility: options.private ? 'private' : 'public' } })
    },
    async getOriginal() { return null },
    async putOriginal() {},
  }
}
