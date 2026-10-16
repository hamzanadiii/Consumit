import { z } from 'zod'
import { internalConfigSchema } from '@consumit/server'
export const workerConfig = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  INTERNAL_SERVICE_SECRET: z.string().min(32).max(256),
  INTERNAL_API_ORIGIN: z.url(), INTERNAL_PLAYBACK_ORIGIN: z.url(),
  QUEUE_VALKEY_URL: z.url().refine(value => { try { return ['redis:', 'rediss:', 'valkey:'].includes(new URL(value).protocol) } catch { return false } }),
  VALKEY_URL: z.string().optional(), PLAYBACK_VALKEY_URL: z.string().optional(),
  DATABASE_URL: z.string().min(1), DATABASE_SSL_MODE: z.enum(['disable', 'require']).default('require'), DATABASE_SSL_CA_FILE: z.string().optional(),
  WORKER_PORT: z.coerce.number().int().min(1).max(65535).default(3003),
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(4).default(1),
  PLAYBACK_PROBE_INTERVAL_MINUTES: z.coerce.number().int().min(0).max(1440).default(30),
}).superRefine((value, context) => {
  if (value.NODE_ENV === 'production' && value.DATABASE_SSL_MODE !== 'require') context.addIssue({ code: 'custom', path: ['DATABASE_SSL_MODE'], message: 'Production workers require verified database TLS.' })
  for (const field of ['INTERNAL_API_ORIGIN', 'INTERNAL_PLAYBACK_ORIGIN'] as const) {
    if (!internalConfigSchema.safeParse({ origin: value[field], secret: value.INTERNAL_SERVICE_SECRET }).success) context.addIssue({ code: 'custom', path: [field], message: 'Use an exact internal origin.' })
  }
  let queue: URL
  try { queue = new URL(value.QUEUE_VALKEY_URL) } catch { return }
  for (const address of [value.VALKEY_URL, value.PLAYBACK_VALKEY_URL].filter((entry): entry is string => Boolean(entry))) {
    let other: URL
    try { other = new URL(address) } catch { context.addIssue({ code: 'custom', path: ['QUEUE_VALKEY_URL'], message: 'Use valid separate state instances.' }); continue }
    if (queue.hostname === other.hostname && (queue.port || '6379') === (other.port || '6379')) context.addIssue({ code: 'custom', path: ['QUEUE_VALKEY_URL'], message: 'Use a dedicated queue instance, not another logical database.' })
  }
})
