import type { PrismaClient } from '../../generated/prisma/client.js'
import { z } from 'zod'
import { providerRoleSchema, providerDeliveryModeSchema } from '@consumit/contracts'
import type { ProviderConfigStore, ProviderKind, ProviderOverridePatch, ProviderOverrides } from './provider-config.ts'

const storedOverride = z.object({
  removed: z.boolean().optional(),
  enabled: z.boolean().optional(),
  role: providerRoleSchema.optional(),
  // Retired values such as proxy-required do not become a new route policy.
  deliveryMode: providerDeliveryModeSchema.optional().catch(undefined),
  priority: z.int().min(0).max(100).optional(),
  order: z.strictObject({ movie: z.int().min(0).max(63).optional(), series: z.int().min(0).max(63).optional(), anime: z.int().min(0).max(63).optional() }).optional(),
  regions: z.array(z.string().regex(/^[A-Z]{2}$/)).max(16).optional(),
  requestsPerMinute: z.int().min(1).max(120).optional(),
  concurrency: z.int().min(1).max(4).optional(),
})

function parse(value: string): ProviderOverridePatch {
  return storedOverride.parse(JSON.parse(value)) as ProviderOverridePatch
}

/** Durable, revisioned provider controls. The audit write and config change
 * commit together; API instances poll the single revision row. */
export function createPostgresProviderConfigStore(prisma: PrismaClient): ProviderConfigStore & {
  migrateLegacy(legacy: ProviderOverrides, allowedIds: readonly string[]): Promise<void>
} {
  return {
    async getAll() {
      const rows = await prisma.providerOverride.findMany()
      return Object.fromEntries(rows.map((row) => [row.id, parse(row.configJson)]))
    },
    async getOverride(id) {
      const row = await prisma.providerOverride.findUnique({ where: { id } })
      return row ? parse(row.configJson) : undefined
    },
    async getRevision() {
      const row = await prisma.providerConfigRevision.findUnique({ where: { id: 1 } })
      return row?.revision ?? 0
    },
    async setOverride(id, patch, actorId = 'system') {
      await prisma.$transaction(async (tx) => {
        const previous = await tx.providerOverride.findUnique({ where: { id } })
        const before = previous ? parse(previous.configJson) : null
        const after = storedOverride.parse({ ...before, ...patch })
        await tx.providerOverride.upsert({ where: { id }, create: { id, configJson: JSON.stringify(after) }, update: { configJson: JSON.stringify(after), revision: { increment: 1 } } })
        await tx.providerChange.create({ data: { providerId: id, actorId, beforeJson: JSON.stringify(before), afterJson: JSON.stringify(after) } })
        await tx.providerConfigRevision.upsert({ where: { id: 1 }, create: { id: 1, revision: 1 }, update: { revision: { increment: 1 } } })
      }, { isolationLevel: 'Serializable' })
    },
    async setOrder(kind: ProviderKind, ids: readonly string[], expected: number, actorId: string) {
      return prisma.$transaction(async (tx) => {
        const changed = await tx.providerConfigRevision.updateMany({ where: { id: 1, revision: expected }, data: { revision: { increment: 1 } } })
        if (changed.count !== 1) return false
        for (const [index, id] of ids.entries()) {
          const previous = await tx.providerOverride.findUnique({ where: { id } })
          const before = previous ? parse(previous.configJson) : null
          if (before?.removed) throw new Error('Removed providers cannot be ordered.')
          const after = storedOverride.parse({ ...before, order: { ...before?.order, [kind]: index } })
          await tx.providerOverride.upsert({ where: { id }, create: { id, configJson: JSON.stringify(after) }, update: { configJson: JSON.stringify(after), revision: { increment: 1 } } })
          await tx.providerChange.create({ data: { providerId: id, actorId, beforeJson: JSON.stringify(before), afterJson: JSON.stringify(after) } })
        }
        return true
      }, { isolationLevel: 'Serializable' })
    },
    async removeOverride(id, actorId = 'system') {
      await prisma.$transaction(async (tx) => {
        const previous = await tx.providerOverride.findUnique({ where: { id } })
        if (!previous) return
        const prior = parse(previous.configJson)
        const after = prior.order || prior.removed ? { ...(prior.order ? { order: prior.order } : {}), ...(prior.removed ? { removed: true } : {}) } : null
        if (after) await tx.providerOverride.update({ where: { id }, data: { configJson: JSON.stringify(after), revision: { increment: 1 } } })
        else await tx.providerOverride.delete({ where: { id } })
        await tx.providerChange.create({ data: { providerId: id, actorId, beforeJson: JSON.stringify(prior), afterJson: JSON.stringify(after) } })
        await tx.providerConfigRevision.upsert({ where: { id: 1 }, create: { id: 1, revision: 1 }, update: { revision: { increment: 1 } } })
      }, { isolationLevel: 'Serializable' })
    },
    async listChanges(limit) {
      const rows = await prisma.providerChange.findMany({ orderBy: { createdAt: 'desc' }, take: Math.min(Math.max(limit, 1), 100) })
      return rows.map((row) => ({ providerId: row.providerId, actorId: row.actorId, before: row.beforeJson === 'null' ? null : parse(row.beforeJson), after: row.afterJson === 'null' ? null : parse(row.afterJson), createdAt: row.createdAt.toISOString() }))
    },
    async migrateLegacy(legacy, allowedIds) {
      await prisma.$transaction(async (tx) => {
        // Multiple API replicas may boot together. Serialize the one-time
        // import before checking the revision row, so exactly one imports it.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(190712, 1)`
        const existing = await tx.providerConfigRevision.findUnique({ where: { id: 1 } })
        if (existing) return
        const entries = Object.entries(legacy).filter(([id]) => allowedIds.includes(id))
        for (const [id, config] of entries) {
          const valid = storedOverride.parse(config)
          await tx.providerOverride.create({ data: { id, configJson: JSON.stringify(valid) } })
          await tx.providerChange.create({ data: { providerId: id, actorId: 'migration', beforeJson: 'null', afterJson: JSON.stringify(valid) } })
        }
        await tx.providerConfigRevision.create({ data: { id: 1, revision: 1 } })
      }, { isolationLevel: 'ReadCommitted' })
    },
  }
}
