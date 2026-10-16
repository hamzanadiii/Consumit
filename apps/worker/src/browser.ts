import { chromium } from 'playwright'
import { Queue, Worker } from 'bullmq'
import { Redis } from 'ioredis'
import { z } from 'zod'
import { createServer } from 'node:http'
import { startPlaybackTelemetry } from '@consumit/observability'
import { context, propagation, trace } from '@opentelemetry/api'
import type { ReleaseProbeSource } from '@consumit/contracts'
import { createProbeProxy } from '../../release-worker/src/network.ts'
import { createWorker, workerConfigSchema } from '../../release-worker/src/worker.ts'

const config = workerConfigSchema.parse({ apiOrigin: process.env.RELEASE_API_ORIGIN, appOrigin: process.env.RELEASE_APP_ORIGIN, secret: process.env.RELEASE_WORKER_SECRET })
const parsedQueueUrl = z.url().safeParse(process.env.QUEUE_VALKEY_URL)
if (!parsedQueueUrl.success || !['redis:', 'rediss:', 'valkey:'].includes(new URL(parsedQueueUrl.data).protocol)) throw new Error('Use a valid dedicated release queue URL.')
const queueUrl = parsedQueueUrl.data.replace(/^valkey:/, 'redis:')
const telemetry = startPlaybackTelemetry()
let configured = false
const connection = new Redis(queueUrl, { maxRetriesPerRequest: null, connectTimeout: 1500, lazyConnect: true })
const producer = new Redis(queueUrl, { maxRetriesPerRequest: 1, connectTimeout: 1500, commandTimeout: 2000, enableOfflineQueue: false, lazyConnect: true })
for (const client of [producer, connection]) client.on('error', () => { configured = false; process.stderr.write('{"event":"release_queue_unavailable"}\n') })
let source: ReleaseProbeSource | null = null
const connectHost = new URL(config.appOrigin).protocol === 'http:' ? process.env.RELEASE_CONNECT_HOST : undefined
const proxy = await createProbeProxy(config.appOrigin, () => source, connectHost, connectHost ? Number(process.env.RELEASE_CONNECT_PORT || 80) : undefined)
const browser = await chromium.launch({ headless: true, chromiumSandbox: true, proxy: { server: proxy.url }, args: ['--proxy-bypass-list=<-loopback>', '--force-webrtc-ip-handling-policy=disable_non_proxied_udp'] })
const probe = createWorker(config, browser, next => { source = next }, event => process.stdout.write(JSON.stringify({ event }) + '\n'), async (input, init) => {
  const carrier: Record<string, string> = {}; propagation.inject(context.active(), carrier)
  const headers = new Headers(init?.headers); for (const [key, value] of Object.entries(carrier)) headers.set(key, value)
  return fetch(input, { ...init, headers })
})
const queue = new Queue('consumit-release-checks-v1', { connection: producer })
queue.on('error', () => { process.stderr.write('{"event":"release_queue_unavailable"}\n') })
const worker = new Worker('consumit-release-checks-v1', async () => { await trace.getTracer('consumit.jobs').startActiveSpan('release.check', async span => { try { await probe.runOnce() } finally { span.end() } }) }, { connection, concurrency: 1, autorun: false })
worker.on('error', () => { process.stderr.write('{"event":"release_worker_failure"}\n') })
let consuming = false, stopping = false, reconciliation: Promise<void> | undefined
function reconcile() {
  if (stopping || reconciliation) return
  reconciliation = (async () => {
    if (producer.status !== 'ready') { if (producer.status === 'wait') await producer.connect(); else return }
    const policy = await producer.config('GET', 'maxmemory-policy')
    if (policy[1] !== 'noeviction') throw new Error('Unsafe queue eviction policy.')
    const persistence = await producer.config('GET', 'appendonly')
    if (persistence[1] !== 'yes') throw new Error('Queue AOF persistence is required.')
    if (!await queue.getJobScheduler('release-check')) await queue.upsertJobScheduler('release-check', { every: 10000 }, { name: 'release-check', data: {}, opts: { attempts: 3, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: 100, removeOnFail: 100 } })
    configured = true
    if (!consuming) { consuming = true; void worker.run().catch(() => { consuming = false }) }
  })().catch(() => { configured = false; process.stderr.write('{"event":"release_scheduler_delayed"}\n') }).finally(() => { reconciliation = undefined })
}
const timer = setInterval(reconcile, 10000); timer.unref(); producer.on('ready', reconcile); reconcile()
const health = createServer((request, response) => {
  if (request.url === '/health/live') { response.writeHead(200).end('{"status":"ok"}'); return }
  if (request.url !== '/health/ready') { response.writeHead(404).end(); return }
  const ready = !stopping && configured && producer.status === 'ready' && connection.status === 'ready' && browser.isConnected()
  response.writeHead(ready ? 200 : 503).end(JSON.stringify({ status: ready ? 'ok' : 'degraded' }))
})
health.listen(3004, '0.0.0.0')
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => { stopping = true; clearInterval(timer); health.close(); void (async () => { await reconciliation; await worker.close(); await browser.close(); await proxy.close(); await queue.close(); producer.disconnect(); connection.disconnect(); await telemetry.shutdown() })().then(() => process.exit(0), () => process.exit(1)) })
