import { randomUUID } from 'node:crypto'
import type { DbClient } from '@consumit/db'
import { jobEnvelopeSchema, outboxPayloadSchema } from '@consumit/contracts/internal'
import type { Queue } from 'bullmq'
import { metrics } from '@opentelemetry/api'
import { JobLeaseBusy } from './lease-busy.ts'

const meter = metrics.getMeter('consumit.jobs')
const processed = meter.createCounter('jobs.processed')
const age = meter.createHistogram('jobs.outbox.age', { unit: 's' })
export function createOutbox(db: DbClient['prisma'], clock = () => new Date()) {
  return {
    async dispatch(queue: Pick<Queue, 'add' | 'getJob'>) {
      const rows = await db.outboxEvent.findMany({ where: { processedAt: null, failedAt: null, availableAt: { lte: clock() }, OR: [{ leaseUntil: null }, { leaseUntil: { lte: clock() } }] }, orderBy: { createdAt: 'asc' }, take: 100 })
      for (const row of rows) {
        const parsed = outboxPayloadSchema.safeParse(row.payload)
        if (!parsed.success) { await db.outboxEvent.update({ where: { id: row.id }, data: { failedAt: clock(), lastFailure: 'invalid-payload' } }); continue }
        const existing = await queue.getJob(row.id)
        if (existing) {
          const state = await existing.getState()
          if (state === 'failed') { await db.outboxEvent.update({ where: { id: row.id }, data: { failedAt: clock(), lastFailure: 'retries-exhausted' } }); continue }
          if (state !== 'completed') continue
          await existing.remove()
        }
        await queue.add('outbox', { id: row.id, version: 1, payload: parsed.data }, { jobId: row.id, attempts: 5, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: { age: 86400, count: 1000 }, removeOnFail: { age: 7 * 86400, count: 1000 } })
        age.record((clock().getTime() - row.createdAt.getTime()) / 1000)
      }
      return rows.length
    },
    async run(input: unknown, operation: (payload: ReturnType<typeof outboxPayloadSchema.parse>) => Promise<void>) {
      const event = jobEnvelopeSchema.parse(input), token = randomUUID(), now = clock()
      // PostgreSQL fences duplicate queue delivery and is the recovery authority.
      const claim = await db.outboxEvent.updateMany({ where: { id: event.id, processedAt: null, failedAt: null, OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }] }, data: { leaseToken: token, leaseUntil: new Date(now.getTime() + 180000), attempts: { increment: 1 } } })
      if (!claim.count) {
        const row = await db.outboxEvent.findUnique({ where: { id: event.id } })
        if (!row || row.processedAt || row.failedAt) return
        throw new JobLeaseBusy(row.leaseUntil?.getTime() ?? clock().getTime() + 30000)
      }
      const row = await db.outboxEvent.findUniqueOrThrow({ where: { id: event.id } })
      try {
        // Read the committed payload instead of trusting queue data.
        await operation(outboxPayloadSchema.parse(row.payload))
        await db.outboxEvent.updateMany({ where: { id: event.id, leaseToken: token }, data: { processedAt: clock(), leaseToken: null, leaseUntil: null, lastFailure: null } })
        processed.add(1, { outcome: 'success', type: event.payload.type })
      } catch {
        await db.outboxEvent.updateMany({ where: { id: event.id, leaseToken: token }, data: { leaseToken: null, leaseUntil: null, lastFailure: 'operation-failed', ...(row.attempts >= 5 ? { failedAt: clock() } : {}) } })
        processed.add(1, { outcome: 'failed', type: event.payload.type })
        throw new Error('Background operation failed.')
      }
    },
    async retry(id: string, queue: Pick<Queue, 'getJob'>) {
      const row = await db.outboxEvent.findUnique({ where: { id } })
      if (!row?.failedAt) throw new Error('Only failed background work can be retried.')
      const existing = await queue.getJob(id)
      if (existing) { if (await existing.getState() === 'active') throw new Error('Background work is still active.'); await existing.remove() }
      await db.outboxEvent.updateMany({ where: { id, failedAt: { not: null } }, data: { attempts: 0, failedAt: null, leaseToken: null, leaseUntil: null, availableAt: clock(), lastFailure: null } })
    },
    async prune() { await db.outboxEvent.deleteMany({ where: { processedAt: { lt: new Date(clock().getTime() - 7 * 86400000) } } }) },
    async stats() {
      const [pending, failed, oldest] = await Promise.all([
        db.outboxEvent.count({ where: { processedAt: null, failedAt: null } }),
        db.outboxEvent.count({ where: { failedAt: { not: null } } }),
        db.outboxEvent.findFirst({ where: { processedAt: null, failedAt: null }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
      ])
      return { pending, failed, oldestAgeSeconds: oldest ? Math.max(0, (clock().getTime() - oldest.createdAt.getTime()) / 1000) : 0 }
    },
  }
}
