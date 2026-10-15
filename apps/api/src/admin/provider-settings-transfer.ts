import { z } from 'zod'
import { providerDeliveryModeSchema, providerRoleSchema } from '@consumit/contracts'
import { configuredProviders } from '../playback/configured-providers.ts'
import { applyOverridesInPlace, orderedProviderIds, type ProviderOverrides } from './provider-config.ts'

const order = z.strictObject({ movie: z.int().min(0).max(63).optional(), series: z.int().min(0).max(63).optional(), anime: z.int().min(0).max(63).optional() })
const patch = z.strictObject({ removed: z.boolean().optional(), enabled: z.boolean().optional(), role: providerRoleSchema.optional(), deliveryMode: providerDeliveryModeSchema.optional(), priority: z.int().min(0).max(100).optional(), order: order.optional(), regions: z.array(z.string().regex(/^[A-Z]{2}$/)).min(1).max(16).optional(), requestsPerMinute: z.int().min(1).max(120).optional(), concurrency: z.int().min(1).max(4).optional() })
const transfer = z.strictObject({ version: z.literal(1), base: z.array(z.unknown()).min(1).max(64), overrides: z.record(z.string().regex(/^[a-z0-9-]{1,40}$/), patch) })

/** Private operator transfer of provider controls. No identities, credentials,
 * playback sessions or member data are part of this format. */
export function parseProviderSettingsTransfer(value: unknown) {
  const data = transfer.parse(value)
  // Construction validates every configured host/adapter without contacting it.
  const providers = configuredProviders(data.base, { tmdbToken: 'validation-only', animeTitleResolver: async () => 'validation-only', animeTitleVariantsResolver: async () => ['validation-only'], animeMetaResolver: async () => ({ title: 'validation-only', malId: null }) })
  const ids = new Set(providers.map(p => p.adapter.id))
  for (const [id, settings] of Object.entries(data.overrides)) {
    if (!ids.has(id)) throw new Error('Settings name a provider outside the transferred roster.')
    const provider = providers.find(p => p.adapter.id === id)!
    if (settings.regions?.some(region => !provider.approvedRegions.includes(region))) throw new Error('Settings expand configured provider regions.')
    if (settings.deliveryMode && ((provider.deliveryMode === 'embed') !== (settings.deliveryMode === 'embed'))) throw new Error('Settings change the adapter media boundary.')
  }
  const overrides = data.overrides as ProviderOverrides
  applyOverridesInPlace(providers, overrides)
  return { ...data, overrides, orders: Object.fromEntries((['movie', 'series', 'anime'] as const).map(kind => [kind, orderedProviderIds(providers, overrides, kind)])) }
}

type QueryClient = { query(text: string, values?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }> }

/** The caller supplies one private migration connection. All settings and
 * audit rows commit together; a single revision notifies running replicas. */
export async function replaceProviderSettings(client: QueryClient, value: unknown, actorId = 'operator:local-provider-sync') {
  const data = parseProviderSettingsTransfer(value)
  await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE')
  try {
    await client.query('LOCK TABLE "ProviderConfigRevision", "ProviderOverride" IN SHARE ROW EXCLUSIVE MODE')
    const previous = await client.query('SELECT id, "configJson" FROM "ProviderOverride"')
    const before = new Map(previous.rows.map(row => [String(row.id), String(row.configJson)]))
    for (const id of new Set([...before.keys(), ...Object.keys(data.overrides)])) {
      const after = data.overrides[id]
      const afterJson = after ? JSON.stringify(after) : 'null'
      if (before.get(id) === afterJson || (!before.has(id) && !after)) continue
      await client.query('INSERT INTO "ProviderChange" (id, "providerId", "actorId", "beforeJson", "afterJson", "createdAt") VALUES (gen_random_uuid()::text, $1, $2, $3, $4, NOW())', [id, actorId, before.get(id) ?? 'null', afterJson])
    }
    await client.query('DELETE FROM "ProviderOverride" WHERE NOT (id = ANY($1::text[]))', [Object.keys(data.overrides)])
    for (const [id, settings] of Object.entries(data.overrides)) {
      await client.query('INSERT INTO "ProviderOverride" (id, "configJson", revision, "updatedAt") VALUES ($1, $2, 1, NOW()) ON CONFLICT (id) DO UPDATE SET "configJson" = EXCLUDED."configJson", revision = "ProviderOverride".revision + 1, "updatedAt" = NOW()', [id, JSON.stringify(settings)])
    }
    await client.query('INSERT INTO "ProviderConfigRevision" (id, revision, "updatedAt") VALUES (1, 1, NOW()) ON CONFLICT (id) DO UPDATE SET revision = "ProviderConfigRevision".revision + 1, "updatedAt" = NOW()')
    await client.query('COMMIT')
    return { rows: data.base.length, overrides: Object.keys(data.overrides).length, orders: data.orders }
  } catch (error) { await client.query('ROLLBACK'); throw error }
}
