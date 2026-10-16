import { z } from 'zod'
import { readFileSync } from 'node:fs'
import { Queue } from 'bullmq'
import { Redis } from 'ioredis'
import { createDbClient } from '@consumit/db'
import { createOutbox } from './outbox.ts'
import { workerConfig } from './config.ts'
const parsed = workerConfig.safeParse(process.env), id = z.uuid().safeParse(process.argv[2])
if (!parsed.success || !id.success) throw new Error('Provide a valid event UUID and worker configuration; values withheld.')
const config = parsed.data, db = createDbClient(config.DATABASE_URL, { sslMode: config.DATABASE_SSL_MODE, maxConnections: 1, ...(config.DATABASE_SSL_CA_FILE ? { sslCa: readFileSync(config.DATABASE_SSL_CA_FILE, 'utf8') } : {}) })
const connection = new Redis(config.QUEUE_VALKEY_URL.replace(/^valkey:/, 'redis:'), { maxRetriesPerRequest: 1, commandTimeout: 2000, enableOfflineQueue: false })
connection.on('error', () => {})
const queue = new Queue('consumit-background-v1', { connection })
queue.on('error', () => {})
try { await createOutbox(db.prisma).retry(id.data, queue); process.stdout.write('{"retried":true}\n') }
finally { await queue.close(); connection.disconnect(); await db.close() }
