import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { Queue, Worker, DelayedError } from 'bullmq'
import { Redis } from 'ioredis'
import { createDbClient } from '@consumit/db'
import { createInternalClient } from '@consumit/server'
import { backgroundOperationSchema } from '@consumit/contracts/internal'
import { startPlaybackTelemetry } from '../../api/src/playback/telemetry.ts'
import { workerConfig } from './config.ts'
import { createOutbox } from './outbox.ts'
import { JobLeaseBusy } from './lease-busy.ts'
import { metrics, trace, context, propagation } from '@opentelemetry/api'
import { observePool } from '@consumit/observability'

const parsed = workerConfig.safeParse(process.env)
if (!parsed.success) throw new Error('Invalid worker configuration; values withheld.')
const config = parsed.data, telemetry = startPlaybackTelemetry()
const db = createDbClient(config.DATABASE_URL, { sslMode: config.DATABASE_SSL_MODE, ...(config.DATABASE_SSL_CA_FILE ? { sslCa: readFileSync(config.DATABASE_SSL_CA_FILE, 'utf8') } : {}), maxConnections: 5 })
const api = createInternalClient({ origin: config.INTERNAL_API_ORIGIN, secret: config.INTERNAL_SERVICE_SECRET }), playback = createInternalClient({ origin: config.INTERNAL_PLAYBACK_ORIGIN, secret: config.INTERNAL_SERVICE_SECRET })
const address = config.QUEUE_VALKEY_URL.replace(/^valkey:/, 'redis:')
const producer = new Redis(address, { maxRetriesPerRequest: 1, connectTimeout: 1500, commandTimeout: 2000, enableOfflineQueue: false, lazyConnect: true })
const consumer = new Redis(address, { maxRetriesPerRequest: null, connectTimeout: 1500, lazyConnect: true })
for (const client of [producer, consumer]) client.on('error', () => { process.stderr.write('{"event":"queue_unavailable"}\n') })
const queue = new Queue('consumit-background-v1', { connection: producer }), outbox = createOutbox(db.prisma)
const closePoolMetrics = observePool(db.stats)
let counts = { pending: 0, failed: 0, oldestAgeSeconds: 0 }
let configured = false
let schedulingCheckedAt = 0
let consuming = false
const meter = metrics.getMeter('consumit.jobs')
meter.createObservableGauge('jobs.outbox.pending').addCallback(result => result.observe(counts.pending))
meter.createObservableGauge('jobs.outbox.failed').addCallback(result => result.observe(counts.failed))
meter.createObservableGauge('jobs.outbox.oldest.age', { unit: 's' }).addCallback(result => result.observe(counts.oldestAgeSeconds))
meter.createObservableGauge('jobs.queue.ready').addCallback(result => result.observe(producer.status === 'ready' && configured ? 1 : 0))
queue.on('error', () => { process.stderr.write('{"event":"queue_unavailable"}\n') })
const run = async (operation: ReturnType<typeof backgroundOperationSchema.parse>, traceparent?: string) => {
  const call = operation.operation.startsWith('provider.') ? playback : api
  await context.with(traceparent ? propagation.extract(context.active(), { traceparent }) : context.active(), () => trace.getTracer('consumit.jobs').startActiveSpan('background.operation', { attributes: { operation: operation.operation } }, async span => {
    try { await call('/v1/internal/jobs/run', operation, { timeoutMs: 120000 }) }
    finally { span.end() }
  }))
}
const worker = new Worker('consumit-background-v1', async (job, token) => {
  if (job.name === 'outbox') {
    try { await outbox.run(job.data, payload => run({ operation: payload.type === 'release.tracking.v1' ? 'release.refresh' : 'provider.refresh' }, payload.traceparent)) }
    catch (error) { if (error instanceof JobLeaseBusy) { await job.moveToDelayed(Math.max(Date.now() + 1000, error.until), token); throw new DelayedError() }; throw error }
  }
  else await run(backgroundOperationSchema.parse(job.data))
}, { connection: consumer, concurrency: config.WORKER_CONCURRENCY, autorun: false })
worker.on('error', () => { process.stderr.write('{"event":"worker_unavailable"}\n') })
worker.on('failed', () => { process.stderr.write('{"event":"job_failed"}\n') })
let stopping = false, tick: Promise<void> | undefined
async function dispatch() {
  if (stopping || tick) return
  tick = (async () => {
    counts = await outbox.stats()
    if (producer.status !== 'ready') { if (producer.status === 'wait') await producer.connect(); else return }
    const policy = await producer.config('GET', 'maxmemory-policy')
    if (policy[1] !== 'noeviction') throw new Error('Queue eviction policy is unsafe.')
    const persistence = await producer.config('GET', 'appendonly')
    if (persistence[1] !== 'yes') throw new Error('Queue AOF persistence is required.')
    if (configured && Date.now() - schedulingCheckedAt >= 60000) {
      const schedulers = await queue.getJobSchedulers()
      const ids = new Set(schedulers.map(row => row.key))
      configured = ids.has('release.refresh') && ids.has('catalog.cleanup') && (config.PLAYBACK_PROBE_INTERVAL_MINUTES <= 0 || ids.has('provider.probe'))
      schedulingCheckedAt = Date.now()
    }
    if (!configured) {
      for (const [operation, every] of [['release.refresh', 60000], ['catalog.cleanup', 3600000]] as const) await queue.upsertJobScheduler(operation, { every }, { name: 'maintenance', data: { operation }, opts: { attempts: 3, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: 100, removeOnFail: 100 } })
      if (config.PLAYBACK_PROBE_INTERVAL_MINUTES > 0) await queue.upsertJobScheduler('provider.probe', { every: 60000 }, { name: 'maintenance', data: { operation: 'provider.probe' }, opts: { removeOnComplete: 100, removeOnFail: 100 } })
      else await queue.removeJobScheduler('provider.probe')
      configured = true
      schedulingCheckedAt = Date.now()
    }
    if (!consuming) { consuming = true; void worker.run().catch(() => { consuming = false; configured = false }) }
    await outbox.dispatch(queue); await outbox.prune()
  })().catch(() => { configured = false; process.stderr.write('{"event":"outbox_dispatch_delayed"}\n') }).finally(() => { tick = undefined })
  await tick
}
const timer = setInterval(() => { void dispatch() }, 5000); timer.unref(); void dispatch()
const server = createServer(async (request, response) => {
  if (request.url === '/health/live') { response.writeHead(200).end('{"status":"ok"}'); return }
  if (request.url !== '/health/ready') { response.writeHead(404).end(); return }
  try { await db.prisma.$queryRaw`SELECT 1 FROM "OutboxEvent" LIMIT 1`; if (producer.status !== 'ready' || !configured) throw new Error(); await producer.ping(); response.writeHead(200).end('{"status":"ok"}') }
  catch { response.writeHead(503).end('{"status":"degraded"}') }
})
server.listen(config.WORKER_PORT, '0.0.0.0')
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => {
  stopping = true; clearInterval(timer); server.close()
  void (async () => { await tick; await worker.close(); await queue.close(); producer.disconnect(); consumer.disconnect(); closePoolMetrics(); await db.close(); await telemetry.shutdown() })().then(() => process.exit(0), () => process.exit(1))
})
