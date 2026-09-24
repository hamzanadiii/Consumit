import { Valkey } from 'iovalkey'
import { ApiError } from '../http/errors.ts'

export interface PlaybackStore {
  get(key: string): Promise<string | null>
  set(key: string, value: string, ttlSeconds: number): Promise<void>
  claim(key: string, value: string, ttlSeconds: number): Promise<boolean>
  release(key: string, value: string): Promise<void>
  close(): Promise<void>
}

export function createMemoryPlaybackStore(now = Date.now): PlaybackStore {
  const records = new Map<string, { value: string; expires: number }>()
  return {
    async get(key) {
      const record = records.get(key)
      if (!record || record.expires <= now()) { records.delete(key); return null }
      return record.value
    },
    async set(key, value, ttl) {
      for (const [id, record] of records) if (record.expires <= now()) records.delete(id)
      if (records.size >= 10000 && !records.has(key)) throw new Error('Playback fixture state capacity exceeded.')
      records.set(key, { value, expires: now() + ttl * 1000 })
    },
    async claim(key, value, ttl) {
      const held = records.get(key)
      if (held && held.expires > now()) return false
      records.set(key, { value, expires: now() + ttl * 1000 })
      return true
    },
    async release(key, value) {
      if (records.get(key)?.value === value) records.delete(key)
    },
    async close() { records.clear() },
  }
}

export function createValkeyPlaybackStore(url: string): PlaybackStore {
  const client = new Valkey(url, { maxRetriesPerRequest: 1, connectTimeout: 1500, commandTimeout: 2000, enableOfflineQueue: false, lazyConnect: true })
  client.on('error', () => { /* errors surface on bounded commands, without credentials */ })
  const ready = client.connect()
  void ready.catch(() => undefined)
  return {
    async get(key) {
      try { if (client.status !== 'ready') await ready; return await client.get(`consumit:playback:v1:${key}`) }
      catch { throw new ApiError('PLAYBACK_UNAVAILABLE', 'Playback sessions are temporarily unavailable. Try again.', { retryable: true }) }
    },
    async set(key, value, ttl) {
      try { if (client.status !== 'ready') await ready; await client.set(`consumit:playback:v1:${key}`, value, 'EX', Math.max(1, Math.ceil(ttl))) }
      catch { throw new ApiError('PLAYBACK_UNAVAILABLE', 'Playback sessions are temporarily unavailable. Try again.', { retryable: true }) }
    },
    async claim(key, value, ttl) {
      try {
        if (client.status !== 'ready') await ready
        return await client.set(`consumit:playback:v1:${key}`, value, 'EX', Math.max(1, Math.ceil(ttl)), 'NX') === 'OK'
      } catch { throw new ApiError('PLAYBACK_UNAVAILABLE', 'Playback recovery is temporarily unavailable. Try again.', { retryable: true }) }
    },
    async release(key, value) {
      try {
        if (client.status !== 'ready') await ready
        await client.eval("if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end", 1, `consumit:playback:v1:${key}`, value)
      } catch { throw new ApiError('PLAYBACK_UNAVAILABLE', 'Playback recovery is temporarily unavailable. Try again.', { retryable: true }) }
    },
    async close() { client.disconnect() },
  }
}
