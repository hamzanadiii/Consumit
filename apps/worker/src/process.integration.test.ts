import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { once } from 'node:events'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { Redis } from 'ioredis'
import { Queue } from 'bullmq'
import { createDbClient } from '@consumit/db'

const databaseUrl = process.env.DATABASE_URL, queueUrl = process.env.QUEUE_VALKEY_URL
if (!databaseUrl || !new URL(databaseUrl).pathname.endsWith('_test') || !queueUrl || new URL(queueUrl).hostname !== '127.0.0.1' || new URL(queueUrl).port !== '16385') throw new Error('Use the dedicated rebuild test infrastructure.')
const db = createDbClient(databaseUrl), connection = new Redis(queueUrl, { maxRetriesPerRequest: null }), queue = new Queue('consumit-background-v1', { connection })
const children: ReturnType<typeof spawn>[] = []
let block = true
const server = createServer((request, response) => {
  const chunks: Buffer[] = []
  request.on('data', chunk => chunks.push(chunk))
  request.on('end', () => {
    const operation = JSON.parse(Buffer.concat(chunks).toString()).operation
    if (operation === 'provider.refresh' && block) return
    response.writeHead(200, { 'content-type': 'application/json' }).end('{"completed":true}')
  })
})
await new Promise<void>(resolve => server.listen(18604, '127.0.0.1', resolve))
function start(queueAddress = queueUrl) {
  const child = spawn(process.execPath, ['--import', new URL('../../api/node_modules/tsx/dist/loader.mjs', import.meta.url).href, fileURLToPath(new URL('./index.ts', import.meta.url))], { env: { ...process.env, NODE_ENV: 'test', WORKER_PORT: '18605', INTERNAL_API_ORIGIN: 'http://127.0.0.1:18604', INTERNAL_PLAYBACK_ORIGIN: 'http://127.0.0.1:18604', INTERNAL_SERVICE_SECRET: 'rebuild-process-fixture-secret-at-least-32', QUEUE_VALKEY_URL: queueAddress, DATABASE_SSL_MODE: 'disable', PLAYBACK_PROBE_INTERVAL_MINUTES: '0' }, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true })
  child.stderr?.on('data', chunk => { if (!String(chunk).startsWith('{')) process.stderr.write(String(chunk)) })
  children.push(child); return child
}
afterAll(async () => { for (const child of children) if (child.exitCode === null) child.kill('SIGKILL'); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await queue.obliterate({ force: true }); await queue.close(); connection.disconnect(); await db.close() })

describe('worker process failures', () => {
  it('stays live but unready when the queue cannot start', async () => {
    const child = start('redis://127.0.0.1:16386/0')
    try {
      await vi.waitFor(async () => expect((await fetch('http://127.0.0.1:18605/health/live')).status).toBe(200), { timeout: 15000 })
      expect((await fetch('http://127.0.0.1:18605/health/ready')).status).toBe(503)
      expect(child.exitCode).toBeNull()
    } finally { if (child.exitCode === null) { const exit = once(child, 'exit'); child.kill('SIGKILL'); await exit } }
  }, 30000)
  it('recovers an actual killed process after the database lease expires', async () => {
    await queue.obliterate({ force: true }); await db.prisma.outboxEvent.deleteMany()
    const id = randomUUID()
    await db.prisma.outboxEvent.create({ data: { id, payload: { type: 'provider.config.v1', providerId: 'fixture', revision: 1 } } })
    const first = start()
    await vi.waitFor(async () => expect((await db.prisma.outboxEvent.findUniqueOrThrow({ where: { id } })).leaseUntil).not.toBeNull(), { timeout: 20000 })
    const exit = once(first, 'exit'); first.kill('SIGKILL'); await exit
    block = false
    const second = start()
    await vi.waitFor(async () => expect((await db.prisma.outboxEvent.findUniqueOrThrow({ where: { id } })).processedAt).not.toBeNull(), { timeout: 220000, interval: 1000 })
    const row = await db.prisma.outboxEvent.findUniqueOrThrow({ where: { id } })
    expect(row.attempts).toBe(2); expect(row.failedAt).toBeNull()
    const stopped = once(second, 'exit'); second.kill('SIGTERM'); await stopped
  }, 250000)
})
