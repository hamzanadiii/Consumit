import { describe, it, expect } from 'vitest'
import { workerConfig } from './config'
const config = { INTERNAL_SERVICE_SECRET: 'fixture-service-secret-longer-than-32', INTERNAL_API_ORIGIN: 'http://api:3001', INTERNAL_PLAYBACK_ORIGIN: 'http://playback:3002', DATABASE_URL: 'postgresql://fixture:fixture@db/fixture_test', QUEUE_VALKEY_URL: 'redis://queue:6379/0', VALKEY_URL: 'valkey://auth:6379/0', PLAYBACK_VALKEY_URL: 'valkey://cache:6379/0' }
describe('worker configuration', () => {
  it('accepts separate queue, auth, and disposable instances', () => { expect(workerConfig.parse(config).WORKER_CONCURRENCY).toBe(1) })
  it('rejects sharing a cache instance through a different logical database', () => { expect(workerConfig.safeParse({ ...config, QUEUE_VALKEY_URL: 'redis://cache:6379/15' }).success).toBe(false) })
  it('rejects internal paths and URL credentials', () => { expect(workerConfig.safeParse({ ...config, INTERNAL_API_ORIGIN: 'http://secret:secret@api:3001' }).success).toBe(false) })
})
