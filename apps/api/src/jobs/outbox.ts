import { randomUUID } from 'node:crypto'
import type { Prisma } from '../../generated/prisma/client.js'
import { outboxPayloadSchema } from '@consumit/contracts/internal'
import { context, propagation } from '@opentelemetry/api'

/** Called inside the product transaction: state and intent commit together. */
export async function appendOutbox(tx: Prisma.TransactionClient, payload: unknown): Promise<void> {
  const headers: Record<string, string> = {}
  propagation.inject(context.active(), headers)
  const parsed = outboxPayloadSchema.parse({ ...outboxPayloadSchema.parse(payload), ...(headers.traceparent ? { traceparent: headers.traceparent } : {}) })
  await tx.$executeRaw`INSERT INTO "OutboxEvent" ("id", "payload") VALUES (${randomUUID()}, ${JSON.stringify(parsed)}::jsonb)`
}
