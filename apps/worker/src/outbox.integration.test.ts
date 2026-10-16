import { randomUUID } from 'node:crypto'
import { beforeEach, afterAll, describe, expect, it, vi } from 'vitest'
import { Queue, Worker } from 'bullmq'
import { Redis } from 'ioredis'
import { createDbClient } from '@consumit/db'
import { createOutbox } from './outbox'
import { JobLeaseBusy } from './lease-busy'
import { appendOutbox } from '../../api/src/jobs/outbox.ts'
import { createPostgresProviderConfigStore } from '../../api/src/admin/postgres-provider-config.ts'

const databaseUrl = process.env.DATABASE_URL
const queueUrl = process.env.QUEUE_VALKEY_URL
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test') || !queueUrl || new URL(queueUrl).hostname !== '127.0.0.1' || new URL(queueUrl).port !== '16385') throw new Error('Use the dedicated rebuild test database and queue at 127.0.0.1:16385.')
const db = createDbClient(databaseUrl), connection = new Redis(queueUrl, { maxRetriesPerRequest: null }), queue = new Queue('consumit-outbox-integration-test', { connection }), outbox = createOutbox(db.prisma)
beforeEach(async () => { await queue.obliterate({ force: true }); await db.prisma.outboxEvent.deleteMany() })
afterAll(async () => { await queue.obliterate({ force: true }); await queue.close(); connection.disconnect(); await db.close() })
const append = async () => { const id = randomUUID(); await db.prisma.outboxEvent.create({ data: { id, payload: { type: 'provider.config.v1', providerId: 'fixture', revision: 1 } } }); return id }
const envelope = (id: string) => ({ id, version: 1, payload: { type: 'provider.config.v1', providerId: 'fixture', revision: 1 } })
describe('durable background work with PostgreSQL and Valkey', () => {
  it('records the committed provider revision in the configuration transaction', async () => {
    const store = createPostgresProviderConfigStore(db.prisma, true)
    await store.setOverride('outbox-fixture', { enabled: false })
    const row = await db.prisma.outboxEvent.findFirstOrThrow()
    expect(row.payload).toEqual({ type: 'provider.config.v1', providerId: 'outbox-fixture', revision: await store.getRevision?.() })
    await db.prisma.providerOverride.delete({ where: { id: 'outbox-fixture' } })
  })
  it('commits intent in the product transaction and rolls it back with a failed write', async () => {
    await expect(db.prisma.$transaction(async tx => { await appendOutbox(tx, { type: 'provider.config.v1', providerId: 'fixture', revision: 1 }); throw new Error('abort') })).rejects.toThrow('abort')
    expect(await db.prisma.outboxEvent.count()).toBe(0)
    await db.prisma.$transaction(tx => appendOutbox(tx, { type: 'provider.config.v1', providerId: 'fixture', revision: 1 }))
    expect(await db.prisma.outboxEvent.count()).toBe(1)
  })
  it('processes the pinned BullMQ/client/server combination without duplicate side effects', async () => {
    const policy = await connection.config('GET', 'maxmemory-policy'); expect(policy[1]).toBe('noeviction')
    const persistence = await connection.config('GET', 'appendonly'); expect(persistence[1]).toBe('yes')
    const id = await append(), operation = vi.fn(async () => {})
    const worker = new Worker(queue.name, job => outbox.run(job.data, operation), { connection, concurrency: 1 })
    try {
      await outbox.dispatch(queue)
      await vi.waitFor(async () => expect((await db.prisma.outboxEvent.findUniqueOrThrow({ where: { id } })).processedAt).not.toBeNull(), { timeout: 10000 })
      await outbox.run(envelope(id), operation); expect(operation).toHaveBeenCalledOnce()
    } finally { await worker.close() }
  })
  it('reconstructs unfinished intent after queue loss and retains exhausted failures for explicit retry', async () => {
    const id = await append(); await outbox.dispatch(queue); expect(await queue.getJob(id)).toBeDefined()
    await queue.obliterate({ force: true }); await outbox.dispatch(queue); expect(await queue.getJob(id)).toBeDefined()
    const operation = vi.fn(async () => { throw new Error('unavailable') })
    for (let attempt = 0; attempt < 5; attempt++) await expect(outbox.run(envelope(id), operation)).rejects.toThrow('failed')
    expect((await db.prisma.outboxEvent.findUniqueOrThrow({ where: { id } })).failedAt).not.toBeNull()
    await outbox.retry(id, queue); await outbox.run(envelope(id), async () => {})
    expect((await db.prisma.outboxEvent.findUniqueOrThrow({ where: { id } })).processedAt).not.toBeNull()
  })
  it('fences a crashed lease and recovers after its expiry using committed payloads', async () => {
    const id = await append(), operation = vi.fn(async () => {})
    await db.prisma.outboxEvent.update({ where: { id }, data: { leaseToken: randomUUID(), leaseUntil: new Date(Date.now() + 60000) } })
    await expect(outbox.run(envelope(id), operation)).rejects.toBeInstanceOf(JobLeaseBusy); expect(operation).not.toHaveBeenCalled()
    await db.prisma.outboxEvent.update({ where: { id }, data: { leaseUntil: new Date(Date.now() - 1) } })
    await outbox.run({ ...envelope(id), payload: { type: 'provider.config.v1', providerId: 'forged', revision: 99 } }, operation)
    expect(operation).toHaveBeenCalledWith({ type: 'provider.config.v1', providerId: 'fixture', revision: 1 })
  })
})
